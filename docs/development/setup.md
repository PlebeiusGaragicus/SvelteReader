# Setup Guide


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

---

# Deployment

IMPORTANT: this web app is still a work-in-progress and is NOT ready to be deployed.

EVERYTHING BELOW IS A WORK IN PROGRESS and should be ignored for now.

## Getting Started

```bash
# Clone with CypherTap submodule
git clone --recursive https://github.com/yourorg/SvelteReader.git
cd SvelteReader

# Start frontend (reader features only)
cd frontend
pnpm install
pnpm dev
```

Open http://localhost:5173 and import an EPUB to start reading.

For AI features, see the full [Setup Guide](setup.md).

---

## Deployment

This app is **100% client-side** and can be hosted on any static file server.  See [Deployment](./deployment.md)






## Static Hosting Compatibility

This app is **100% client-side** and can be hosted on any static file server:

- GitHub Pages
- Netlify
- Vercel (static)
- Cloudflare Pages
- Any HTTP file server

**No server-side code exists.**

## Code Analysis

### Route Files (all client-side)

| File | Purpose |
|------|---------|
| `src/routes/+layout.svelte` | App shell (TopBar, theme, toasts) |
| `src/routes/+page.svelte` | Library view (book grid) |
| `src/routes/book/[id]/+page.svelte` | Reader view |
| `src/routes/book/[id]/+page.ts` | Disables SSR |

**No server files:**

- ❌ No `+page.server.ts` (server-side data loading)
- ❌ No `+server.ts` (API endpoints)
- ❌ No `+layout.server.ts` (server-side layout data)

### Data Storage (browser only)

| Service | Storage | Server Needed? |
|---------|---------|----------------|
| Book metadata | localStorage | No |
| EPUB binaries | IndexedDB | No |
| Location cache | IndexedDB | No |
| EPUB rendering | epub.js iframe | No |
| Auth (CypherTap) | Nostr keys in browser | No |

## Current Adapter

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-auto';
```

`adapter-auto` detects the deployment platform automatically. Works for Vercel, Netlify, Cloudflare, etc.

## Static Adapter (for GitHub Pages)

To deploy to a pure static host like GitHub Pages:

### 1. Install adapter-static

```bash
npm install -D @sveltejs/adapter-static
```

### 2. Update svelte.config.js

```javascript
import adapter from '@sveltejs/adapter-static';

const config = {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html'  // SPA fallback for client-side routing
    })
  }
};

export default config;
```

### 3. Build

```bash
npm run build
```

Output goes to `build/` folder.

### 4. Deploy

Upload `build/` contents to your static host.

For GitHub Pages, you can use the `gh-pages` branch or GitHub Actions.

## SPA Fallback

The `fallback: 'index.html'` setting is critical. It ensures that direct navigation to `/book/abc123` works by serving `index.html` and letting the client-side router handle the path.

Without this, refreshing on a deep link would return 404.

## Environment Considerations

### CypherTap

CypherTap connects to:
- Nostr relays (WebSocket from browser)
- Cashu mints (HTTP from browser)

These are client-side network calls, not server dependencies.

### Future Backend

If pay-per-use AI features are added (per the project requirements), a backend server would be needed. At that point, consider:

- Separate API server
- Serverless functions (Vercel/Netlify functions)
- Keep frontend static, API separate
