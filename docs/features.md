# Features

SvelteReader is a nostr-native ebook reader with AI-powered annotations and ecash micropayments.

## Core Features

### Library Management

| Feature | Status | Description |
|---------|--------|-------------|
| EPUB Import | ✅ | Import EPUB files from local filesystem |
| Book Grid | ✅ | Visual library with cover images and progress bars |
| Reading Progress | ✅ | Track and display reading progress per book |
| Delete Books | ✅ | Remove books via context menu |
| Ghost Books | ✅ | Show synced annotations even without EPUB downloaded |
| SHA-256 Identity | ✅ | Content-addressable books by file hash |

### Reader

| Feature | Status | Description |
|---------|--------|-------------|
| Paginated Reading | ✅ | Rendered via epub.js in iframe |
| Progress Tracking | ✅ | CFI-based position saving |
| Table of Contents | ✅ | Left sidebar with chapter navigation |
| Annotations Panel | ✅ | Right sidebar showing highlights and notes |
| Keyboard Navigation | ✅ | Arrow keys for pages, Escape to close panels |
| Dark/Light Mode | ✅ | Theme sync via mode-watcher |
| Text Selection | ✅ | Highlight and annotate selected text |
| Responsive Resize | ✅ | Handles window resize gracefully |

### Annotations

| Feature | Status | Description |
|---------|--------|-------------|
| Create Highlights | ✅ | Select text and choose highlight color |
| Add Notes | ✅ | Attach notes to highlights |
| Edit/Delete | ✅ | Modify or remove annotations |
| Color Options | ✅ | Yellow, green, blue, pink |
| Composite Keys | ✅ | Annotations keyed by `bookSha256:cfiRange` |
| Page/Chapter Display | ✅ | Runtime-computed from CFI |

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

### Sync (Nostr Protocol)

| Feature | Status | Description |
|---------|--------|-------------|
| Annotation Publishing | 🚧 | Publish annotations as kind 30078 events |
| Book Announcements | 🚧 | Publish book metadata as kind 30801 events |
| Multi-Device Sync | 🚧 | Fetch annotations from relays on login |
| LWW Conflict Resolution | ✅ | Last Write Wins via `created_at` |
| Relay Configuration | 🚧 | User-configurable relay list |

### Spectating

| Feature | Status | Description |
|---------|--------|-------------|
| Browse Others' Libraries | ✅ | Read-only view of another user's books |
| Spectate History | ✅ | Remember previously viewed users |
| Relay Customization | ✅ | Specify relays for each spectated user |
| Visual Indicators | ✅ | Blue tint and badges for spectate mode |
| Read-Only Enforcement | ✅ | Disable edit actions when spectating |

---

## Planned Features

### Annotation Enhancements
- [ ] Search annotations by text/note content
- [ ] Filter annotations by color, book, date
- [ ] Export annotations as Markdown/JSON
- [ ] Bulk operations (delete, export, publish)

### Book Discovery
- [ ] Browse public annotations by book SHA-256
- [ ] Discover books through shared annotations
- [ ] Follow other readers' annotations

### Reader Improvements
- [ ] In-book search
- [ ] Font size / reading theme settings
- [ ] Multiple file import
- [ ] Collections / tags
- [ ] Reading statistics

### Social Features
- [ ] View annotations from followed users
- [ ] Annotation reactions/replies
- [ ] Book clubs / shared reading groups

### Offline & Multi-Device
- [ ] Queue sync operations when offline
- [ ] Sync pending changes on reconnect
- [ ] Reading position sync via Nostr

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend Framework | SvelteKit 2 + Svelte 5 |
| Styling | TailwindCSS 4 |
| UI Components | bits-ui, vaul-svelte |
| EPUB Rendering | epub.js |
| Client Storage | IndexedDB (books) + localStorage (state) |
| Nostr/eCash | CypherTap component |
| Backend | FastAPI (Python 3.12+) |
| AI Agent | LangGraph + LangChain |
| Testing | Vitest (unit) + Playwright (E2E) |

---

## Legend

- ✅ Implemented
- 🚧 Partially implemented / In progress
- [ ] Planned

