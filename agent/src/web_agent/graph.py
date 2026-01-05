"""LangGraph agent for SvelteReader Web Scrape mode.

This agent helps users search the web and get synthesized answers
with citations, similar to Perplexica.

Architecture:
1. User sends a query
2. Agent decides what to search for
3. Agent calls web_search and/or scrape_url tools
4. Agent synthesizes answer with citations
5. Response is streamed back to user
"""

from __future__ import annotations

import os
from typing import Annotated, Literal, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from src.web_agent.prompts import SYSTEM_PROMPT
from src.web_agent.tools import WEB_TOOLS


# =============================================================================
# STATE DEFINITIONS
# =============================================================================

class WebAgentState(TypedDict):
    """State for the web search agent."""
    messages: Annotated[list[BaseMessage], add_messages]
    tool_call_count: int  # Track tool calls to prevent infinite loops


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
            "Set it to your model name (e.g., llama3.2, mistral, gpt-4, etc.)"
        )

    return ChatOpenAI(
        base_url=base_url,
        api_key=api_key or "not-needed",  # Some endpoints don't require a key
        model=model_name,
        temperature=0.7,
        streaming=True,
    )


# =============================================================================
# GRAPH NODES
# =============================================================================

async def agent_node(state: WebAgentState, config: RunnableConfig) -> dict:
    """Process the user's message with the LLM.
    
    The model has access to web search and scrape tools.
    """
    try:
        model = create_model()
        
        # Bind tools to the model
        model_with_tools = model.bind_tools(WEB_TOOLS)
        
        # Build messages with system prompt
        messages = [SystemMessage(content=SYSTEM_PROMPT)] + state["messages"]
        
        print(f"[WebAgent] Invoking LLM with {len(state['messages'])} messages...")
        response = await model_with_tools.ainvoke(messages)
        
        has_tool_calls = bool(response.tool_calls) if hasattr(response, "tool_calls") else False
        print(f"[WebAgent] Response received. Has tool calls: {has_tool_calls}")
        
        return {"messages": [response]}
        
    except Exception as e:
        print(f"[WebAgent] LLM processing failed: {e}")
        return {
            "messages": [
                AIMessage(content=f"Sorry, I encountered an error: {str(e)}")
            ]
        }


# =============================================================================
# GRAPH ROUTING
# =============================================================================

MAX_TOOL_CALLS = 10  # Prevent infinite loops


def should_continue(state: WebAgentState) -> Literal["tools", "end"]:
    """Determine if the agent wants to call tools or is done."""
    messages = state.get("messages", [])
    if not messages:
        return "end"
    
    last_message = messages[-1]
    
    # Check tool call count
    tool_call_count = state.get("tool_call_count", 0)
    if tool_call_count >= MAX_TOOL_CALLS:
        print(f"[WebAgent] Max tool calls ({MAX_TOOL_CALLS}) reached, ending")
        return "end"
    
    # Check if the last message has tool calls
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        print(f"[WebAgent] Tool calls: {[tc['name'] for tc in last_message.tool_calls]}")
        return "tools"
    
    return "end"


def increment_tool_count(state: WebAgentState) -> dict:
    """Increment the tool call counter after tools execute."""
    current = state.get("tool_call_count", 0)
    # Count the number of tool calls in the last AI message
    messages = state.get("messages", [])
    increment = 0
    for msg in reversed(messages):
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            increment = len(msg.tool_calls)
            break
    return {"tool_call_count": current + increment}


# =============================================================================
# GRAPH CONSTRUCTION
# =============================================================================

# Create tool node
tool_node = ToolNode(WEB_TOOLS)


async def tools_with_count(state: WebAgentState, config: RunnableConfig) -> dict:
    """Execute tools and increment counter."""
    # Execute tools
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


# Build the graph
builder = StateGraph(WebAgentState)

# Add nodes
builder.add_node("agent", agent_node)
builder.add_node("tools", tools_with_count)

# Add edges
builder.add_edge("__start__", "agent")
builder.add_conditional_edges(
    "agent",
    should_continue,
    {"tools": "tools", "end": END},
)
builder.add_edge("tools", "agent")

# Compile the graph
graph = builder.compile()