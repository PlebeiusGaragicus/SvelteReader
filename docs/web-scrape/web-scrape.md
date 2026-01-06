# Web Scrape Mode

Web Scrape mode provides AI-powered web search and synthesis, similar to Perplexica. Users can ask questions, get synthesized answers with citations, and explore trending news.

## Features

### 1. AI-Powered Search
- Ask natural language questions
- Get synthesized answers from multiple sources
- Citations link back to original sources
- Follow-up questions maintain context

### 2. Discovery Feed
- Explore recent events by topic
- Topics: Tech & Science, Finance, Art & Culture, Sports, Entertainment
- Infinite scrolling with alternating card layouts
- Click articles to get AI summaries

### 3. URL Scraping
- Paste any URL to extract and summarize content
- Powered by Firecrawl API
- Clean markdown output for LLM consumption

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Svelte Frontend                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │ WebSearchInput  │  │  DiscoveryFeed  │  │  Chat Interface     │ │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘ │
└───────────┼────────────────────┼─────────────────────┼─────────────┘
            │                    │                     │
            ▼                    ▼                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend (:8000)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │
│  │ /api/search │  │/api/discover│  │       /api/scrape           │ │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┬───────────────┘ │
└─────────┼────────────────┼───────────────────────┼─────────────────┘
          │                │                       │
          ▼                ▼                       ▼
    ┌───────────┐    ┌───────────┐          ┌───────────┐
    │  SearXNG  │    │  SearXNG  │          │ Firecrawl │
    │  (:8080)  │    │  (:8080)  │          │    API    │
    └───────────┘    └───────────┘          └───────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Web Agent  │
                    │  (:2025)    │
                    └─────────────┘
```

## Backend Requirements

### SearXNG
A metasearch engine that aggregates results from multiple search engines.

- Runs locally in Docker at `:8080`
- Configured for JSON output format
- Supports news, images, and general web search
- No external API keys required

### Firecrawl API
A web scraping service that returns clean markdown content.

- Used for scraping individual URLs
- Requires API key (set in backend `.env`)
- Returns structured content ideal for LLM processing

### Web Agent (LangGraph)
Dedicated agent for search synthesis.

- Runs at `:2025` (separate from Reader agent)
- Tools: `web_search`, `scrape_url`, `summarize`
- Handles multi-step research workflows

## API Endpoints

### POST /api/search
Perform a web search via SearXNG.

**Request:**
```json
{
  "query": "latest bitcoin news",
  "engines": ["google", "bing"],
  "language": "en",
  "page": 1
}
```

**Response:**
```json
{
  "results": [
    {
      "title": "Article Title",
      "url": "https://example.com/article",
      "content": "Brief description...",
      "thumbnail": "https://example.com/image.jpg"
    }
  ],
  "suggestions": ["related query 1", "related query 2"]
}
```

### GET /api/discover
Fetch discovery feed items by topic.

**Query Parameters:**
- `topic`: tech | finance | art | sports | entertainment
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)

**Response:**
```json
{
  "items": [
    {
      "id": "abc123",
      "title": "Article Title",
      "content": "Description...",
      "url": "https://...",
      "thumbnail": "https://...",
      "topic": "tech",
      "publishedAt": "2026-01-04T10:00:00Z"
    }
  ],
  "hasMore": true,
  "page": 1
}
```

### POST /api/scrape
Scrape a URL using Firecrawl.

**Request:**
```json
{
  "url": "https://example.com/article"
}
```

**Response:**
```json
{
  "url": "https://example.com/article",
  "title": "Article Title",
  "content": "Full article content in markdown...",
  "metadata": {
    "author": "John Doe",
    "publishedAt": "2026-01-04"
  }
}
```

## Frontend Components

### WebSearchInput
Large oval input for search queries.

```
frontend/src/lib/components/webscrape/WebSearchInput.svelte
```

- Multi-line textarea with auto-resize
- Enter to submit, Shift+Enter for newline
- Loading state with spinner
- Keyboard shortcut hints

### DiscoveryFeed
Infinite scrolling news feed.

```
frontend/src/lib/components/webscrape/DiscoveryFeed.svelte
```

- Topic filter pills
- Alternating layout (major cards + small grids)
- IntersectionObserver for infinite scroll
- Loading and error states

### DiscoveryCard / MajorDiscoveryCard
News article cards.

```
frontend/src/lib/components/webscrape/DiscoveryCard.svelte
frontend/src/lib/components/webscrape/MajorDiscoveryCard.svelte
```

- Thumbnail with hover zoom
- Title with line clamp
- Click to open article or get summary

## Configuration

Settings are stored in localStorage:

```typescript
interface WebScrapeSettings {
  backendUrl: string;  // Default: 'http://localhost:8000'
  agentUrl: string;    // Default: 'http://localhost:2025'
}
```

Users can configure:
- Custom backend URL (if running remote SvelteReader backend)
- Custom agent URL (if running remote Web Agent)

## Docker Deployment

The full stack runs via Docker Compose:

```yaml
# backend/docker-compose.yml
services:
  backend:
    build: .
    ports:
      - "8000:8000"
    environment:
      - SEARXNG_URL=http://searxng:8080
      - FIRECRAWL_API_KEY=${FIRECRAWL_API_KEY}
    
  searxng:
    image: searxng/searxng:latest
    ports:
      - "8080:8080"
    volumes:
      - ./searxng:/etc/searxng
```

Start with:
```bash
cd backend
docker-compose up -d
```

## Future Enhancements

- [ ] Research mode with multi-step workflows
- [ ] Save searches to Nostr
- [ ] Share discoveries with followers
- [ ] Integration with Reader mode (save articles as "books")
- [ ] Voice input for search queries

