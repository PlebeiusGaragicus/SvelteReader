"""Deep Research Agent - Multi-agent supervisor-researcher pattern.

This implements a best-in-class research agent inspired by open_deep_research.

Architecture:
    Main Graph:
        clarify_with_user -> write_research_brief -> research_supervisor -> final_report_generation
    
    Supervisor Subgraph:
        supervisor -> supervisor_tools (loops until ResearchComplete)
    
    Researcher Subgraph (spawned by supervisor):
        researcher -> researcher_tools -> compress_research

Flow:
1. clarify_with_user: Optionally ask clarifying questions
2. write_research_brief: Generate structured research brief
3. research_supervisor: Delegate research to parallel sub-researchers
4. final_report_generation: Synthesize all findings into final report
"""

from __future__ import annotations

import asyncio
import os
import uuid
from typing import Literal

from langchain_core.messages import (
    AIMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
    filter_messages,
    get_buffer_string,
)
from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

from src.deepresearch.configuration import Configuration, get_today_str
from src.deepresearch.prompts import (
    get_clarify_prompt,
    get_research_brief_prompt,
    get_supervisor_prompt,
    get_researcher_prompt,
    get_compression_prompt,
    get_final_report_prompt,
    COMPRESS_RESEARCH_SIMPLE_HUMAN_MESSAGE,
)
from src.deepresearch.state import (
    AgentInputState,
    DeepResearchState,
    SupervisorState,
    ResearcherState,
    ResearcherOutputState,
    ClarifyWithUser,
    ConductResearch,
    ResearchComplete,
    ResearchQuestion,
)
from src.deepresearch.tools import think_tool, web_search, RESEARCHER_TOOLS


# =============================================================================
# MODEL CREATION
# =============================================================================

def create_model(temperature: float = 0.7, max_tokens: int = 4096):
    """Create LLM model using OpenAI-compatible endpoint."""
    base_url = os.getenv("LLM_BASE_URL")
    api_key = os.getenv("LLM_API_KEY", "not-needed")
    model_name = os.getenv("LLM_MODEL")

    if not base_url:
        raise ValueError("LLM_BASE_URL environment variable is required")

    if not model_name:
        raise ValueError("LLM_MODEL environment variable is required")

    return ChatOpenAI(
        base_url=base_url,
        api_key=api_key,
        model=model_name,
        temperature=temperature,
        max_tokens=max_tokens,
        streaming=True,
    )


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_notes_from_tool_calls(messages):
    """Extract notes from tool call messages."""
    return [
        msg.content for msg in filter_messages(messages, include_types=["tool"])
        if msg.content
    ]


# =============================================================================
# MAIN GRAPH NODES
# =============================================================================

async def clarify_with_user(
    state: DeepResearchState, 
    config: RunnableConfig
) -> Command[Literal["write_research_brief"]]:
    """Analyze user messages and ask clarifying questions if needed.
    
    If clarification is disabled or not needed, proceeds directly to research.
    Uses interrupt() to pause and wait for user input when clarification is needed.
    
    Interrupt Format:
        When clarification is needed, the graph interrupts with:
        {
            "type": "clarification_request",
            "tool": "ask_user",
            "tool_call_id": "<uuid>",
            "question": "Your clarifying question here"
        }
        
        Client should resume with:
        {
            "response": "user's text response"
        }
    """
    configurable = Configuration.from_runnable_config(config)
    
    # Skip clarification if disabled
    if not configurable.allow_clarification:
        return Command(
            goto="write_research_brief",
            update={"research_phase": "planning"},
        )
    
    messages = state.get("messages", [])
    if not messages:
        return Command(goto="write_research_brief", update={"research_phase": "planning"})
    
    try:
        model = create_model(temperature=0.1)
        clarification_model = model.with_structured_output(ClarifyWithUser)
        
        prompt_content = get_clarify_prompt(get_buffer_string(messages))
        response = await clarification_model.ainvoke([HumanMessage(content=prompt_content)])
        
        if response.need_clarification:
            # Generate a unique tool_call_id for this clarification request
            tool_call_id = str(uuid.uuid4())
            
            print(f"[Clarify] Interrupting for clarification: {response.question[:50]}...")
            
            # Interrupt and wait for user response
            # The frontend will detect this interrupt and show the question
            user_response = interrupt({
                "type": "clarification_request",
                "tool": "ask_user",
                "tool_call_id": tool_call_id,
                "question": response.question,
            })
            
            print(f"[Clarify] Resumed with user response: {type(user_response)}")
            
            # Extract the user's response text
            clarification_text = _extract_clarification_response(user_response)
            
            # Add both the AI question and user's clarification to messages
            return Command(
                goto="write_research_brief",
                update={
                    "messages": [
                        AIMessage(content=response.question),
                        HumanMessage(content=clarification_text),
                    ],
                    "research_phase": "planning",
                },
            )
        else:
            # Proceed to research with verification message
            return Command(
                goto="write_research_brief",
                update={
                    "messages": [AIMessage(content=response.verification)],
                    "research_phase": "planning",
                },
            )
    except Exception as e:
        print(f"[Clarify] Error: {e}, proceeding to research")
        return Command(goto="write_research_brief", update={"research_phase": "planning"})


def _extract_clarification_response(resume_value) -> str:
    """Extract user response text from the resume value.
    
    Expected formats:
        { "response": "user's text" }
        OR just a string
        OR { "tool_results": [{ "content": "...", "tool_call_id": "..." }] }
    """
    if isinstance(resume_value, str):
        return resume_value
    
    if isinstance(resume_value, dict):
        # Handle tool_results format from resumeWithToolResults
        if "tool_results" in resume_value:
            tool_results = resume_value["tool_results"]
            if isinstance(tool_results, list) and len(tool_results) > 0:
                first_result = tool_results[0]
                if isinstance(first_result, dict) and "content" in first_result:
                    return first_result["content"]
        
        # Simple response format
        if "response" in resume_value:
            return resume_value["response"]
        
        # Direct content
        if "content" in resume_value:
            return resume_value["content"]
    
    # Fallback
    return str(resume_value)


async def write_research_brief(
    state: DeepResearchState, 
    config: RunnableConfig
) -> Command[Literal["research_supervisor"]]:
    """Transform user messages into a structured research brief."""
    configurable = Configuration.from_runnable_config(config)
    messages = state.get("messages", [])
    
    try:
        model = create_model(temperature=0.3)
        research_model = model.with_structured_output(ResearchQuestion)
        
        prompt_content = get_research_brief_prompt(get_buffer_string(messages))
        response = await research_model.ainvoke([HumanMessage(content=prompt_content)])
        
        # Initialize supervisor with research brief
        supervisor_prompt = get_supervisor_prompt(
            max_concurrent_research_units=configurable.max_concurrent_research_units,
            max_researcher_iterations=configurable.max_researcher_iterations,
        )
        
        print(f"[Brief] Generated research brief: {response.research_brief[:100]}...")
        
        return Command(
            goto="research_supervisor",
            update={
                "research_brief": response.research_brief,
                "research_phase": "researching",
                "supervisor_messages": {
                    "type": "override",
                    "value": [
                        SystemMessage(content=supervisor_prompt),
                        HumanMessage(content=response.research_brief),
                    ],
                },
            },
        )
    except Exception as e:
        print(f"[Brief] Error: {e}")
        # Fallback: use the last human message as brief
        user_query = ""
        for msg in reversed(messages):
            if isinstance(msg, HumanMessage):
                user_query = msg.content if isinstance(msg.content, str) else str(msg.content)
                break
        
        supervisor_prompt = get_supervisor_prompt()
        
        return Command(
            goto="research_supervisor",
            update={
                "research_brief": user_query,
                "research_phase": "researching",
                "supervisor_messages": {
                    "type": "override",
                    "value": [
                        SystemMessage(content=supervisor_prompt),
                        HumanMessage(content=user_query),
                    ],
                },
            },
        )


async def final_report_generation(
    state: DeepResearchState, 
    config: RunnableConfig
):
    """Generate the final comprehensive research report."""
    notes = state.get("notes", [])
    research_brief = state.get("research_brief", "")
    messages = state.get("messages", [])
    
    findings = "\n".join(notes) if notes else "No research findings available."
    
    try:
        model = create_model(temperature=0.5, max_tokens=8192)
        
        prompt = get_final_report_prompt(
            research_brief=research_brief,
            messages=get_buffer_string(messages),
            findings=findings,
        )
        
        print(f"[Report] Generating final report from {len(notes)} notes")
        
        response = await model.ainvoke([HumanMessage(content=prompt)])
        
        return {
            "final_report": response.content,
            "messages": [response],
            "research_phase": "complete",
            "notes": {"type": "override", "value": []},
        }
    except Exception as e:
        print(f"[Report] Error: {e}")
        error_report = f"Error generating final report: {str(e)}\n\nRaw findings:\n{findings[:2000]}"
        return {
            "final_report": error_report,
            "messages": [AIMessage(content=error_report)],
            "research_phase": "complete",
        }


# =============================================================================
# SUPERVISOR SUBGRAPH
# =============================================================================

async def supervisor(
    state: SupervisorState, 
    config: RunnableConfig
) -> Command[Literal["supervisor_tools"]]:
    """Research supervisor that plans and delegates research tasks."""
    configurable = Configuration.from_runnable_config(config)
    supervisor_messages = state.get("supervisor_messages", [])
    
    # Available tools: ConductResearch, ResearchComplete, think_tool
    lead_researcher_tools = [ConductResearch, ResearchComplete, think_tool]
    
    model = create_model(temperature=0.3)
    research_model = model.bind_tools(lead_researcher_tools)
    
    print(f"[Supervisor] Processing with {len(supervisor_messages)} messages")
    response = await research_model.ainvoke(supervisor_messages)
    
    return Command(
        goto="supervisor_tools",
        update={
            "supervisor_messages": [response],
            "research_iterations": state.get("research_iterations", 0) + 1,
        },
    )


async def supervisor_tools(
    state: SupervisorState, 
    config: RunnableConfig
) -> Command[Literal["supervisor", "__end__"]]:
    """Execute supervisor tool calls including research delegation."""
    configurable = Configuration.from_runnable_config(config)
    supervisor_messages = state.get("supervisor_messages", [])
    research_iterations = state.get("research_iterations", 0)
    most_recent_message = supervisor_messages[-1] if supervisor_messages else None
    
    # Exit conditions
    exceeded_iterations = research_iterations > configurable.max_researcher_iterations
    no_tool_calls = not most_recent_message or not getattr(most_recent_message, "tool_calls", None)
    research_complete = (
        most_recent_message and 
        hasattr(most_recent_message, "tool_calls") and
        any(tc.get("name") == "ResearchComplete" for tc in most_recent_message.tool_calls)
    )
    
    if exceeded_iterations or no_tool_calls or research_complete:
        print(f"[Supervisor] Exiting: iterations={exceeded_iterations}, no_tools={no_tool_calls}, complete={research_complete}")
        return Command(
            goto=END,
            update={
                "notes": get_notes_from_tool_calls(supervisor_messages),
                "research_brief": state.get("research_brief", ""),
            },
        )
    
    # Process tool calls
    all_tool_messages = []
    update_payload = {"supervisor_messages": []}
    
    tool_calls = most_recent_message.tool_calls
    
    # Handle think_tool calls
    think_calls = [tc for tc in tool_calls if tc.get("name") == "think_tool"]
    for tc in think_calls:
        reflection = tc.get("args", {}).get("reflection", "")
        all_tool_messages.append(ToolMessage(
            content=f"Reflection recorded: {reflection}",
            name="think_tool",
            tool_call_id=tc.get("id"),
        ))
    
    # Handle ConductResearch calls
    research_calls = [tc for tc in tool_calls if tc.get("name") == "ConductResearch"]
    
    if research_calls:
        # Limit concurrent research
        allowed_calls = research_calls[:configurable.max_concurrent_research_units]
        overflow_calls = research_calls[configurable.max_concurrent_research_units:]
        
        print(f"[Supervisor] Delegating {len(allowed_calls)} research tasks")
        
        # Execute research tasks in parallel
        research_tasks = [
            researcher_subgraph.ainvoke({
                "researcher_messages": [
                    HumanMessage(content=tc.get("args", {}).get("research_topic", "")),
                ],
                "research_topic": tc.get("args", {}).get("research_topic", ""),
                "tool_call_iterations": 0,
            }, config)
            for tc in allowed_calls
        ]
        
        try:
            tool_results = await asyncio.gather(*research_tasks, return_exceptions=True)
            
            for result, tc in zip(tool_results, allowed_calls):
                if isinstance(result, Exception):
                    content = f"Research error: {str(result)}"
                else:
                    content = result.get("compressed_research", "No research results")
                
                all_tool_messages.append(ToolMessage(
                    content=content,
                    name="ConductResearch",
                    tool_call_id=tc.get("id"),
                ))
            
            # Handle overflow
            for tc in overflow_calls:
                all_tool_messages.append(ToolMessage(
                    content=f"Error: Exceeded max concurrent research units ({configurable.max_concurrent_research_units}). Try again with fewer.",
                    name="ConductResearch",
                    tool_call_id=tc.get("id"),
                ))
            
            # Collect raw notes
            raw_notes = []
            for result in tool_results:
                if not isinstance(result, Exception):
                    raw_notes.extend(result.get("raw_notes", []))
            
            if raw_notes:
                update_payload["raw_notes"] = raw_notes
                
        except Exception as e:
            print(f"[Supervisor] Research error: {e}")
            return Command(
                goto=END,
                update={
                    "notes": get_notes_from_tool_calls(supervisor_messages),
                    "research_brief": state.get("research_brief", ""),
                },
            )
    
    update_payload["supervisor_messages"] = all_tool_messages
    return Command(goto="supervisor", update=update_payload)


# Build supervisor subgraph
supervisor_builder = StateGraph(SupervisorState, config_schema=Configuration)
supervisor_builder.add_node("supervisor", supervisor)
supervisor_builder.add_node("supervisor_tools", supervisor_tools)
supervisor_builder.add_edge(START, "supervisor")
supervisor_subgraph = supervisor_builder.compile()


# =============================================================================
# RESEARCHER SUBGRAPH
# =============================================================================

async def researcher(
    state: ResearcherState, 
    config: RunnableConfig
) -> Command[Literal["researcher_tools"]]:
    """Individual researcher conducting focused research on a topic."""
    configurable = Configuration.from_runnable_config(config)
    researcher_messages = state.get("researcher_messages", [])
    
    # Get research tools
    tools = [web_search, think_tool]
    
    model = create_model(temperature=0.3)
    research_model = model.bind_tools(tools)
    
    # Build prompt
    researcher_prompt = get_researcher_prompt()
    messages = [SystemMessage(content=researcher_prompt)] + list(researcher_messages)
    
    print(f"[Researcher] Researching: {state.get('research_topic', '')[:50]}...")
    response = await research_model.ainvoke(messages)
    
    return Command(
        goto="researcher_tools",
        update={
            "researcher_messages": [response],
            "tool_call_iterations": state.get("tool_call_iterations", 0) + 1,
        },
    )


async def researcher_tools(
    state: ResearcherState, 
    config: RunnableConfig
) -> Command[Literal["researcher", "compress_research"]]:
    """Execute researcher tool calls."""
    configurable = Configuration.from_runnable_config(config)
    researcher_messages = state.get("researcher_messages", [])
    most_recent_message = researcher_messages[-1] if researcher_messages else None
    
    # Exit if no tool calls
    if not most_recent_message or not getattr(most_recent_message, "tool_calls", None):
        return Command(goto="compress_research")
    
    tool_calls = most_recent_message.tool_calls
    
    # Execute tools
    tool_outputs = []
    for tc in tool_calls:
        tool_name = tc.get("name")
        tool_args = tc.get("args", {})
        tool_id = tc.get("id")
        
        try:
            if tool_name == "web_search":
                queries = tool_args.get("queries", [])
                if isinstance(queries, str):
                    queries = [queries]
                max_results = tool_args.get("max_results", 5)
                result = await web_search.ainvoke({"queries": queries, "max_results": max_results})
            elif tool_name == "think_tool":
                reflection = tool_args.get("reflection", "")
                result = f"Reflection recorded: {reflection}"
            else:
                result = f"Unknown tool: {tool_name}"
                
            tool_outputs.append(ToolMessage(
                content=str(result),
                name=tool_name,
                tool_call_id=tool_id,
            ))
        except Exception as e:
            tool_outputs.append(ToolMessage(
                content=f"Error: {str(e)}",
                name=tool_name,
                tool_call_id=tool_id,
            ))
    
    # Check exit conditions
    exceeded_iterations = state.get("tool_call_iterations", 0) >= configurable.max_react_tool_calls
    
    if exceeded_iterations:
        return Command(
            goto="compress_research",
            update={"researcher_messages": tool_outputs},
        )
    
    return Command(
        goto="researcher",
        update={"researcher_messages": tool_outputs},
    )


async def compress_research(state: ResearcherState, config: RunnableConfig):
    """Compress and synthesize research findings."""
    configurable = Configuration.from_runnable_config(config)
    researcher_messages = state.get("researcher_messages", [])
    
    # Add compression instruction
    researcher_messages = list(researcher_messages) + [
        HumanMessage(content=COMPRESS_RESEARCH_SIMPLE_HUMAN_MESSAGE)
    ]
    
    try:
        model = create_model(temperature=0.3, max_tokens=4096)
        
        compression_prompt = get_compression_prompt()
        messages = [SystemMessage(content=compression_prompt)] + researcher_messages
        
        response = await model.ainvoke(messages)
        
        # Extract raw notes
        raw_notes = [
            str(msg.content) 
            for msg in filter_messages(researcher_messages, include_types=["tool", "ai"])
            if msg.content
        ]
        
        print(f"[Researcher] Compressed research into {len(str(response.content))} chars")
        
        return {
            "compressed_research": str(response.content),
            "raw_notes": ["\n".join(raw_notes)],
        }
    except Exception as e:
        print(f"[Researcher] Compression error: {e}")
        raw_notes = [
            str(msg.content) 
            for msg in filter_messages(researcher_messages, include_types=["tool", "ai"])
            if msg.content
        ]
        return {
            "compressed_research": f"Error compressing research: {str(e)}",
            "raw_notes": ["\n".join(raw_notes)],
        }


# Build researcher subgraph
researcher_builder = StateGraph(
    ResearcherState, 
    output=ResearcherOutputState, 
    config_schema=Configuration,
)
researcher_builder.add_node("researcher", researcher)
researcher_builder.add_node("researcher_tools", researcher_tools)
researcher_builder.add_node("compress_research", compress_research)
researcher_builder.add_edge(START, "researcher")
researcher_builder.add_edge("compress_research", END)
researcher_subgraph = researcher_builder.compile()


# =============================================================================
# MAIN GRAPH CONSTRUCTION
# =============================================================================

deep_researcher_builder = StateGraph(
    DeepResearchState,
    input=AgentInputState,
    config_schema=Configuration,
)

# Add main workflow nodes
deep_researcher_builder.add_node("clarify_with_user", clarify_with_user)
deep_researcher_builder.add_node("write_research_brief", write_research_brief)
deep_researcher_builder.add_node("research_supervisor", supervisor_subgraph)
deep_researcher_builder.add_node("final_report_generation", final_report_generation)

# Define edges
deep_researcher_builder.add_edge(START, "clarify_with_user")
deep_researcher_builder.add_edge("research_supervisor", "final_report_generation")
deep_researcher_builder.add_edge("final_report_generation", END)

# Compile the graph (LangGraph API handles persistence automatically)
graph = deep_researcher_builder.compile()
