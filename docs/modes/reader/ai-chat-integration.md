# AI Chat Integration

### AI Chat

| Feature | Status | Description |
|---------|--------|-------------|
| Streaming Responses | ✅ | SSE streaming from LangGraph agent |
| Passage Context | ✅ | AI receives highlighted text, notes, book/chapter info |
| Thread Management | ✅ | Create, retrieve, delete conversation threads |
| Markdown Rendering | ✅ | Rich formatting in AI responses |
| OpenAI-Compatible | ✅ | Works with Ollama, vLLM, LM Studio, etc. |
| Thread History | ✅ | Sidebar with previous conversations |

### Authentication & Payments (CypherTap)

| Feature | Status | Description |
|---------|--------|-------------|
| Nostr Login | ✅ | Authenticate via nostr public key (npub) |
| Ecash Wallet | ✅ | Client-side Cashu ecash wallet |
| Pay-per-Message | ✅ | Ecash token attached to each AI request |
| Refund Safety | ✅ | Client self-redeems on failure |
| Lightning Deposit | ✅ | Fund wallet via Lightning invoice |

This document describes the architecture and setup for the AI-powered chat feature in SvelteReader.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Svelte Frontend │────▶│  FastAPI Backend │────▶│ LangGraph Agent │
│  (Port 5173)     │     │  (Port 8000)     │     │  (Port 2024)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

The system uses a three-tier architecture:

1. **Svelte Frontend** - User interface with streaming chat support
2. **FastAPI Backend** - Business logic, authentication, payment verification
3. **LangGraph Agent** - Self-hosted AI agent (not cloud-hosted)

## Project Structure

```
SvelteReader/
├── agent/                          # LangGraph agent
│   ├── src/agent/
│   │   ├── __init__.py
│   │   └── graph.py               # Agent graph with chat node
│   ├── langgraph.json             # LangGraph server config
│   ├── pyproject.toml
│   ├── .env.example
│   └── README.md
│
├── backend/                        # FastAPI backend
│   ├── src/
│   │   ├── main.py                # FastAPI app with CORS
│   │   ├── routers/
│   │   │   └── chat.py            # Chat endpoints (streaming + non-streaming)
│   │   └── services/
│   │       └── langgraph_client.py # LangGraph SDK wrapper
│   ├── pyproject.toml
│   ├── .env.example
│   └── README.md
│
└── frontend/
    └── src/lib/services/
        └── chatService.ts          # Frontend service for backend communication
```

## Key Components

### Frontend (`frontend/src/lib/`)

| File | Purpose |
|------|---------|
| `services/chatService.ts` | Handles SSE streaming and API calls to backend |
| `components/reader/AIChatPanel.svelte` | Chat UI with streaming message display |

### Backend (`backend/src/`)

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app with CORS configuration |
| `routers/chat.py` | Chat endpoints (streaming and non-streaming) |
| `services/langgraph_client.py` | LangGraph SDK wrapper for agent communication |

### Agent (`agent/src/agent/`)

| File | Purpose |
|------|---------|
| `graph.py` | LangGraph state graph with chat node |
| `langgraph.json` | Server configuration for `langgraph dev` |

## Data Flow

1. User highlights text in ebook and opens AI chat
2. Frontend sends message + passage context to backend via POST
3. Backend creates/retrieves thread and forwards to LangGraph agent
4. Agent generates response with book context in system prompt
5. Response streams back through backend to frontend via SSE

## Environment Configuration

### Agent (`agent/.env`)

```bash
# Required: OpenAI-compatible API endpoint
LLM_BASE_URL=http://localhost:11434/v1  # e.g., Ollama, vLLM, etc.
LLM_API_KEY=your-api-key                 # Use "ollama" for Ollama
LLM_MODEL=llama3.2                       # Model name

# Optional: LangSmith tracing
LANGSMITH_API_KEY=lsv2_...
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=svelte-reader
```

### Backend (`backend/.env`)

```bash
LANGGRAPH_API_URL=http://localhost:2024
LANGGRAPH_ASSISTANT_ID=reader_assistant
```

### Frontend (`frontend/.env`)

```bash
VITE_API_URL=http://localhost:8000
```

## Running the Stack

### 1. Start the LangGraph Agent

```bash
cd agent
pip install -e . "langgraph-cli[inmem]"
cp .env.example .env
# Configure your LLM endpoint in .env
langgraph dev --no-browser
```

### 2. Start the FastAPI Backend

```bash
cd backend
pip install -e .
cp .env.example .env
uvicorn src.main:app --reload --port 8000
```

### 3. Start the Svelte Frontend

```bash
cd frontend
pnpm install
cp .env.example .env
pnpm dev
```

## LLM Configuration

The agent is designed to work with **any OpenAI-compatible endpoint**:

| Provider | Base URL | API Key |
|----------|----------|---------|
| Ollama | `http://localhost:11434/v1` | `ollama` |
| vLLM | `http://localhost:8000/v1` | Your key |
| LM Studio | `http://localhost:1234/v1` | `lm-studio` |
| OpenRouter | `https://openrouter.ai/api/v1` | Your key |
| Together AI | `https://api.together.xyz/v1` | Your key |

**Note:** The agent does NOT default to OpenAI. You must explicitly configure `LLM_BASE_URL` and `LLM_MODEL`.

## Extending the Agent

To add tools or more complex behavior:

1. Define tool functions in `graph.py`
2. Add a tools node to the graph
3. Update conditional edges to route between chat and tools

Example tool addition:

```python
from langchain_core.tools import tool

@tool
def search_book(query: str) -> str:
    """Search the current book for relevant passages."""
    # Implementation here
    return "Search results..."
```

## API Reference

### POST `/api/chat/message`

Send a message and receive complete response.

```json
{
  "content": "What does this passage mean?",
  "thread_id": "optional-thread-id",
  "passage_context": {
    "text": "The highlighted text...",
    "note": "User's note",
    "book_title": "Book Title",
    "chapter": "Chapter 1"
  }
}
```

### POST `/api/chat/message/stream`

Send a message and stream the response via SSE.

Same request body as above. Response is Server-Sent Events:

```
data: {"type": "thread_id", "thread_id": "..."}
data: {"type": "token", "content": "Hello"}
data: {"type": "token", "content": " there"}
data: {"type": "done"}
```

### POST `/api/chat/thread`

Create a new conversation thread.

### GET `/api/chat/thread/{thread_id}`

Get thread state and message history.

### DELETE `/api/chat/thread/{thread_id}`

Delete a conversation thread.
