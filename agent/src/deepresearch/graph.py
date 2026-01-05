"""DeepResearch Agent graph definition.

A research-focused agent that can search the web, analyze findings,
and produce comprehensive research outputs.

Architecture:
- Uses LangGraph's StateGraph for the agent flow
- Interrupts before client-side tool execution (file operations)
- Server-side execution for search and thinking tools
"""

import os
import uuid
from typing import Literal

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.memory import MemorySaver

from src.shared.models import get_model
from src.deepresearch.state import DeepResearchState
from src.deepresearch.prompts import get_research_system_prompt
from src.deepresearch.tools import SERVER_TOOLS, CLIENT_TOOLS, RESEARCH_TOOLS


# =============================================================================
# CONFIGURATION
# =============================================================================

MAX_ITERATIONS = int(os.getenv("MAX_RESEARCH_ITERATIONS", "10"))


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_thread_id(config: RunnableConfig | None) -> str:
    """Extract thread_id from LangGraph config."""
    if config is None:
        return "unknown"
    configurable = config.get("configurable", {})
    return configurable.get("thread_id", "unknown")


def is_client_tool(tool_name: str) -> bool:
    """Check if a tool requires client-side execution."""
    client_tool_names = {t.name for t in CLIENT_TOOLS}
    return tool_name in client_tool_names


# =============================================================================
# GRAPH NODES
# =============================================================================

async def agent_node(state: DeepResearchState, config: RunnableConfig) -> dict:
    """Process the user's message with the LLM.
    
    The model has access to research and file tools.
    Server tools execute directly, client tools cause an interrupt.
    """
    thread_id = get_thread_id(config)
    run_id = state.get("run_id") or str(uuid.uuid4())
    
    try:
        model = get_model(temperature=0.0)
        
        # Bind all tools to the model
        model_with_tools = model.bind_tools(RESEARCH_TOOLS)
        
        # Build system prompt
        system_prompt = get_research_system_prompt(include_workflow=True)
        
        # Add project context if available
        project_files = state.get("project_files", [])
        if project_files:
            files_context = "\n## Project Files\n"
            for f in project_files:
                files_context += f"- {f.get('title', 'Untitled')} (ID: {f.get('id')})\n"
            system_prompt += files_context
        
        messages = [SystemMessage(content=system_prompt)] + list(state["messages"])
        
        print(f"[DeepResearch] Invoking LLM... ({len(state['messages'])} messages)")
        response = await model_with_tools.ainvoke(messages)
        print(f"[DeepResearch] Response received. Tool calls: {bool(response.tool_calls)}")
        
        return {
            "messages": [response],
            "run_id": run_id,
        }
        
    except Exception as e:
        print(f"[DeepResearch] Error: {e}")
        return {
            "messages": [AIMessage(content=f"Sorry, I encountered an error: {str(e)}")],
            "run_id": run_id,
        }


async def server_tools_node(state: DeepResearchState, config: RunnableConfig) -> dict:
    """Execute server-side tools (search, think).
    
    This node handles tools that can be executed on the server without
    client interaction.
    """
    messages = state.get("messages", [])
    if not messages:
        return {"messages": []}
    
    last_message = messages[-1]
    if not hasattr(last_message, "tool_calls") or not last_message.tool_calls:
        return {"messages": []}
    
    # Only process server-side tools
    tool_results = []
    tool_node = ToolNode(SERVER_TOOLS)
    
    for tool_call in last_message.tool_calls:
        if not is_client_tool(tool_call["name"]):
            # Execute the tool
            try:
                # Find the tool and execute it
                for tool in SERVER_TOOLS:
                    if tool.name == tool_call["name"]:
                        result = await tool.ainvoke(tool_call["args"])
                        tool_results.append(ToolMessage(
                            content=str(result),
                            tool_call_id=tool_call["id"],
                            name=tool_call["name"],
                        ))
                        break
            except Exception as e:
                tool_results.append(ToolMessage(
                    content=f"Error: {str(e)}",
                    tool_call_id=tool_call["id"],
                    name=tool_call["name"],
                ))
    
    return {"messages": tool_results} if tool_results else {"messages": []}


# =============================================================================
# GRAPH ROUTING
# =============================================================================

def should_continue(state: DeepResearchState, config: RunnableConfig) -> Literal["server_tools", "client_tools", "end"]:
    """Determine next step based on tool calls in the last message."""
    messages = state.get("messages", [])
    if not messages:
        return "end"
    
    last_message = messages[-1]
    
    # Check if we have tool calls
    if not hasattr(last_message, "tool_calls") or not last_message.tool_calls:
        return "end"
    
    # Check what types of tools are being called
    has_client_tools = False
    has_server_tools = False
    
    for tool_call in last_message.tool_calls:
        if is_client_tool(tool_call["name"]):
            has_client_tools = True
        else:
            has_server_tools = True
    
    # Prioritize server tools first
    if has_server_tools:
        return "server_tools"
    
    # Then client tools (will interrupt)
    if has_client_tools:
        return "client_tools"
    
    return "end"


def after_server_tools(state: DeepResearchState) -> Literal["agent"]:
    """After server tools, return to agent."""
    return "agent"


def after_client_tools(state: DeepResearchState) -> Literal["agent"]:
    """After client tools execute, return to agent."""
    return "agent"


# =============================================================================
# GRAPH CONSTRUCTION
# =============================================================================

def create_deepresearch_agent(
    checkpointer=None,
    debug: bool = False,
):
    """Create the DeepResearch agent graph.
    
    Args:
        checkpointer: Optional checkpointer for persistence
        debug: Enable debug logging
        
    Returns:
        Compiled graph ready for invoke/stream
    """
    # Create client tools node (for interrupt)
    client_tool_node = ToolNode(CLIENT_TOOLS)
    
    # Build the graph
    builder = StateGraph(DeepResearchState)
    
    # Add nodes
    builder.add_node("agent", agent_node)
    builder.add_node("server_tools", server_tools_node)
    builder.add_node("client_tools", client_tool_node)
    
    # Add edges
    builder.add_edge("__start__", "agent")
    builder.add_conditional_edges(
        "agent",
        should_continue,
        {
            "server_tools": "server_tools",
            "client_tools": "client_tools",
            "end": END,
        },
    )
    builder.add_edge("server_tools", "agent")
    builder.add_edge("client_tools", "agent")
    
    # Compile with interrupt before client tools
    compiled = builder.compile(
        checkpointer=checkpointer,
        interrupt_before=["client_tools"],
        debug=debug,
    )
    
    return compiled


# =============================================================================
# GRAPH EXPORT
# =============================================================================

# Default graph for LangGraph deployment with in-memory checkpointing
graph = create_deepresearch_agent(checkpointer=MemorySaver())

