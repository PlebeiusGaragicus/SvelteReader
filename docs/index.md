# SvelteReader

A nostr-native ebook reader with AI-powered annotations and ecash micropayments.

## What is SvelteReader?

SvelteReader is a proof-of-concept web application that demonstrates:

- **Nostr Authentication** — Login with your Nostr identity (npub)
- **Client-Side Storage** — All data stored in your browser, you own your data
- **eCash Payments** — Pay-per-use AI features with Cashu ecash tokens
- **Decentralized Sync** — Sync annotations across devices via Nostr relays

## Quick Links

| Document | Description |
|----------|-------------|
| [Setup Guide](setup.md) | Get SvelteReader running locally |
| [Features](features.md) | Complete feature list with status |
| [Architecture](architecture.md) | System design and data flow |
| [Design Decisions](design-decisions.md) | FAQ on why things are built this way |
| [Refactoring Guide](refactoring.md) | Areas needing improvement |

## Technical Deep Dives

| Document | Description |
|----------|-------------|
| [Agent RAG Architecture](agent-rag-architecture.md) | Agent-driven book retrieval with client-side tools |
| [AI Chat Integration](ai-chat-integration.md) | LangGraph agent setup and API |
| [Ecash Payment Flow](ecash-payment-flow.md) | Validate-then-redeem payment design |
| [Annotation Sync](annotation-sync-design.md) | Nostr-based annotation sync protocol |
| [Book Sync](book-sync-design.md) | Book announcements and ghost books |
| [Spectating](spectating.md) | Browse other users' libraries |

## Additional Resources

| Document | Description |
|----------|-------------|
| [Testing](testing.md) | Running unit and E2E tests |
| [Deployment](deployment.md) | Static hosting and configuration |
| [Chat Refactor](chat-refactor.md) | Planned chat UI improvements |
| [Roadmap](roadmap.md) | Future development priorities |

---

## Project Status

SvelteReader is a **proof-of-concept**. Core reading and annotation features work well. Some features (Nostr sync, multi-device) are partially implemented.

See [Refactoring Guide](refactoring.md) for known issues and improvement areas.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | SvelteKit 2 + Svelte 5, TailwindCSS 4 |
| EPUB | epub.js |
| Auth/Wallet | CypherTap (Nostr + Cashu) |
| Backend | FastAPI (Python 3.12+) |
| AI Agent | LangGraph + LangChain |
| Testing | Vitest + Playwright |

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

## License

MIT
