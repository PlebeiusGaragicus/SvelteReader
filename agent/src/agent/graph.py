"""LangGraph agent for the SvelteReader AI chat assistant.

This agent helps users discuss and analyze passages from their ebooks.
It receives context about highlighted text and user notes, then provides
intelligent responses about the content.

Architecture: Agent-Driven RAG with Client-Side Tool Execution
1. Agent decides when to search/retrieve from the book
2. Tools are defined as stubs - execution happens on the client
3. Graph uses interrupt_before=["tools"] to pause before tool execution
4. Client executes tools locally (EPUB access, vector search)
5. Client resumes graph with tool results

Payment flow (validate-then-redeem-on-success):
1. Client sends ecash token with message
2. validate_payment node checks token is UNSPENT (doesn't redeem)
3. agent node processes the LLM request (may call tools)
4. On SUCCESS: redeem token to wallet
5. On FAILURE: don't redeem, return refund flag so client can self-recover

See docs/ecash-payment-flow.md for full payment design.
"""

from __future__ import annotations

import os
import httpx
import json
import base64
from typing import Annotated, Literal, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode


# =============================================================================
# TOOL DEFINITIONS (Client-Executed)
# These tools are stubs - the actual execution happens on the client.
# The graph interrupts before the tools node, client executes, then resumes.
# =============================================================================

@tool
def get_table_of_contents() -> str:
    """Get the table of contents. Usually NOT needed - the TOC with chapter_ids is already in your system prompt under 'BOOK INFORMATION'."""
    # Never actually called - graph interrupts before execution
    return ""


@tool
def get_book_metadata() -> str:
    """Get book metadata (title, author, page count). Usually NOT needed - this info is already in your system prompt."""
    return ""


@tool
def get_chapter(chapter_id: str) -> str:
    """Read a chapter's full text content.
    
    IMPORTANT: Use the EXACT chapter_id from the Table of Contents in your system prompt.
    Example IDs look like: "chapter-1.xhtml", "ch01.html", "part1.xhtml"
    
    Args:
        chapter_id: The exact chapter_id string from the Table of Contents (e.g. "chapter-1.xhtml")
    
    Returns: The chapter's full text. Long chapters may be truncated.
    """
    return ""


@tool
def search_book(query: str, top_k: int = 5) -> str:
    """Semantic search across the entire book to find relevant passages.
    
    Use this to find:
    - Specific topics or themes
    - Quotes or references
    - Where a concept is discussed
    
    Args:
        query: What you're looking for (e.g. "discussion of freedom", "character introduction")
        top_k: Number of results (default 5, max 20)
    
    Returns: Relevant text passages with their chapter locations and relevance scores.
    """
    return ""


# All tools that require client-side execution
CLIENT_TOOLS = [get_table_of_contents, get_book_metadata, get_chapter, search_book]


# =============================================================================
# STATE DEFINITIONS
# =============================================================================

class PaymentInfo(TypedDict, total=False):
    """Payment information from client."""
    ecash_token: str  # Cashu ecash token
    amount_sats: int  # Expected amount in sats
    mint: str | None  # Mint URL


class PassageContext(TypedDict, total=False):
    """Context about the passage being discussed."""
    text: str  # The highlighted text from the book
    note: str | None  # User's note about the passage
    book_title: str | None  # Title of the book
    chapter: str | None  # Current chapter


class AgentState(TypedDict):
    """State for the reader assistant agent."""
    messages: Annotated[list[BaseMessage], add_messages]
    passage_context: PassageContext | None
    book_id: str | None  # Current book ID for tool execution
    book_context: str | None  # Pre-formatted book context (TOC, metadata) from client
    payment: PaymentInfo | None
    payment_validated: bool  # Token checked but not redeemed
    payment_token: str | None  # Token to redeem on success
    refund: bool  # Signal client to self-redeem on error


# =============================================================================
# SYSTEM PROMPT
# =============================================================================

def get_system_prompt(
    passage_context: PassageContext | None,
    book_context: str | None
) -> str:
    """Generate a system prompt based on the passage and book context."""
    base_prompt = """You are a reading assistant with access to the user's ebook.

You have tools to explore the book:
- get_chapter(chapter_id): Read a full chapter's content. Use the EXACT chapter_id from the table of contents below.
- search_book(query): Semantic search across the entire book. Use this to find specific topics or quotes.
- get_book_metadata(): Get book title, author, and page count.
- get_table_of_contents(): Get chapter list (usually not needed since TOC is provided below).

IMPORTANT GUIDELINES:
1. ALWAYS use the exact chapter_id values from the Table of Contents below when calling get_chapter()
2. For summarization: retrieve specific chapters using get_chapter() with the IDs from the TOC
3. For finding topics/quotes: use search_book() first to locate relevant passages
4. Cite your sources with chapter names
5. Long chapters may be truncated - use search_book() to find specific content within them
6. Don't guess chapter IDs - only use ones from the Table of Contents

Be concise but thorough. If you can't find information in the book, say so clearly."""

    # Add book context (TOC, metadata) - this is the key info the agent needs
    if book_context:
        base_prompt += f"\n\n=== BOOK INFORMATION ===\n{book_context}\n=== END BOOK INFO ==="

    # Add passage context if user highlighted text
    if passage_context:
        context_parts = []
        if passage_context.get("book_title"):
            context_parts.append(f"Book: {passage_context['book_title']}")
        if passage_context.get("chapter"):
            context_parts.append(f"Current Chapter: {passage_context['chapter']}")
        if passage_context.get("text"):
            context_parts.append(f'\nHighlighted passage:\n"{passage_context["text"]}"')
        if passage_context.get("note"):
            context_parts.append(f"\nUser's note: {passage_context['note']}")

        if context_parts:
            base_prompt += "\n\n--- User's Current Selection ---\n" + "\n".join(context_parts)

    return base_prompt


# =============================================================================
# MODEL CREATION
# =============================================================================

def create_model():
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
            "Set it to your model name (e.g., llama3.2, mistral, etc.)"
        )

    return ChatOpenAI(
        base_url=base_url,
        api_key=api_key or "not-needed",  # Some endpoints don't require a key
        model=model_name,
        temperature=0.7,
        streaming=True,
    )


# =============================================================================
# PAYMENT VALIDATION
# =============================================================================

def validate_token_format(token: str) -> bool:
    """Validate that a string looks like a valid Cashu token.
    
    Cashu tokens have two formats:
    - cashuA: base64url encoded JSON
    - cashuB: base64url encoded CBOR (binary)
    
    We just check the prefix and that it's valid base64url.
    Actual validation happens when nutstash tries to redeem it.
    """
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

async def validate_payment_node(state: AgentState) -> dict:
    """Validate the ecash token WITHOUT redeeming it."""
    payment = state.get("payment")
    
    # If no payment provided, skip validation (free mode for development)
    if not payment or not payment.get("ecash_token"):
        print("[Payment] No payment token provided, skipping validation (free mode)")
        return {
            "payment_validated": True,
            "payment_token": None,
            "refund": False,
        }
    
    token = payment["ecash_token"]
    
    # Debug mode: accept fake tokens for testing without losing funds
    if token.startswith("cashu_debug_") or token == "debug":
        print("[Payment] DEBUG MODE - accepting fake token for testing")
        return {
            "payment_validated": True,
            "payment_token": None,  # Don't try to redeem debug tokens
            "refund": False,
        }
    
    print(f"[Payment] ========== RECEIVED TOKEN (for recovery) ==========")
    print(f"[Payment] {token}")
    print(f"[Payment] ====================================================")
    
    is_valid, mint_url = await validate_token_state(token)
    
    if not is_valid:
        print("[Payment] Token validation failed - client should still have valid token")
        return {
            "payment_validated": False,
            "payment_token": None,
            "refund": True,
        }
    
    print(f"[Payment] Token validated, will redeem on success")
    return {
        "payment_validated": True,
        "payment_token": token,
        "refund": False,
    }


async def agent_node(state: AgentState) -> dict:
    """Process the user's message with the LLM.
    
    The model has access to tools for book retrieval.
    Tool calls will cause an interrupt - client executes them.
    """
    if not state.get("payment_validated", True):
        return {
            "messages": [AIMessage(content="Payment validation failed. Please try again with a valid ecash token.")],
            "refund": True,
        }
    
    try:
        model = create_model()
        
        # Bind tools to the model
        model_with_tools = model.bind_tools(CLIENT_TOOLS)
        
        # Build messages with system prompt (includes book context with TOC)
        system_prompt = get_system_prompt(
            state.get("passage_context"),
            state.get("book_context")
        )
        messages = [SystemMessage(content=system_prompt)] + state["messages"]
        
        # Log book context availability for debugging
        has_book_context = bool(state.get("book_context"))
        print(f"[Agent] Invoking LLM... (book_context: {has_book_context})")
        response = await model_with_tools.ainvoke(messages)
        print(f"[Agent] LLM response received. Has tool calls: {bool(response.tool_calls)}")
        
        return {"messages": [response]}
        
    except Exception as e:
        print(f"[Agent] LLM processing failed: {e}")
        token = state.get("payment_token")
        if token:
            print("[Payment] ========== REFUNDABLE TOKEN ==========")
            print(f"[Payment] {token}")
            print("[Payment] ========================================")
        return {
            "messages": [AIMessage(content=f"Sorry, I encountered an error processing your request. Your payment has not been taken - please try again.")],
            "refund": True,
        }


async def finalize_node(state: AgentState) -> dict:
    """Finalize the conversation and redeem payment if successful."""
    token = state.get("payment_token")
    
    if token:
        print("[Payment] Attempting to redeem token to wallet...")
        redeemed = await redeem_token_to_wallet(token)
        if not redeemed:
            print("[Payment] !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
            print("[Payment] WARNING: Conversation succeeded but token redemption failed!")
            print("[Payment] UNREDEEMED TOKEN - MANUAL RECOVERY NEEDED:")
            print(f"[Payment] {token}")
            print("[Payment] !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
        else:
            print("[Payment] Token redeemed successfully")
    
    return {"refund": False}


# =============================================================================
# GRAPH ROUTING
# =============================================================================

def route_after_validation(state: AgentState) -> Literal["agent", "end"]:
    """Route based on payment validation result."""
    if state.get("payment_validated", True):
        return "agent"
    return "end"


def should_continue(state: AgentState) -> Literal["tools", "finalize"]:
    """Determine if the agent wants to call tools or is done."""
    messages = state.get("messages", [])
    if not messages:
        return "finalize"
    
    last_message = messages[-1]
    
    # Check if the last message has tool calls
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        print(f"[Agent] Tool calls detected: {[tc['name'] for tc in last_message.tool_calls]}")
        return "tools"
    
    return "finalize"


def route_after_tools(state: AgentState) -> Literal["agent"]:
    """After tools execute, always go back to agent for next step."""
    return "agent"


# =============================================================================
# GRAPH CONSTRUCTION
# =============================================================================

# Create tool node for client-executed tools
tool_node = ToolNode(CLIENT_TOOLS)

# Build the graph
builder = StateGraph(AgentState)

# Add nodes
builder.add_node("validate_payment", validate_payment_node)
builder.add_node("agent", agent_node)
builder.add_node("tools", tool_node)
builder.add_node("finalize", finalize_node)

# Add edges
builder.add_edge("__start__", "validate_payment")
builder.add_conditional_edges(
    "validate_payment",
    route_after_validation,
    {"agent": "agent", "end": END},
)
builder.add_conditional_edges(
    "agent",
    should_continue,
    {"tools": "tools", "finalize": "finalize"},
)
builder.add_edge("tools", "agent")
builder.add_edge("finalize", END)

# Compile the graph WITH interrupt_before tools
# This causes the graph to pause before executing tools,
# allowing the client to execute them locally and resume
graph = builder.compile(interrupt_before=["tools"])
