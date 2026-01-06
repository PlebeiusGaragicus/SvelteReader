"""Tool definitions for the DeepResearch agent."""

import os
from typing import Any

from langchain_core.tools import tool


# =============================================================================
# WEB SEARCH TOOLS
# =============================================================================

@tool
def tavily_search(query: str, max_results: int = 5) -> str:
    """Search the web for information using Tavily.
    
    Use this to find current information, facts, and sources on any topic.
    
    Args:
        query: The search query - be specific for better results
        max_results: Maximum number of results to return (default: 5)
    
    Returns:
        Search results with titles, URLs, and content snippets
    """
    try:
        from tavily import TavilyClient
        
        api_key = os.getenv("TAVILY_API_KEY")
        if not api_key:
            return "Error: TAVILY_API_KEY not configured"
        
        client = TavilyClient(api_key=api_key)
        response = client.search(query, max_results=max_results)
        
        results = []
        for r in response.get("results", []):
            results.append(f"**{r.get('title', 'Untitled')}**\n{r.get('url', '')}\n{r.get('content', '')[:500]}")
        
        return "\n\n---\n\n".join(results) if results else "No results found"
        
    except ImportError:
        return "Error: tavily package not installed"
    except Exception as e:
        return f"Search error: {str(e)}"


@tool
def think(thought: str) -> str:
    """Use this tool to think through problems and plan your next steps.
    
    This is your "thinking out loud" tool. Use it to:
    - Analyze search results and what they tell you
    - Plan what searches to do next
    - Organize your findings before responding
    - Reflect on whether you have enough information
    
    Args:
        thought: Your thought process, analysis, or planning
    
    Returns:
        Acknowledgment of your thought
    """
    return f"Thought recorded: {thought[:100]}..."


# =============================================================================
# FILE OPERATION TOOLS (Client-side execution)
# =============================================================================

@tool
def list_files(file_type: str | None = None) -> str:
    """List files in the current project.
    
    Args:
        file_type: Optional filter by type ('artifact', 'source')
    
    Returns:
        List of files with IDs and titles
    """
    # Stub - executed on client
    return ""


@tool
def read_file(file_id: str) -> str:
    """Read the content of a project file.
    
    Args:
        file_id: The ID of the file to read
    
    Returns:
        The file content
    """
    # Stub - executed on client
    return ""


@tool
def write_file(title: str, content: str) -> str:
    """Create a new file in the project.
    
    Args:
        title: The title/name for the file
        content: The markdown content to write
    
    Returns:
        Confirmation with the new file ID
    """
    # Stub - executed on client
    return ""


@tool
def patch_file(file_id: str, search: str, replace: str) -> str:
    """Edit a portion of an existing file.
    
    Args:
        file_id: The ID of the file to edit
        search: The text to find and replace
        replace: The new text to insert
    
    Returns:
        Confirmation of the edit
    """
    # Stub - executed on client
    return ""


# =============================================================================
# TOOL GROUPS
# =============================================================================

# Tools that run server-side
SERVER_TOOLS = [tavily_search, think]

# Tools that require client-side execution (interrupt for HITL)
CLIENT_TOOLS = [list_files, read_file, write_file, patch_file]

# All research tools
RESEARCH_TOOLS = SERVER_TOOLS + CLIENT_TOOLS

