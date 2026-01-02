# Annotation Sync Design


SvelteReader takes an **annotation-first** approach to sync:
- Annotations are the primary synced data
- Books are identified by SHA-256 hash (content-addressable)
- Users can selectively publish annotations to Nostr relays
- Annotations can exist without the book downloaded ("ghost books")

---

`Nostr Integration` and `Addressable Events`

see [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)

Annotations use **Addressable Events** rather than regular notes:

| Event Type | Kind Range | Behavior |
|------------|------------|----------|
| Regular | 1-9999 | Stored permanently, immutable |
| Replaceable | 10000-19999 | Latest event per pubkey+kind wins |
| Ephemeral | 20000-29999 | Not stored |
| **Addressable** | **30000-39999** | Latest event per pubkey+kind+d-tag wins |

**Why Addressable?**
- User can **update** an annotation (edit note, change color)
- User can **delete** by publishing empty/tombstone event
- Unique identifier: `pubkey + kind + d-tag`
- Only latest version stored by relays

---

Nostr serves two purposes:
1. **Social discoverability** — Find annotations from other readers
2. **Data storage / sync** — Persist and sync user's own annotations across devices

---

`sync flow`:


**Publishing:**
1. User creates/edits annotation locally
2. If `isPublic` or sync enabled, sign and publish addressable event
3. Store `nostrEventId` locally for reference

**Fetching (fresh install):**
1. User logs in with Nostr identity
2. Query relays: `{"kinds": [30078], "authors": ["<pubkey>"]}`
3. For each event, parse `d` tag to extract `bookSha256` and `cfiRange`
4. Create/update local annotations
5. Create ghost books for unknown `bookSha256` values

**Deletion:**
1. Publish event with same `d` tag, `content: {"deleted": true}`
2. Relays replace old event with tombstone
3. Other clients see deletion on sync


## Current Implementation:

### Book Identity (Publishable)

Fields that can be broadcast to Nostr for book discovery:

```typescript
interface BookIdentity {
  sha256: string;              // SHA-256 of EPUB file (primary identifier)
  title: string;
  author: string;
  isbn?: string;               // ISBN-10 or ISBN-13
  year?: number;               // Publication year
  coverBase64?: string;        // Base64-encoded cover image
}
```

### Book Local (Not Published)

Local reading state, never broadcast:

```typescript
interface BookLocal {
  id: string;                  // Local UUID (IndexedDB key)
  sha256: string;              // Links to BookIdentity + Annotations
  progress: number;            // 0-100
  currentPage: number;
  totalPages: number;
  currentCfi?: string;
  hasEpubData: boolean;        // false = "ghost book"
  defaultPublishAnnotations?: boolean;
}
```

### Combined Book Type

```typescript
interface Book extends BookIdentity, BookLocal {}
```

### Annotation (Publishable Core)

```typescript
type AnnotationColor = 'yellow' | 'green' | 'blue' | 'pink';

interface Annotation {
  bookSha256: string;                // Links to book by content hash
  cfiRange: string;                  // EPUB CFI location
  // Composite key: bookSha256 + ":" + cfiRange (no separate UUID needed)
  text: string;                      // Selected text
  highlightColor?: AnnotationColor | null;
  note?: string;
  createdAt: number;                 // Unix timestamp (ms)
  
  // Nostr sync state
  nostrEventId?: string;             // Set after publish
  relays?: string[];                 // Relay URLs where published
  isPublic?: boolean;                // User opted to broadcast
}
```

### Annotation Local (Extended)

Local-only fields, never broadcast:

```typescript
interface AnnotationLocal extends Annotation {
  chatThreadIds?: string[];          // AI chat thread references
}
```

### Annotation Display (Runtime Only)

Computed at runtime, never stored:

```typescript
interface AnnotationDisplay extends AnnotationLocal {
  page: number;                      // Derived from CFI + locations
  chapter?: string;                  // Derived from CFI + TOC
}
```

## Storage Architecture

### IndexedDB Schema

```
sveltereader (v2)
├── epubs          key: Book.id → ArrayBuffer
├── locations      key: Book.id → JSON string
├── books          key: Book.id → Book
│   └── index: by-sha256
└── annotations    key: Annotation.id → AnnotationLocal
    └── index: by-book (bookSha256)
```



## Delete Operations

| Action | Effect |
|--------|--------|
| **Delete Book** | Removes EPUB data, locations, book metadata. If annotations exist, sets `hasEpubData: false` (becomes ghost book). |
| **Delete Annotations** | Removes all annotations for `bookSha256`. |
| **Delete All Data** | Removes book + annotations completely. |

## Conflict Resolution

**Last Write Wins (LWW)** using `createdAt` timestamp.

- Simple and predictable
- Nostr events have native `created_at` field
- No complex CRDT overhead


### Annotation Event Structure

```json
{
  "kind": 30078,                    // Custom addressable kind for annotations
  "pubkey": "<user-pubkey>",
  "created_at": 1703100000,
  "tags": [
    ["d", "<book-sha256>:<cfi-range>"],  // Composite unique identifier
    ["color", "yellow"],                  // Optional: highlight color
    ["r", "wss://relay1.example"],        // Relay hints
    ["r", "wss://relay2.example"]
  ],
  "content": "{\"text\":\"selected text\",\"note\":\"user note\"}",
  "sig": "<signature>"
}
```

### Event Content (JSON)

```typescript
interface AnnotationEventContent {
  text: string;           // Selected text from book
  note?: string;          // User's note
  deleted?: boolean;      // Tombstone for deletion
}
```


### Local Annotation Fields for Sync

```typescript
interface Annotation {
  // Core fields (composite key: bookSha256 + cfiRange)
  bookSha256: string;
  cfiRange: string;
  text: string;
  highlightColor?: AnnotationColor | null;
  note?: string;
  createdAt: number;
  
  // Nostr sync state
  nostrEventId?: string;           // Event ID after publish
  nostrCreatedAt?: number;         // Event created_at for LWW
  relays?: string[];               // Relay URLs where published
  isPublic?: boolean;              // User opted to broadcast
  syncPending?: boolean;           // Local changes not yet published
}
```


## Feature Roadmap:

- [ ] Queue sync operations when offline
- [ ] Sync pending changes on reconnect

- [ ] Search annotations by text/note content
- [ ] Filter annotations by color, book, date
- [ ] Export annotations as Markdown/JSON/HTML

### Deletion Sync
- [ ] Publish tombstone events (`{"deleted": true}`)
- [ ] Handle incoming tombstone events
- [ ] Clean up local annotations on tombstone receipt

### Annotation Syncing
- [ ] Query relays for user's annotations on login
- [ ] Parse `d` tag to extract `bookSha256:cfiRange`
- [ ] Create/update local annotations from events
- [ ] Create ghost books for unknown `bookSha256` values
- [ ] Handle LWW conflict resolution via `created_at`

### Annotation Management
- [ ] Search annotations by text/note content
- [ ] Filter annotations by color, book, date
- [ ] Sort annotations by various criteria
- [ ] Bulk operations (delete, export, publish)

### Export & Sharing
- [ ] Export annotations as Markdown
- [ ] Export annotations as JSON
- [ ] Generate shareable annotation links
- [ ] Import annotations from JSON

### Relay Management
- [ ] Add relay configuration UI
- [ ] Support multiple relays with hints
- [ ] Handle relay failures gracefully

### Annotation Publishing
- [ ] Implement kind 30078 addressable event creation
- [ ] Sign events with user's private key
- [ ] Publish to configured relays
- [ ] Store `nostrEventId` and `relays` after publish
- [ ] Add per-annotation publish toggle in UI


## Technical Debt

- [ ] Consolidate error handling patterns
- [ ] Add comprehensive logging for debugging
- [ ] Performance optimization for large annotation sets
