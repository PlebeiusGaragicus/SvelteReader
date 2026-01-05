"""Tools for the Web Agent.

These tools call the FastAPI backend which proxies to SearXNG and Firecrawl.
This avoids CORS issues and keeps API keys secure on the backend.
"""

import os
from typing import Optional

import httpx
from langchain_core.tools import tool


# Backend URL - defaults to local Docker stack
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")


@tool
async def web_search(
    query: str,
    engines: Optional[list[str]] = None,
    language: str = "en",
    page: int = 1,
) -> str:
    """Search the web for information.
    
    Use this to find current information, news, or research any topic.
    
    Args:
        query: Search query string. Be specific for better results.
        engines: Optional list of search engines (e.g., ["google", "bing", "duckduckgo"]).
                 If not specified, uses default engines.
        language: Language code (default: "en")
        page: Page number for pagination (default: 1)
    
    Returns:
        JSON string with search results containing:
        - title: Article/page title
        - url: URL to the source
        - content: Brief snippet/description
        - thumbnail: Image URL if available
        
    Example:
        web_search("latest bitcoin price", engines=["google", "bing"])
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{BACKEND_URL}/api/search",
                json={
                    "query": query,
                    "engines": engines,
                    "language": language,
                    "page": page,
                },
            )
            response.raise_for_status()
            data = response.json()
            
            # Format results for the LLM
            results = data.get("results", [])
            if not results:
                return "No search results found. Try different search terms."
            
            formatted = []
            for i, r in enumerate(results[:10], 1):  # Limit to 10 results
                formatted.append(
                    f"{i}. **{r.get('title', 'Untitled')}**\n"
                    f"   URL: {r.get('url', 'N/A')}\n"
                    f"   {r.get('content', 'No description')}"
                )
            
            suggestions = data.get("suggestions", [])
            result_text = "\n\n".join(formatted)
            
            if suggestions:
                result_text += f"\n\n**Related searches:** {', '.join(suggestions[:5])}"
            
            return result_text
            
    except httpx.HTTPError as e:
        return f"Search failed: {str(e)}"
    except Exception as e:
        return f"Search error: {str(e)}"


@tool
async def scrape_url(url: str) -> str:
    """Scrape a webpage to get its full content.
    
    Use this when you need more detailed information from a search result.
    The content is returned as clean markdown, suitable for reading and summarizing.
    
    Args:
        url: The URL to scrape. Must be a valid HTTP/HTTPS URL.
    
    Returns:
        The page content as markdown, including:
        - title: Page title
        - content: Full article text in markdown format
        - metadata: Author, publish date, etc. if available
        
    Example:
        scrape_url("https://example.com/article")
    """
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{BACKEND_URL}/api/scrape",
                json={"url": url},
            )
            response.raise_for_status()
            data = response.json()
            
            title = data.get("title", "Untitled")
            content = data.get("content", "")
            metadata = data.get("metadata", {})
            
            # Format for the LLM
            result = f"# {title}\n\n"
            
            if metadata.get("author"):
                result += f"**Author:** {metadata['author']}\n"
            if metadata.get("publishedAt"):
                result += f"**Published:** {metadata['publishedAt']}\n"
            if metadata.get("siteName"):
                result += f"**Source:** {metadata['siteName']}\n"
            
            result += f"\n{content}"
            
            # Truncate if too long (LLM context limits)
            max_length = 15000
            if len(result) > max_length:
                result = result[:max_length] + "\n\n...[Content truncated]"
            
            return result
            
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 400:
            return f"Invalid URL or scraping not available for this site."
        return f"Scrape failed: {str(e)}"
    except Exception as e:
        return f"Scrape error: {str(e)}"


# All tools available to the Web Agent
WEB_TOOLS = [web_search, scrape_url]

