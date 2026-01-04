# SvelteReader

**Important information for coding agents:**

1. Always read the docs!

1. We always ensure to both review documentation and keep it up-to-date with code changes.  Instead of adding new files, we keep updates terse and contained in the files that reference the features.  We don't include verbose changelogs or list of refactored code elements - we simply update the existing documentation to match.

1. The submodules in this repo are for **reference only** - our Svelte frontend/ contains our web app.

1. Project structure:

  - **`docs/`** - our MKDocs documentation hosted on Github Pages
  - **`frontend/`** - Svelte 5 web app
  - **`backend/`** - FastAPI backend for accepting payments - used by our LangGraph agents for payment validation and redemption
  - **`agent/`** - Self-hosted LangGraph agents for AI chat

  - **`cyphertap`** is our fork of the repository since its `npm` library is out-of-date.  We build from and use our local submodule since it has new features not included in the origional repository. **Changes may be made to this submodule in order to further bugfix/develop its features!**

## Reference repositories

  - **`nutshell/`** a python library which handles self-custody ecash wallets - it is used in our FastAPI backend/ to store user's funds which were spent to pay for usage of our agents.

  - **`deepagents/`** is a LangGraph library which demonstrates a `deepagent` whose capabilities can be extended with `Middleware`.  We custom-build out own agents using `create_agent()` similarly to the deepagent library.

  - **`deep-agent-ui`** is another React frontend that demonstrates a chat UI between a user and a LangGraph `deepagent` capable of tool calling.

  - **`fullstack-chat-client`** is an example React frontend for demonstrating a chat UI between a user and LangGraph agent capable of tool calling.

### `git clone`

NOTE: these 'reference repositories' may be cloned in the references/ directory so that they're available for review

```sh
cd references

### fullstack-chat-client
git clone https://github.com/PlebeiusGaragicus/fullstack-chat-client

### deepagents
git clone https://github.com/langchain-ai/deepagents

### deep-agents-ui
git clone https://github.com/langchain-ai/deep-agents-ui

### nutshell
git clone https://github.com/cashubtc/nutshell
```


---

**Humans:** see our [docs](https://plebeiusgaragicus.github.io/SvelteReader/) for information.

Run all three services for full-stack development:

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

---

**Fresh install setup**

```sh
# / frontend
git submodule update --init --recursive
cd frontend
pnpm install
# build cyphertap
cd ../cyphertap
pnpm install
pnpm build
cd ..


# run frontend with...
cd frontend
pnpm run dev


# /backend
cd backend
python -m venv .venv
source .venv/bin/activate

# run backend with...
uvicorn src.main:app --reload --port 8000


# /agent
cd agent
python -m venv .venv
source .venv/bin/activate
pip install -e . "langgraph-cli[inmem]"

# run agent with...
langgraph dev --no-browser



```

**Running test**

```bash
# frontend tests
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

```bash
# backend tests
cd backend
pip install -e ".[dev]"
pytest
```