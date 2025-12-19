# SvelteReader Backend

FastAPI backend that interfaces between the Svelte frontend and the self-hosted LangGraph agent.

## Architecture

```
Svelte Frontend (5173) → FastAPI Backend (8000) → LangGraph Agent (2024)
```

The backend serves as a middleware layer that:
- Routes chat messages to the LangGraph agent
- Handles business logic (payment verification, rate limiting)
- Manages conversation threads
- Streams responses back to the frontend

## Setup

1. Install dependencies:

```bash
cd backend
pip install -e .
```

2. Configure environment:

```bash
cp .env.example .env
# Edit .env as needed
```

3. Start the LangGraph agent first (in the `agent/` directory):

```bash
cd ../agent
langgraph dev
```

4. Start the FastAPI server:

```bash
cd ../backend
uvicorn src.main:app --reload --port 8000
```

## API Endpoints

### Chat

- `POST /api/chat/message` - Send a message and get a complete response
- `POST /api/chat/message/stream` - Send a message and stream the response (SSE)
- `POST /api/chat/thread` - Create a new conversation thread
- `GET /api/chat/thread/{thread_id}` - Get thread state
- `DELETE /api/chat/thread/{thread_id}` - Delete a thread

### Health

- `GET /health` - Health check
- `GET /` - API info

## Request/Response Examples

### Send Message (Non-streaming)

```bash
curl -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "content": "What does this passage mean?",
    "passage_context": {
      "text": "It was the best of times, it was the worst of times...",
      "book_title": "A Tale of Two Cities",
      "note": "Famous opening line"
    }
  }'
```

### Send Message (Streaming)

```bash
curl -X POST http://localhost:8000/api/chat/message/stream \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Explain this passage",
    "thread_id": "existing-thread-id",
    "passage_context": {
      "text": "Some highlighted text..."
    }
  }'
```

## Development

Run with auto-reload:

```bash
uvicorn src.main:app --reload --port 8000
```

API documentation available at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
