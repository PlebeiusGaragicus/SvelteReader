# Architecture

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | SvelteKit 2 + Svelte 5 |
| Styling | TailwindCSS 4 |
| EPUB Rendering | epub.js |
| Storage | IndexedDB (books) + localStorage (metadata) |
| Nostr/eCash | CypherTap component |
| Testing | Playwright (E2E) |

## Project Structure

```
frontend/
├── src/
│   ├── routes/              # SvelteKit pages
│   │   ├── +page.svelte     # Library (home)
│   │   ├── +layout.svelte   # App shell
│   │   └── book/[id]/       # Reader page
│   ├── lib/
│   │   ├── components/      # UI components
│   │   │   ├── reader/      # Reader sub-components
│   │   │   ├── BookCard.svelte
│   │   │   ├── ImportButton.svelte
│   │   │   └── TopBar.svelte
│   │   ├── services/        # Business logic
│   │   │   ├── epubService.ts    # EPUB parsing/rendering
│   │   │   └── storageService.ts # IndexedDB operations
│   │   ├── stores/          # Svelte stores
│   │   │   └── books.ts     # Book library state
│   │   └── types/           # TypeScript definitions
│   │       └── index.ts     # Shared types + errors
│   └── app.css              # Global styles + CSS variables
├── e2e/                     # Playwright tests
└── static/                  # Static assets
```

## Data Flow

```
User imports EPUB
       ↓
epubService.parseEpub() → extracts metadata + cover
       ↓
books.addBook() → saves metadata to localStorage
       ↓
storageService.storeEpubData() → saves binary to IndexedDB
       ↓
User opens book
       ↓
storageService.getEpubData() → retrieves binary
       ↓
epubService.renderBook() → renders in iframe
       ↓
Progress saved on navigation → books.updateProgress()
```

## Key Design Decisions

- **Client-side only**: All data stored in browser (IndexedDB + localStorage)
- **SSR disabled** for reader page (epub.js requires browser APIs)
- **Singleton service**: `epubService` manages one book at a time
- **Centralized types**: All interfaces in `$lib/types/index.ts`
- **Error handling**: Custom `AppError` class with error codes

---

# Features

## Library View (`/`)

- **Book grid** with cover images and progress bars
- **Import EPUB** files from local filesystem
- **Delete books** via context menu on hover
- **Empty state** with call-to-action when no books
- **Dark mode** by default (via mode-watcher)

## Reader View (`/book/[id]`)

- **Paginated reading** with epub.js
- **Progress tracking** with CFI-based position saving
- **Table of Contents** panel (left sidebar)
- **Annotations panel** (right sidebar) - UI ready, highlighting TBD
- **Settings panel** (right sidebar) - placeholder for font/theme controls
- **Keyboard navigation**: Arrow keys for pages, Escape to close panels
- **Responsive resize** handling
- **Theme sync** with app dark/light mode

## Storage

- **Book metadata**: localStorage (title, author, progress, annotations)
- **EPUB binaries**: IndexedDB (large file storage)
- **Location cache**: IndexedDB (speeds up page number calculation)

## Integrations

- **CypherTap**: Nostr authentication + eCash wallet (in TopBar)
- Ready for pay-per-use AI features (not yet implemented)

## Not Yet Implemented

- Text highlighting and annotation creation
- In-book search
- Font size / reading theme settings
- Export annotations
- Multiple file import
- Collections / tags
- Reading statistics
