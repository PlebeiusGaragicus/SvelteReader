"""DeepResearch Agent - Multi-agent supervisor-researcher pattern.

A research agent that conducts thorough web research using:
- Clarification phase for understanding user intent
- Research brief generation
- Parallel sub-researchers for focused research
- Compression and synthesis
- Final report generation
"""

from .graph import graph
from .state import DeepResearchState, SupervisorState, ResearcherState

__all__ = [
    "graph",
    "DeepResearchState",
    "SupervisorState",
    "ResearcherState",
]

