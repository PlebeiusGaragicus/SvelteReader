"""Search router for Web Scrape mode.

Provides endpoints for:
- Web search via SearXNG
- Discovery feed by topic
- URL scraping via Firecrawl
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, HttpUrl

from src.services.search import (
    get_searxng_client,
    get_firecrawl_client,
    TOPICS,
)

router = APIRouter()


# Request/Response models

class SearchRequest(BaseModel):
    """Request body for search endpoint."""
    query: str
    engines: Optional[list[str]] = None
    categories: Optional[list[str]] = None
    language: str = "en"
    page: int = 1


class SearchResultItem(BaseModel):
    """A single search result."""
    title: str
    url: str
    content: Optional[str] = None
    thumbnail: Optional[str] = None
    author: Optional[str] = None


class SearchResponse(BaseModel):
    """Response from search endpoint."""
    results: list[SearchResultItem]
    suggestions: list[str]


class DiscoveryItem(BaseModel):
    """A discovery feed item."""
    id: str
    title: str
    url: str
    content: Optional[str] = None
    thumbnail: Optional[str] = None
    topic: str


class DiscoveryResponse(BaseModel):
    """Response from discover endpoint."""
    items: list[DiscoveryItem]
    hasMore: bool
    page: int


class ScrapeRequest(BaseModel):
    """Request body for scrape endpoint."""
    url: HttpUrl


class ScrapeResponse(BaseModel):
    """Response from scrape endpoint."""
    url: str
    title: str
    content: str
    metadata: dict


# Endpoints

@router.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest):
    """Perform a web search via SearXNG.
    
    Args:
        request: Search parameters including query, engines, language, page
        
    Returns:
        Search results with suggestions
    """
    client = get_searxng_client()
    
    try:
        response = await client.search(
            query=request.query,
            engines=request.engines,
            categories=request.categories,
            language=request.language,
            page=request.page,
        )
        
        return SearchResponse(
            results=[
                SearchResultItem(
                    title=r.title,
                    url=r.url,
                    content=r.content,
                    thumbnail=r.thumbnail,
                    author=r.author,
                )
                for r in response.results
            ],
            suggestions=response.suggestions,
        )
        
    except Exception as e:
        print(f"[Search] Error: {e}")
        raise HTTPException(status_code=500, detail="Search failed")


@router.get("/discover", response_model=DiscoveryResponse)
async def discover(
    topic: str = Query(default="tech", description="Topic to discover"),
    page: int = Query(default=1, ge=1, description="Page number"),
    limit: int = Query(default=10, ge=1, le=50, description="Items per page"),
):
    """Fetch discovery feed items by topic.
    
    Args:
        topic: Topic key (tech, finance, art, sports, entertainment)
        page: Page number for pagination
        limit: Number of items per page
        
    Returns:
        Discovery items with pagination info
    """
    if topic not in TOPICS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid topic. Choose from: {list(TOPICS.keys())}",
        )
    
    client = get_searxng_client()
    
    try:
        results = await client.discover(
            topic=topic,
            page=page,
            limit=limit + 1,  # Fetch one extra to check hasMore
        )
        
        has_more = len(results) > limit
        items = results[:limit]
        
        return DiscoveryResponse(
            items=[
                DiscoveryItem(
                    id=f"{topic}-{i}-{page}",
                    title=r.title,
                    url=r.url,
                    content=r.content,
                    thumbnail=r.thumbnail,
                    topic=topic,
                )
                for i, r in enumerate(items)
            ],
            hasMore=has_more,
            page=page,
        )
        
    except Exception as e:
        print(f"[Discover] Error: {e}")
        raise HTTPException(status_code=500, detail="Discovery failed")


@router.get("/topics")
async def get_topics():
    """Get available discovery topics.
    
    Returns:
        List of topic keys and display names
    """
    return {
        "topics": [
            {"key": key, "display": key.replace("_", " ").title()}
            for key in TOPICS.keys()
        ]
    }


@router.post("/scrape", response_model=ScrapeResponse)
async def scrape(request: ScrapeRequest):
    """Scrape a URL and extract content via Firecrawl.
    
    Args:
        request: URL to scrape
        
    Returns:
        Extracted content and metadata
    """
    client = get_firecrawl_client()
    
    try:
        result = await client.scrape(str(request.url))
        
        return ScrapeResponse(
            url=result.url,
            title=result.title,
            content=result.content,
            metadata=result.metadata,
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[Scrape] Error: {e}")
        raise HTTPException(status_code=500, detail="Scrape failed")

