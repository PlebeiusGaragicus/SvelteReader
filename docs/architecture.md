# Architecture

SvelteReader is a three-tier application: a Svelte frontend, FastAPI backend, and LangGraph AI agent.

## System Overview

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│   Svelte Frontend   │────▶│   FastAPI Backend    │────▶│  LangGraph Agent    │
│   (Port 5173)       │     │   (Port 8000)        │     │  (Port 2024)        │
│                     │     │                      │     │                     │
│  - EPUB Reader      │     │  - Chat API          │     │  - AI Assistant     │
│  - Annotations      │     │  - Wallet Service    │     │  - Payment Verify   │
│  - CypherTap        │     │  - CORS + Routing    │     │  - LLM Processing   │
└─────────────────────┘     └──────────────────────┘     └─────────────────────┘
         │                           │                            │
         │                           │                            │
         ▼                           ▼                            ▼
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  Browser Storage    │     │   Cashu Wallet       │     │  OpenAI-Compatible  │
│  IndexedDB + local  │     │   (ecash backend)    │     │  LLM Endpoint       │
└─────────────────────┘     └──────────────────────┘     └─────────────────────┘
         │
         ▼
┌─────────────────────┐
│   Nostr Relays      │
│   (Sync + Auth)     │
└─────────────────────┘
```

## Frontend Architecture

### Directory Structure

```
frontend/src/
├── routes/                     # SvelteKit pages
│   ├── +layout.svelte          # App shell (TopBar, theme, init)
│   ├── +page.svelte            # Library view (book grid)
│   └── book/[id]/              # Reader view
│       ├── +page.svelte        # Reader component
│       └── +page.ts            # SSR disabled for epub.js
├── lib/
│   ├── components/             # UI components
│   │   ├── chat/               # AI chat interface
│   │   │   ├── ChatThread.svelte
│   │   │   ├── ChatInput.svelte
│   │   │   ├── ChatHistory.svelte
│   │   │   └── messages/
│   │   ├── reader/             # Reader sub-components
│   │   │   ├── AnnotationsPanel.svelte
│   │   │   ├── TocPanel.svelte
│   │   │   └── ...
│   │   ├── BookCard.svelte
│   │   ├── ImportButton.svelte
│   │   ├── SpectateButton.svelte
│   │   └── TopBar.svelte
│   ├── services/               # Business logic
│   │   ├── epubService.ts      # EPUB parsing/rendering
│   │   ├── storageService.ts   # IndexedDB operations
│   │   ├── langgraph.ts        # LangGraph SDK wrapper
│   │   └── nostrService.ts     # Nostr relay operations
│   ├── stores/                 # Svelte stores
│   │   ├── books.ts            # Book library state
│   │   ├── annotations.svelte.ts
│   │   ├── chat.svelte.ts
│   │   └── spectate.svelte.ts
│   └── types/                  # TypeScript definitions
│       └── index.ts            # Shared types + errors
├── app.css                     # Global styles
└── app.html                    # HTML template
```

### Storage Architecture

| Store | Technology | Contents |
|-------|------------|----------|
| Book metadata | IndexedDB `books` | Title, author, progress, sync state |
| EPUB binaries | IndexedDB `epubs` | Raw EPUB file data |
| Location cache | IndexedDB `locations` | Pre-computed page locations |
| Annotations | IndexedDB `annotations` | Highlights, notes, CFI ranges |
| App state | localStorage | Theme, spectate state, history |

### Data Flow

```
User imports EPUB
       ↓
epubService.parseEpub() → extracts metadata + cover
       ↓
Compute SHA-256 hash (content-addressable identity)
       ↓
books store → saves to IndexedDB
       ↓
User opens book
       ↓
storageService.getEpubData() → retrieves binary
       ↓
epubService.renderBook() → renders in iframe
       ↓
Progress saved on navigation
```

## Backend Architecture

### Directory Structure

```
backend/src/
├── main.py                     # FastAPI app with CORS
├── routers/
│   ├── chat.py                 # Chat endpoints (stream + non-stream)
│   └── wallet.py               # Ecash wallet operations
└── services/
    ├── langgraph_client.py     # LangGraph SDK wrapper
    └── wallet.py               # Cashu wallet integration
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat/message` | POST | Send message, get complete response |
| `/api/chat/message/stream` | POST | Send message, stream response via SSE |
| `/api/chat/thread` | POST | Create new conversation thread |
| `/api/chat/thread/{id}` | GET | Get thread state and history |
| `/api/chat/thread/{id}` | DELETE | Delete conversation thread |
| `/api/wallet/receive` | POST | Receive ecash token |
| `/api/wallet/balance` | GET | Get wallet balance |
| `/health` | GET | Health check |

## Agent Architecture

### LangGraph State Machine

```
┌─────────────────┐
│     START       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ validate_payment│────▶│      END        │ (if payment invalid)
└────────┬────────┘     └─────────────────┘
         │ (if valid)
         ▼
┌─────────────────┐
│     chat        │ → Invoke LLM with context
└────────┬────────┘
         │
         ▼ (on success: redeem token)
┌─────────────────┐
│      END        │
└─────────────────┘
```

### Agent State

```python
class AgentState(TypedDict):
    messages: list[BaseMessage]      # Conversation history
    passage_context: PassageContext  # Book/chapter/highlighted text
    payment: PaymentInfo             # Ecash token from client
    payment_validated: bool          # Token checked
    payment_token: str               # Token to redeem on success
    refund: bool                     # Signal client to self-recover
```

## Key Design Patterns

### Client-Side First
- All user data stored in browser (IndexedDB + localStorage)
- No server-side user accounts or data persistence
- CypherTap handles auth (Nostr keys) and wallet (ecash)

### Content-Addressable Books
- Books identified by SHA-256 of EPUB file
- Annotations linked to book via hash, not local ID
- Enables cross-device sync and deduplication

### Validate-Then-Redeem Payments
- Token validated (unspent check) before processing
- Token redeemed only after successful LLM response
- On failure, client self-redeems (zero fund loss)

### SSR Disabled for Reader
- epub.js requires browser APIs (DOM, Canvas)
- Reader page uses `export const ssr = false`
- Static site compatible with SPA fallback

### Singleton EPUB Service
- One book rendered at a time
- Manages iframe lifecycle
- Handles text selection callbacks

## External Dependencies

### CypherTap (Submodule)
Client-side component providing:
- Nostr authentication (NIP-07 / nsec)
- Cashu ecash wallet
- Dark mode toggle
- Lightning deposits

### Nostr Relays
For sync and discovery:
- User profile (kind 0)
- Book announcements (kind 30801)
- Annotations (kind 30800)

### Cashu Mints
For ecash operations:
- Token generation (CypherTap)
- Token redemption (backend wallet)
- NUT-07 state checking

### LLM Providers
Any OpenAI-compatible endpoint:
- Ollama (local)
- vLLM (self-hosted)
- LM Studio (desktop)
- OpenRouter, Together AI, etc.
