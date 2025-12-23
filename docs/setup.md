# Setup Guide

Complete instructions for setting up SvelteReader for development.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Frontend runtime |
| pnpm | 8+ | Package manager (or npm) |
| Python | 3.12+ | Backend runtime |
| Git | 2.30+ | Version control + submodules |

### Optional (for AI features)

| Tool | Purpose |
|------|---------|
| Ollama | Local LLM inference |
| Docker | Run LangGraph in container |

---

## Quick Start

### 1. Clone with Submodules

```bash
git clone --recursive https://github.com/yourorg/SvelteReader.git
cd SvelteReader
```

If already cloned without `--recursive`:

```bash
git submodule update --init --recursive
```

### 2. Start Frontend Only (Reader Features)

```bash
cd frontend
pnpm install
pnpm dev
```

Open http://localhost:5173 — you can import and read EPUBs without the backend.

### 3. Start Full Stack (AI Chat Features)

In **three separate terminals**:

**Terminal 1: LangGraph Agent**
```bash
cd agent
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e . "langgraph-cli[inmem]"
cp .env.example .env
# Edit .env with your LLM settings (see below)
langgraph dev --no-browser
```

**Terminal 2: FastAPI Backend**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
cp .env.example .env
uvicorn src.main:app --reload --port 8000
```

**Terminal 3: Svelte Frontend**
```bash
cd frontend
pnpm install
cp .env.example .env
pnpm dev
```

---

## Environment Configuration

### Agent (`agent/.env`)

```bash
# Required: LLM Configuration
LLM_BASE_URL=http://localhost:11434/v1   # Ollama default
LLM_API_KEY=ollama                        # Use "ollama" for Ollama
LLM_MODEL=llama3.2                        # Model name

# Optional: LangSmith tracing
LANGSMITH_API_KEY=lsv2_...
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=svelte-reader
```

### Backend (`backend/.env`)

```bash
# LangGraph agent connection
LANGGRAPH_API_URL=http://localhost:2024
LANGGRAPH_ASSISTANT_ID=reader_assistant

# Wallet configuration (for ecash redemption)
MINT_URL=https://mint.minibits.cash/Bitcoin
```

### Frontend (`frontend/.env`)

```bash
# Backend API
VITE_API_URL=http://localhost:8000
```

---

## LLM Provider Setup

### Option A: Ollama (Recommended for Local Development)

1. Install Ollama: https://ollama.ai

2. Pull a model:
   ```bash
   ollama pull llama3.2
   ```

3. Ollama runs automatically on `http://localhost:11434`

4. Agent `.env`:
   ```bash
   LLM_BASE_URL=http://localhost:11434/v1
   LLM_API_KEY=ollama
   LLM_MODEL=llama3.2
   ```

### Option B: OpenRouter (Cloud, Multiple Models)

1. Get API key: https://openrouter.ai

2. Agent `.env`:
   ```bash
   LLM_BASE_URL=https://openrouter.ai/api/v1
   LLM_API_KEY=sk-or-v1-...
   LLM_MODEL=anthropic/claude-3.5-sonnet
   ```

### Option C: LM Studio (Desktop App)

1. Install LM Studio: https://lmstudio.ai

2. Download a model and start the server

3. Agent `.env`:
   ```bash
   LLM_BASE_URL=http://localhost:1234/v1
   LLM_API_KEY=lm-studio
   LLM_MODEL=local-model
   ```

### Option D: vLLM (Self-Hosted GPU Server)

1. Run vLLM server with your model

2. Agent `.env`:
   ```bash
   LLM_BASE_URL=http://your-gpu-server:8000/v1
   LLM_API_KEY=your-key
   LLM_MODEL=meta-llama/Llama-3.2-8B-Instruct
   ```

---

## CypherTap Submodule

CypherTap is included as a git submodule in `/cyphertap`.

### Update to Latest

```bash
cd cyphertap
git pull origin main
cd ..
git add cyphertap
git commit -m "Update CypherTap submodule"
```

### Build CypherTap (if needed)

```bash
cd cyphertap
pnpm install
pnpm build
```

The frontend links to CypherTap via `"cyphertap": "file:../cyphertap"` in package.json.

---

## Virtual Environments

### Using Existing Virtual Environments

The repo includes pre-created virtual environments:

```bash
# Agent
source agent_venv/bin/activate

# Backend  
source backend_venv/bin/activate
```

### Creating Fresh Virtual Environments

```bash
# Agent
cd agent
python -m venv .venv
source .venv/bin/activate
pip install -e . "langgraph-cli[inmem]"

# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

---

## Running Tests

### Frontend Tests

```bash
cd frontend

# Unit tests
pnpm test

# E2E tests (requires dev server running)
pnpm test:e2e

# E2E with visible browser
pnpm test:e2e:headed

# All tests
pnpm test:all
```

### Backend Tests

```bash
cd backend
pip install -e ".[dev]"
pytest
```

---

## Development Workflow

### 1. Reader-Only Development

If working on reader features (not AI):

```bash
cd frontend
pnpm dev
```

No backend needed. Import EPUBs and test reading features.

### 2. Full-Stack Development

Run all three services. Use separate terminal windows or a process manager.

With `tmux`:
```bash
tmux new-session -d -s sveltereader
tmux split-window -h
tmux split-window -v
tmux send-keys -t 0 'cd agent && source .venv/bin/activate && langgraph dev' C-m
tmux send-keys -t 1 'cd backend && source .venv/bin/activate && uvicorn src.main:app --reload' C-m
tmux send-keys -t 2 'cd frontend && pnpm dev' C-m
tmux attach
```

### 3. Hot Reload

All three services support hot reload:
- **Frontend:** Vite auto-reloads on file changes
- **Backend:** uvicorn `--reload` flag
- **Agent:** langgraph dev watches for changes

---

## Troubleshooting

### "Cannot find module 'cyphertap'"

Submodule not initialized:
```bash
git submodule update --init --recursive
cd frontend && pnpm install
```

### "LLM_BASE_URL environment variable is required"

Create `.env` file in agent directory:
```bash
cd agent
cp .env.example .env
# Edit .env with your LLM settings
```

### "Connection refused" on port 2024

LangGraph agent not running. Start it:
```bash
cd agent
source .venv/bin/activate
langgraph dev --no-browser
```

### CORS errors in browser console

Backend not running or wrong port. Verify:
```bash
curl http://localhost:8000/health
# Should return: {"status":"healthy"}
```

### "epub.js" errors or blank reader

Make sure you're importing a valid EPUB file. Some DRM-protected EPUBs won't work.

### IndexedDB quota errors

Browser storage limit reached. Clear site data or use a different browser profile.

---

## Ports Summary

| Service | Port | URL |
|---------|------|-----|
| Frontend | 5173 | http://localhost:5173 |
| Backend | 8000 | http://localhost:8000 |
| Agent | 2024 | http://localhost:2024 |
| Ollama | 11434 | http://localhost:11434 |

---

## Next Steps

1. **Import an EPUB** - Test the reader
2. **Create annotations** - Highlight and add notes
3. **Try AI chat** - Ask questions about passages
4. **Connect CypherTap** - Login with Nostr key
5. **Add ecash** - Fund wallet for AI features

See [Features](features.md) for a complete feature list.

