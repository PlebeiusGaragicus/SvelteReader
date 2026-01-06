"""Tool definitions for the Deep Research agent.

Contains:
- Search tools (Tavily, SearXNG)
- Strategic thinking tools
- File operation tools (client-side)
"""

import os
from typing import Any, List, Literal

import httpx
from langchain_core.tools import tool


# =============================================================================
# STRATEGIC THINKING TOOL
# =============================================================================

@tool
def think_tool(reflection: str) -> str:
    """Strategic reflection tool for research planning and decision-making.

    Use this tool after each search to analyze results and plan next steps.
    This creates a deliberate pause in the research workflow.

    When to use:
    - After receiving search results: What key information did I find?
    - Before deciding next steps: Do I have enough to answer comprehensively?
    - When assessing research gaps: What specific information am I still missing?
    - Before concluding research: Can I provide a complete answer now?

    Reflection should address:
    1. Analysis of current findings - What concrete information have I gathered?
    2. Gap assessment - What crucial information is still missing?
    3. Quality evaluation - Do I have sufficient evidence/examples for a good answer?
    4. Strategic decision - Should I continue searching or provide my answer?

    Args:
        reflection: Your detailed reflection on research progress, findings, gaps, and next steps

    Returns:
        Confirmation that reflection was recorded for decision-making
    """
    return f"Reflection recorded: {reflection}"


# Legacy alias for backward compatibility
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
# WEB SEARCH TOOLS
# =============================================================================

@tool
async def web_search(
    queries: List[str],
    max_results: int = 5,
    topic: Literal["general", "news", "finance"] = "general",
) -> str:
    """Search the web for information using configured search provider.
    
    This tool searches the web and returns summarized results.
    Use this to find current information, facts, and sources on any topic.
    
    Args:
        queries: List of search queries to execute (can be 1 or more)
        max_results: Maximum number of results per query (default: 5)
        topic: Topic filter - "general", "news", or "finance"
    
    Returns:
        Formatted search results with titles, URLs, and content
    """
    # Try Tavily first if configured
    tavily_key = os.getenv("TAVILY_API_KEY")
    if tavily_key:
        return await _tavily_search(queries, max_results, topic)
    
    # Fall back to SearXNG
    searxng_url = os.getenv("SEARXNG_URL", "http://localhost:8080")
    return await _searxng_search(queries, max_results, searxng_url)


async def _tavily_search(
    queries: List[str],
    max_results: int = 5,
    topic: str = "general",
) -> str:
    """Execute Tavily search queries."""
    try:
        from tavily import AsyncTavilyClient
        
        api_key = os.getenv("TAVILY_API_KEY")
        if not api_key:
            return "Error: TAVILY_API_KEY not configured"
        
        client = AsyncTavilyClient(api_key=api_key)
        
        all_results = []
        for query in queries:
            response = await client.search(
                query, 
                max_results=max_results,
                topic=topic,
            )
            
            for r in response.get("results", []):
                all_results.append({
                    "title": r.get("title", "Untitled"),
                    "url": r.get("url", ""),
                    "content": r.get("content", "")[:500],
                })
        
        # Deduplicate by URL
        seen_urls = set()
        unique_results = []
        for r in all_results:
            if r["url"] not in seen_urls:
                seen_urls.add(r["url"])
                unique_results.append(r)
        
        # Format output
        formatted = []
        for i, r in enumerate(unique_results[:max_results * len(queries)]):
            formatted.append(
                f"--- SOURCE {i+1}: {r['title']} ---\n"
                f"URL: {r['url']}\n\n"
                f"{r['content']}\n\n"
                + "-" * 80
            )
        
        return "\n\n".join(formatted) if formatted else "No results found"
        
    except ImportError:
        return "Error: tavily package not installed"
    except Exception as e:
        return f"Search error: {str(e)}"


async def _searxng_search(
    queries: List[str],
    max_results: int = 5,
    searxng_url: str = "http://localhost:8080",
) -> str:
    """Execute SearXNG search queries."""
    try:
        all_results = []
        
        async with httpx.AsyncClient() as client:
            for query in queries:
                response = await client.get(
                    f"{searxng_url}/search",
                    params={
                        "q": query,
                        "format": "json",
                        "engines": "google,duckduckgo,bing",
                    },
                    timeout=30.0,
                )
                
                if response.status_code == 200:
                    data = response.json()
                    for r in data.get("results", [])[:max_results]:
                        all_results.append({
                            "title": r.get("title", "Untitled"),
                            "url": r.get("url", ""),
                            "content": r.get("content", "")[:500],
                        })
        
        # Deduplicate by URL
        seen_urls = set()
        unique_results = []
        for r in all_results:
            if r["url"] not in seen_urls:
                seen_urls.add(r["url"])
                unique_results.append(r)
        
        # Format output
        formatted = []
        for i, r in enumerate(unique_results[:max_results * len(queries)]):
            formatted.append(
                f"--- SOURCE {i+1}: {r['title']} ---\n"
                f"URL: {r['url']}\n\n"
                f"{r['content']}\n\n"
                + "-" * 80
            )
        
        return "\n\n".join(formatted) if formatted else "No results found"
        
    except Exception as e:
        return f"Search error: {str(e)}"


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
SERVER_TOOLS = [web_search, tavily_search, think_tool, think]

# Tools that require client-side execution (interrupt for HITL)
CLIENT_TOOLS = [list_files, read_file, write_file, patch_file]

# All research tools
RESEARCH_TOOLS = SERVER_TOOLS + CLIENT_TOOLS

# Supervisor tools (for delegating research)
SUPERVISOR_TOOLS = [think_tool]  # ConductResearch and ResearchComplete are structured outputs

# Researcher tools (for conducting research)
RESEARCHER_TOOLS = [web_search, think_tool]
