# SvelteReader

A Svelte 5 ebook reader with AI-powered chat features, showcasing integration with the CypherTap package for nostr and eCash.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Svelte Frontend │────▶│  FastAPI Backend │────▶│ LangGraph Agent │
│  (Port 5173)     │     │  (Port 8000)     │     │  (Port 2024)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Project Structure

- **`frontend/`** - Svelte 5 ebook reader application
- **`backend/`** - FastAPI backend for business logic and LangGraph integration
- **`agent/`** - Self-hosted LangGraph agent for AI chat
- **`cyphertap/`** - CypherTap component library (submodule)
- **`docs/`** - Documentation

## Quick Start

### 1. Start the LangGraph Agent

```bash
cd agent
pip install -e . "langgraph-cli[inmem]"
cp .env.example .env
# Add your OPENAI_API_KEY to .env
langgraph dev
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

Open http://localhost:5173 to use the app.

## AI Chat Feature

The AI chat feature allows users to:
1. Highlight text in their ebooks
2. Add notes to highlights
3. Chat with an AI assistant about the highlighted passages

The AI assistant receives context about:
- The highlighted text
- User's notes
- Book title and chapter

## Environment Variables

### Agent (`agent/.env`)
- `OPENAI_API_KEY` - OpenAI API key (required)
- `MODEL_PROVIDER` - `openai` or `anthropic`
- `MODEL_NAME` - Model to use (e.g., `gpt-4o-mini`)

### Backend (`backend/.env`)
- `LANGGRAPH_API_URL` - LangGraph server URL (default: `http://localhost:2024`)
- `LANGGRAPH_ASSISTANT_ID` - Graph ID (default: `reader_assistant`)

### Frontend (`frontend/.env`)
- `VITE_API_URL` - Backend API URL (default: `http://localhost:8000`)

## Development

See individual README files in each directory for detailed development instructions:
- [Frontend README](frontend/README.md)
- [Backend README](backend/README.md)
- [Agent README](agent/README.md)