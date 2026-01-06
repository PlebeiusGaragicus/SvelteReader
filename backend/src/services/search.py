"""Search service for Web Scrape mode.

Provides clients for:
- SearXNG: Meta-search engine for web search
- Firecrawl: URL scraping and content extraction
"""

import os
from typing import Optional
from dataclasses import dataclass

import httpx


# Topic configuration for discovery feed
TOPICS = {
    "tech": {
        "queries": ["technology news", "latest tech", "AI", "science and innovation"],
        "sites": ["techcrunch.com", "wired.com", "theverge.com", "arstechnica.com"],
    },
    "finance": {
        "queries": ["finance news", "economy", "stock market", "bitcoin cryptocurrency"],
        "sites": ["bloomberg.com", "cnbc.com", "marketwatch.com", "coindesk.com"],
    },
    "art": {
        "queries": ["art news", "culture", "modern art", "cultural events"],
        "sites": ["artnews.com", "hyperallergic.com", "theartnewspaper.com"],
    },
    "sports": {
        "queries": ["sports news", "latest sports", "football basketball"],
        "sites": ["espn.com", "bbc.com/sport", "skysports.com"],
    },
    "entertainment": {
        "queries": ["entertainment news", "movies", "TV shows", "streaming"],
        "sites": ["hollywoodreporter.com", "variety.com", "deadline.com"],
    },
}


@dataclass
class SearchResult:
    """A single search result."""
    title: str
    url: str
    content: Optional[str] = None
    thumbnail: Optional[str] = None
    author: Optional[str] = None


@dataclass
class SearchResponse:
    """Response from a search query."""
    results: list[SearchResult]
    suggestions: list[str]


@dataclass
class ScrapeResult:
    """Result from scraping a URL."""
    url: str
    title: str
    content: str
    metadata: dict


class SearxngClient:
    """Client for querying SearXNG metasearch engine."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or os.getenv("SEARXNG_URL", "http://localhost:8080")
        self.client = httpx.AsyncClient(timeout=30.0)

    async def search(
        self,
        query: str,
        engines: Optional[list[str]] = None,
        categories: Optional[list[str]] = None,
        language: str = "en",
        page: int = 1,
    ) -> SearchResponse:
        """Perform a search query.
        
        Args:
            query: Search query string
            engines: List of engines to use (e.g., ["google", "bing"])
            categories: List of categories (e.g., ["general", "news"])
            language: Language code
            page: Page number for pagination
            
        Returns:
            SearchResponse with results and suggestions
        """
        params = {
            "q": query,
            "format": "json",
            "language": language,
            "pageno": page,
        }

        if engines:
            params["engines"] = ",".join(engines)
        if categories:
            params["categories"] = ",".join(categories)

        try:
            response = await self.client.get(
                f"{self.base_url}/search",
                params=params,
            )
            response.raise_for_status()
            data = response.json()

            results = [
                SearchResult(
                    title=r.get("title", ""),
                    url=r.get("url", ""),
                    content=r.get("content"),
                    thumbnail=r.get("img_src") or r.get("thumbnail_src") or r.get("thumbnail"),
                    author=r.get("author"),
                )
                for r in data.get("results", [])
            ]

            suggestions = data.get("suggestions", [])

            return SearchResponse(results=results, suggestions=suggestions)

        except httpx.HTTPError as e:
            print(f"[SearXNG] Search error: {e}")
            return SearchResponse(results=[], suggestions=[])

    async def discover(
        self,
        topic: str,
        page: int = 1,
        limit: int = 10,
    ) -> list[SearchResult]:
        """Fetch discovery items for a topic.
        
        Args:
            topic: Topic key (tech, finance, art, sports, entertainment)
            page: Page number
            limit: Items per page
            
        Returns:
            List of SearchResults
        """
        topic_config = TOPICS.get(topic)
        if not topic_config:
            return []

        all_results: list[SearchResult] = []
        seen_urls: set[str] = set()

        # Query each site with each query term
        for site in topic_config["sites"][:2]:  # Limit sites per request
            for query in topic_config["queries"][:2]:  # Limit queries per request
                search_query = f"site:{site} {query}"
                response = await self.search(
                    query=search_query,
                    engines=["bing news", "google news"],
                    language="en",
                    page=page,
                )

                for result in response.results:
                    url = result.url.lower().strip()
                    if url not in seen_urls and result.thumbnail:
                        seen_urls.add(url)
                        all_results.append(result)

                    if len(all_results) >= limit:
                        break

                if len(all_results) >= limit:
                    break

            if len(all_results) >= limit:
                break

        return all_results[:limit]

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()


class FirecrawlClient:
    """Client for scraping URLs via Firecrawl API."""

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        self.api_key = api_key or os.getenv("FIRECRAWL_API_KEY", "")
        self.base_url = base_url or os.getenv("FIRECRAWL_URL", "https://api.firecrawl.dev/v1")
        self.client = httpx.AsyncClient(timeout=60.0)

    async def scrape(self, url: str) -> ScrapeResult:
        """Scrape a URL and extract content.
        
        Args:
            url: URL to scrape
            
        Returns:
            ScrapeResult with extracted content
        """
        if not self.api_key:
            raise ValueError("Firecrawl API key not configured")

        try:
            response = await self.client.post(
                f"{self.base_url}/scrape",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "url": url,
                    "formats": ["markdown"],
                },
            )
            response.raise_for_status()
            data = response.json()

            # Extract data from Firecrawl response
            result_data = data.get("data", {})
            metadata = result_data.get("metadata", {})

            return ScrapeResult(
                url=url,
                title=metadata.get("title", ""),
                content=result_data.get("markdown", ""),
                metadata={
                    "author": metadata.get("author"),
                    "publishedAt": metadata.get("publishedTime"),
                    "description": metadata.get("description"),
                    "siteName": metadata.get("siteName"),
                },
            )

        except httpx.HTTPError as e:
            print(f"[Firecrawl] Scrape error: {e}")
            raise

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()


# Singleton instances
_searxng_client: Optional[SearxngClient] = None
_firecrawl_client: Optional[FirecrawlClient] = None


def get_searxng_client() -> SearxngClient:
    """Get or create SearXNG client singleton."""
    global _searxng_client
    if _searxng_client is None:
        _searxng_client = SearxngClient()
    return _searxng_client


def get_firecrawl_client() -> FirecrawlClient:
    """Get or create Firecrawl client singleton."""
    global _firecrawl_client
    if _firecrawl_client is None:
        _firecrawl_client = FirecrawlClient()
    return _firecrawl_client


async def cleanup_clients():
    """Cleanup client connections."""
    global _searxng_client, _firecrawl_client
    if _searxng_client:
        await _searxng_client.close()
        _searxng_client = None
    if _firecrawl_client:
        await _firecrawl_client.close()
        _firecrawl_client = None

