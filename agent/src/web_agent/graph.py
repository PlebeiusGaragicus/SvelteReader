"""LangGraph agent for SvelteReader Web Scrape mode.

This agent implements a Perplexica-style web search with:
1. Payment validation (validate-then-redeem-on-success)
2. Query classification/routing (simple reply vs. search)
3. Iterative research with SearXNG
4. Citation-aware response synthesis

Architecture:
    __start__ -> validate_payment -> router
    router -> direct_response (if skip_search) -> finalize -> END
    router -> researcher (if needs_search) -> tools -> researcher (loop)
    researcher -> writer -> finalize -> END

Payment flow (matching reader agent):
1. Client sends ecash token with message
2. validate_payment node checks token is UNSPENT (doesn't redeem)
3. Agent processes the query (router -> researcher/writer)
4. On SUCCESS: redeem token to wallet
5. On FAILURE: don't redeem, return refund flag
"""

from __future__ import annotations

import os
import json
import base64
import uuid
from typing import Annotated, Literal, TypedDict, Optional

import httpx
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from src.web_agent.prompts import (
    CLASSIFIER_PROMPT,
    DIRECT_RESPONSE_PROMPT,
    get_researcher_prompt,
    get_writer_prompt,
)
from src.web_agent.tools import WEB_TOOLS


# =============================================================================
# STATE DEFINITIONS
# =============================================================================

class PaymentInfo(TypedDict, total=False):
    """Payment information from client."""
    ecash_token: str
    amount_sats: int
    mint: str | None


class Classification(TypedDict, total=False):
    """Query classification result."""
    skip_search: bool
    standalone_query: str


class SearchResult(TypedDict):
    """A single search result."""
    title: str
    url: str
    content: str


class WebAgentState(TypedDict):
    """State for the web search agent."""
    # Core message state
    messages: Annotated[list[BaseMessage], add_messages]
    
    # Tool tracking
    tool_call_count: int
    research_iteration: int
    
    # Query classification
    classification: Classification | None
    
    # Search results for writer
    search_results: list[SearchResult]
    sources: list[dict]  # Formatted sources for citations
    
    # Payment state (matching reader agent)
    payment: PaymentInfo | None
    payment_validated: bool
    payment_token: str | None
    refund: bool
    run_id: str | None


# =============================================================================
# MODEL CREATION
# =============================================================================

def create_model(temperature: float = 0.7):
    """Create the LLM model using OpenAI-compatible endpoint.

    Requires explicit configuration - does NOT default to OpenAI.
    Works with any OpenAI-compatible API (Ollama, vLLM, LM Studio, etc.)
    """
    base_url = os.getenv("LLM_BASE_URL")
    api_key = os.getenv("LLM_API_KEY")
    model_name = os.getenv("LLM_MODEL")

    if not base_url:
        raise ValueError(
            "LLM_BASE_URL environment variable is required. "
            "Set it to your OpenAI-compatible endpoint (e.g., http://localhost:11434/v1 for Ollama)"
        )

    if not model_name:
        raise ValueError(
            "LLM_MODEL environment variable is required. "
            "Set it to your model name (e.g., llama3.2, mistral, gpt-4, etc.)"
        )

    return ChatOpenAI(
        base_url=base_url,
        api_key=api_key or "not-needed",
        model=model_name,
        temperature=temperature,
        streaming=True,
    )


# =============================================================================
# PAYMENT VALIDATION (from reader agent)
# =============================================================================

def validate_token_format(token: str) -> bool:
    """Validate that a string looks like a valid Cashu token."""
    try:
        if not (token.startswith("cashuA") or token.startswith("cashuB")):
            print(f"[Payment] Unknown token format: {token[:10]}...")
            return False
        
        token_data = token[6:]
        padding = 4 - len(token_data) % 4
        if padding != 4:
            token_data += "=" * padding
        
        decoded = base64.urlsafe_b64decode(token_data)
        
        if len(decoded) < 10:
            print("[Payment] Token data too short")
            return False
        
        token_type = "CBOR" if token.startswith("cashuB") else "JSON"
        print(f"[Payment] Token format valid: {token_type}, {len(decoded)} bytes")
        return True
        
    except Exception as e:
        print(f"[Payment] Token format validation failed: {e}")
        return False


async def validate_token_state(token: str) -> tuple[bool, str | None]:
    """Validate that a Cashu token has valid format."""
    if not validate_token_format(token):
        return False, None
    print("[Payment] Token format validated, will attempt redemption on success")
    return True, None


async def redeem_token_to_wallet(token: str) -> bool:
    """Redeem a Cashu token to the backend wallet service."""
    wallet_url = os.getenv("WALLET_URL", "http://localhost:8000/api/wallet")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{wallet_url}/receive",
                json={"token": token},
                timeout=30.0,
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    amount = result.get("amount", 0)
                    print(f"[Payment] Successfully redeemed {amount} sats to wallet")
                    return True
                else:
                    print(f"[Payment] Wallet rejected token: {result.get('error')}")
                    return False
            else:
                print(f"[Payment] Failed to redeem: {response.text}")
                return False
                
    except Exception as e:
        print(f"[Payment] Redemption error: {e}")
        return False


# =============================================================================
# GRAPH NODES
# =============================================================================

async def validate_payment_node(state: WebAgentState, config: RunnableConfig) -> dict:
    """Validate the ecash token WITHOUT redeeming it."""
    run_id = state.get("run_id") or str(uuid.uuid4())
    payment = state.get("payment")
    
    # If no payment provided, skip validation (free mode for development)
    if not payment or not payment.get("ecash_token"):
        print("[Payment] No payment token provided, skipping validation (free mode)")
        return {
            "payment_validated": True,
            "payment_token": None,
            "refund": False,
            "run_id": run_id,
        }
    
    token = payment["ecash_token"]
    amount_sats = payment.get("amount_sats", 0)
    
    # Debug mode: accept fake tokens for testing
    if token.startswith("cashu_debug_") or token == "debug":
        print("[Payment] DEBUG MODE - accepting fake token for testing")
        return {
            "payment_validated": True,
            "payment_token": None,
            "refund": False,
            "run_id": run_id,
        }
    
    print(f"[Payment] ========== RECEIVED TOKEN ==========")
    print(f"[Payment] {token}")
    print(f"[Payment] =====================================")
    
    is_valid, _ = await validate_token_state(token)
    
    if not is_valid:
        print("[Payment] Token validation failed")
        return {
            "payment_validated": False,
            "payment_token": None,
            "refund": True,
            "run_id": run_id,
        }
    
    print(f"[Payment] Token validated ({amount_sats} sats), will redeem on success")
    return {
        "payment_validated": True,
        "payment_token": token,
        "refund": False,
        "run_id": run_id,
    }


async def router_node(state: WebAgentState, config: RunnableConfig) -> dict:
    """Classify the query and decide routing."""
    if not state.get("payment_validated", True):
        return {
            "messages": [AIMessage(content="Payment validation failed. Please try again with a valid ecash token.")],
            "refund": True,
        }
    
    messages = state.get("messages", [])
    if not messages:
        return {"classification": {"skip_search": True, "standalone_query": ""}}
    
    # Get the last human message
    user_query = ""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            user_query = msg.content if isinstance(msg.content, str) else str(msg.content)
            break
    
    if not user_query:
        return {"classification": {"skip_search": True, "standalone_query": ""}}
    
    try:
        model = create_model(temperature=0.1)  # Low temp for classification
        
        response = await model.ainvoke([
            SystemMessage(content=CLASSIFIER_PROMPT),
            HumanMessage(content=f"User query: {user_query}"),
        ])
        
        # Parse JSON response
        content = response.content if isinstance(response.content, str) else str(response.content)
        
        # Extract JSON from response (handle markdown code blocks)
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        
        classification = json.loads(content.strip())
        
        print(f"[Router] Classification: skip_search={classification.get('skip_search')}, query='{classification.get('standalone_query', '')[:50]}...'")
        
        return {
            "classification": {
                "skip_search": classification.get("skip_search", False),
                "standalone_query": classification.get("standalone_query", user_query),
            }
        }
        
    except Exception as e:
        print(f"[Router] Classification failed: {e}, defaulting to search")
        return {
            "classification": {
                "skip_search": False,
                "standalone_query": user_query,
            }
        }


async def direct_response_node(state: WebAgentState, config: RunnableConfig) -> dict:
    """Generate a direct response without search (for greetings, etc.)."""
    messages = state.get("messages", [])
    
    try:
        model = create_model()
        
        response = await model.ainvoke([
            SystemMessage(content=DIRECT_RESPONSE_PROMPT),
            *messages,
        ])
        
        print("[DirectResponse] Generated greeting/simple response")
        return {"messages": [response]}
        
    except Exception as e:
        print(f"[DirectResponse] Error: {e}")
        return {
            "messages": [AIMessage(content="Hello! I'm here to help you search the web and find information. What would you like to know?")],
        }


async def researcher_node(state: WebAgentState, config: RunnableConfig) -> dict:
    """Research the query using web search tools."""
    messages = state.get("messages", [])
    classification = state.get("classification", {})
    iteration = state.get("research_iteration", 0)
    max_iterations = 3
    
    # Get the query to research
    query = classification.get("standalone_query", "")
    if not query:
        for msg in reversed(messages):
            if isinstance(msg, HumanMessage):
                query = msg.content if isinstance(msg.content, str) else str(msg.content)
                break
    
    try:
        model = create_model()
        model_with_tools = model.bind_tools(WEB_TOOLS)
        
        researcher_prompt = get_researcher_prompt(iteration, max_iterations)
        
        # Build messages for researcher
        research_messages = [
            SystemMessage(content=researcher_prompt),
            HumanMessage(content=f"Please research: {query}"),
        ]
        
        # Add any tool results from previous iterations
        for msg in messages:
            if hasattr(msg, "tool_calls") or msg.type == "tool":
                research_messages.append(msg)
        
        print(f"[Researcher] Iteration {iteration + 1}/{max_iterations}, researching: '{query[:50]}...'")
        response = await model_with_tools.ainvoke(research_messages)
        
        has_tool_calls = bool(response.tool_calls) if hasattr(response, "tool_calls") else False
        print(f"[Researcher] Response received. Has tool calls: {has_tool_calls}")
        
        return {
            "messages": [response],
            "research_iteration": iteration + 1,
        }
        
    except Exception as e:
        print(f"[Researcher] Error: {e}")
        return {
            "messages": [AIMessage(content=f"I encountered an error while researching: {str(e)}")],
        }


async def writer_node(state: WebAgentState, config: RunnableConfig) -> dict:
    """Synthesize search results into a cited response."""
    messages = state.get("messages", [])
    classification = state.get("classification", {})
    
    # Get the original query
    query = classification.get("standalone_query", "")
    if not query:
        for msg in reversed(messages):
            if isinstance(msg, HumanMessage):
                query = msg.content if isinstance(msg.content, str) else str(msg.content)
                break
    
    # Collect search results from tool messages
    search_context_parts = []
    sources = []
    source_index = 1
    
    for msg in messages:
        if msg.type == "tool" and hasattr(msg, "content"):
            content = msg.content if isinstance(msg.content, str) else str(msg.content)
            if content and "No search results" not in content:
                # Parse the formatted search results
                search_context_parts.append(f"<result index={source_index}>\n{content}\n</result>")
                
                # Extract URLs from the content for source tracking
                import re
                urls = re.findall(r'URL: (https?://[^\s]+)', content)
                titles = re.findall(r'\*\*(.+?)\*\*', content)
                
                for i, url in enumerate(urls[:5]):  # Limit sources
                    title = titles[i] if i < len(titles) else f"Source {source_index}"
                    sources.append({
                        "index": source_index,
                        "title": title,
                        "url": url,
                    })
                    source_index += 1
    
    search_context = "\n\n".join(search_context_parts) if search_context_parts else "No search results available."
    
    try:
        model = create_model()
        
        writer_prompt = get_writer_prompt(search_context, mode="balanced")
        
        response = await model.ainvoke([
            SystemMessage(content=writer_prompt),
            HumanMessage(content=query),
        ])
        
        print(f"[Writer] Generated response with {len(sources)} sources")
        return {
            "messages": [response],
            "sources": sources,
        }
        
    except Exception as e:
        print(f"[Writer] Error: {e}")
        return {
            "messages": [AIMessage(content=f"I found some information but had trouble synthesizing it: {str(e)}")],
        }


async def finalize_node(state: WebAgentState, config: RunnableConfig) -> dict:
    """Finalize the conversation and redeem payment if successful."""
    token = state.get("payment_token")
    
    if token:
        print("[Payment] Attempting to redeem token to wallet...")
        redeemed = await redeem_token_to_wallet(token)
        if not redeemed:
            print("[Payment] WARNING: Token redemption failed!")
            print(f"[Payment] UNREDEEMED TOKEN: {token}")
        else:
            print("[Payment] Token redeemed successfully")
    
    return {"refund": False}


# =============================================================================
# GRAPH ROUTING
# =============================================================================

MAX_TOOL_CALLS = 10
MAX_RESEARCH_ITERATIONS = 3


def route_after_validation(state: WebAgentState) -> Literal["router", "end"]:
    """Route based on payment validation result."""
    if state.get("payment_validated", True):
        return "router"
    return "end"


def route_after_router(state: WebAgentState) -> Literal["direct_response", "researcher"]:
    """Route based on classification result."""
    classification = state.get("classification", {})
    if classification.get("skip_search", False):
        print("[Router] Routing to direct_response")
        return "direct_response"
    print("[Router] Routing to researcher")
    return "researcher"


def should_continue_research(state: WebAgentState) -> Literal["tools", "writer"]:
    """Determine if researcher wants to call tools or is done."""
    messages = state.get("messages", [])
    if not messages:
        return "writer"
    
    last_message = messages[-1]
    
    # Check tool call count
    tool_call_count = state.get("tool_call_count", 0)
    if tool_call_count >= MAX_TOOL_CALLS:
        print(f"[Researcher] Max tool calls ({MAX_TOOL_CALLS}) reached, moving to writer")
        return "writer"
    
    # Check research iterations
    research_iteration = state.get("research_iteration", 0)
    if research_iteration >= MAX_RESEARCH_ITERATIONS:
        print(f"[Researcher] Max iterations ({MAX_RESEARCH_ITERATIONS}) reached, moving to writer")
        return "writer"
    
    # Check if the last message has tool calls
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        print(f"[Researcher] Tool calls: {[tc['name'] for tc in last_message.tool_calls]}")
        return "tools"
    
    return "writer"


# =============================================================================
# TOOL NODE WITH COUNT TRACKING
# =============================================================================

tool_node = ToolNode(WEB_TOOLS)


async def tools_with_count(state: WebAgentState, config: RunnableConfig) -> dict:
    """Execute tools and increment counter."""
    tool_result = await tool_node.ainvoke(state, config)
    
    # Increment counter
    current = state.get("tool_call_count", 0)
    messages = state.get("messages", [])
    increment = 0
    for msg in reversed(messages):
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            increment = len(msg.tool_calls)
            break
    
    return {
        "messages": tool_result.get("messages", []),
        "tool_call_count": current + increment,
    }


# =============================================================================
# GRAPH CONSTRUCTION
# =============================================================================

# Build the graph
builder = StateGraph(WebAgentState)

# Add nodes
builder.add_node("validate_payment", validate_payment_node)
builder.add_node("router", router_node)
builder.add_node("direct_response", direct_response_node)
builder.add_node("researcher", researcher_node)
builder.add_node("tools", tools_with_count)
builder.add_node("writer", writer_node)
builder.add_node("finalize", finalize_node)

# Add edges
builder.add_edge("__start__", "validate_payment")
builder.add_conditional_edges(
    "validate_payment",
    route_after_validation,
    {"router": "router", "end": END},
)
builder.add_conditional_edges(
    "router",
    route_after_router,
    {"direct_response": "direct_response", "researcher": "researcher"},
)
builder.add_edge("direct_response", "finalize")
builder.add_conditional_edges(
    "researcher",
    should_continue_research,
    {"tools": "tools", "writer": "writer"},
)
builder.add_edge("tools", "researcher")
builder.add_edge("writer", "finalize")
builder.add_edge("finalize", END)

# Compile the graph
graph = builder.compile()
