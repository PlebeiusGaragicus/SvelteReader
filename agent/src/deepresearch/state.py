"""State definitions for the Deep Research Agent.

Implements a supervisor-researcher multi-agent pattern inspired by open_deep_research.

Architecture:
- AgentState: Main agent state for the full research workflow
- SupervisorState: State for the research supervisor managing parallel researchers
- ResearcherState: State for individual researchers conducting focused research
"""

import operator
from typing import Annotated, Literal, Optional

from langchain_core.messages import BaseMessage, MessageLikeRepresentation
from langgraph.graph import MessagesState
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field
from typing_extensions import TypedDict, NotRequired

from src.shared.state import (
    DEFAULT_COST_PER_ITERATION_SATS,
    PaymentStatus,
    BaseAgentState,
)

# Re-export for convenience
COST_PER_ITERATION_SATS = DEFAULT_COST_PER_ITERATION_SATS


# =============================================================================
# REDUCERS
# =============================================================================

def override_reducer(current_value, new_value):
    """Reducer that allows overriding values in state.
    
    Supports special dict format: {"type": "override", "value": <new_value>}
    Otherwise uses operator.add for list concatenation.
    """
    if isinstance(new_value, dict) and new_value.get("type") == "override":
        return new_value.get("value", new_value)
    else:
        return operator.add(current_value, new_value)


# =============================================================================
# STRUCTURED OUTPUTS - For LLM responses
# =============================================================================

class ConductResearch(BaseModel):
    """Tool call to delegate research to a sub-researcher.
    
    The supervisor uses this to spawn focused research tasks.
    """
    research_topic: str = Field(
        description="The topic to research. Should be a single topic, described in high detail (at least a paragraph).",
    )


class ResearchComplete(BaseModel):
    """Tool call to indicate research is complete.
    
    The supervisor calls this when satisfied with findings.
    """
    pass


class ClarifyWithUser(BaseModel):
    """Model for user clarification requests."""
    
    need_clarification: bool = Field(
        description="Whether the user needs to be asked a clarifying question.",
    )
    question: str = Field(
        default="",
        description="A question to ask the user to clarify the research scope.",
    )
    verification: str = Field(
        default="",
        description="Verification message confirming research will start.",
    )


class ResearchQuestion(BaseModel):
    """Research question and brief for guiding research."""
    
    research_brief: str = Field(
        description="A detailed research brief that will guide the research process.",
    )


class Summary(BaseModel):
    """Research summary with key findings from a webpage."""
    
    summary: str = Field(
        description="Comprehensive summary of the content.",
    )
    key_excerpts: str = Field(
        description="Important quotes or excerpts from the content.",
    )


# =============================================================================
# RESEARCH TYPES
# =============================================================================

class ResearchSource(TypedDict):
    """A source discovered during research."""
    url: str
    title: str
    content_preview: NotRequired[str]
    snippet: NotRequired[str]
    fetched: bool


class ResearchFinding(TypedDict):
    """A finding from research."""
    content: str
    source_urls: list[str]


class TodoItem(TypedDict):
    """A todo item for task tracking."""
    id: NotRequired[str]
    content: str
    status: Literal["pending", "in_progress", "completed", "cancelled"]


# =============================================================================
# INPUT STATE
# =============================================================================

class AgentInputState(MessagesState):
    """Input state - only messages from the user."""
    pass


# =============================================================================
# RESEARCHER STATE (Sub-agent)
# =============================================================================

class ResearcherState(TypedDict):
    """State for individual researchers conducting focused research.
    
    Each researcher works on a specific topic delegated by the supervisor.
    """
    
    # Messages within this researcher's context
    researcher_messages: Annotated[list[MessageLikeRepresentation], operator.add]
    
    # Number of tool call iterations
    tool_call_iterations: int
    
    # The specific research topic assigned
    research_topic: str
    
    # Compressed/synthesized research output
    compressed_research: str
    
    # Raw notes collected during research
    raw_notes: Annotated[list[str], override_reducer]


class ResearcherOutputState(BaseModel):
    """Output state from individual researchers."""
    
    compressed_research: str = Field(
        default="",
        description="Synthesized research findings.",
    )
    raw_notes: Annotated[list[str], override_reducer] = Field(
        default_factory=list,
        description="Raw research notes.",
    )


# =============================================================================
# SUPERVISOR STATE
# =============================================================================

class SupervisorState(TypedDict):
    """State for the research supervisor managing parallel researchers.
    
    The supervisor:
    - Analyzes the research brief
    - Delegates tasks to sub-researchers
    - Aggregates findings
    - Decides when research is complete
    """
    
    # Supervisor's conversation messages
    supervisor_messages: Annotated[list[MessageLikeRepresentation], override_reducer]
    
    # The research brief guiding this research
    research_brief: str
    
    # Aggregated notes from all researchers
    notes: Annotated[list[str], override_reducer]
    
    # Number of supervisor iterations
    research_iterations: int
    
    # Raw notes from researchers
    raw_notes: Annotated[list[str], override_reducer]


# =============================================================================
# MAIN AGENT STATE
# =============================================================================

class DeepResearchState(BaseAgentState):
    """Main state for the Deep Research Agent workflow.
    
    Extends BaseAgentState with research-specific fields for the
    multi-agent supervisor-researcher pattern.
    
    Inherited from BaseAgentState:
    - messages: Message history with user
    - payment_*: Cashu payment state fields
    - current_project_id: Project context
    - run_id: Run metadata
    - project_files: Files from client
    """
    
    # ==========================================================================
    # SUPERVISOR STATE
    # ==========================================================================
    
    # Messages for the supervisor sub-graph
    supervisor_messages: NotRequired[Annotated[list[MessageLikeRepresentation], override_reducer]]
    
    # The research brief generated from user query
    research_brief: NotRequired[str | None]
    
    # Number of research iterations
    research_iterations: NotRequired[int]
    
    # ==========================================================================
    # RESEARCH FINDINGS
    # ==========================================================================
    
    # Raw notes from all researchers
    raw_notes: NotRequired[Annotated[list[str], override_reducer]]
    
    # Processed notes ready for final report
    notes: NotRequired[Annotated[list[str], override_reducer]]
    
    # The final research report
    final_report: NotRequired[str]
    
    # ==========================================================================
    # RESEARCH STATE
    # ==========================================================================
    
    # The original research query/request
    research_query: NotRequired[str | None]
    
    # List of sources discovered during research
    research_sources: NotRequired[list[ResearchSource]]
    
    # Key findings from research
    research_findings: NotRequired[list[ResearchFinding]]
    
    # Current research phase
    research_phase: NotRequired[Literal[
        "clarifying",
        "planning", 
        "researching", 
        "synthesizing", 
        "complete"
    ] | None]
    
    # ==========================================================================
    # TASK TRACKING
    # ==========================================================================
    
    # Todo list for tracking multi-step tasks
    todos: NotRequired[list[TodoItem]]
