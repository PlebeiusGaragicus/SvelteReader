# SvelteReader AI Backend

FastAPI backend for AI-powered features: search, suggestions, and OCR.

## Architecture

```
Svelte Frontend (5173) → AI Backend (8000) → LLM APIs
                      → Payments Service (8001) → Cashu Mints
```

This backend handles:
- Web search via SearXNG
- URL scraping via Firecrawl
- AI-powered suggestions
- OCR via vision models (OpenAI-compatible)

**Note**: Payments are handled by a separate service (`payments/`) for security isolation.

## Setup

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate
```

2. Install dependencies:
```bash
pip install -e .
```

3. Configure environment:
```bash
cp .env.example .env
# Edit .env with your API keys
```

Required environment variables for OCR:
```
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=your_key_here
OCR_MODEL=your-vision-model-name
```

4. Start the server:
```bash
uvicorn src.main:app --reload --port 8000
```

## API Endpoints

### Search
- `POST /api/search` - Web search via SearXNG
- `GET /api/discover` - Discovery feed by topic
- `GET /api/topics` - Available discovery topics
- `POST /api/scrape` - Scrape URL content

### Suggestions
- `POST /api/suggestions` - Generate follow-up questions

### OCR
- `POST /api/ocr` - OCR a single image
- `POST /api/ocr/batch` - OCR multiple images (PDF pages)
- `GET /api/ocr/status` - Check OCR service availability

### Health
- `GET /health` - Health check
- `GET /` - API info

## Development

Run with auto-reload:
```bash
uvicorn src.main:app --reload --port 8000
```

API documentation available at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
