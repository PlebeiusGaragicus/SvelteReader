"""DeepResearch Agent for SvelteReader Synthesize mode.

A research agent that conducts thorough web research to answer user questions,
using tools for web search, webpage fetching, and strategic thinking.
"""

from .graph import graph, create_deepresearch_agent
from .state import DeepResearchState

__all__ = [
    "graph",
    "create_deepresearch_agent",
    "DeepResearchState",
]

