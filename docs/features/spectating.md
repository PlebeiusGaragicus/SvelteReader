# Spectating Feature

## Overview

The **Spectating** feature allows users to browse another Nostr user's library in read-only mode. This enables discovery of books and annotations without requiring the spectated user to be online or take any action. All data is fetched from Nostr relays and stored locally for offline viewing.

## User Journey

### 1. Initiating Spectate Mode

**Entry Point:** Eye icon button in the TopBar (right side, next to CypherTap login)

**Flow:**
1. User clicks the eye icon → popover opens with "Browse a user's library"
2. User enters an npub (Nostr public key in bech32 format)
3. User optionally specifies relay URLs (defaults provided)
4. User clicks "Browse this user's library"
5. System fetches profile, books, and annotations from specified relays
6. On success: page reloads, user enters spectate mode viewing the target's library

**Previously Viewed Users:**
- History of up to 10 previously spectated users is persisted to localStorage
- Users can quickly re-spectate from history with one click
- History entries store: pubkey, npub, profile info, relays, lastSynced timestamp

### 2. Spectate Mode Experience

**Visual Indicators:**
- Eye icon button turns blue with blue background tint
- TopBar shows "Currently spectating" button (replaces CypherTap login)
- Library header shows "{User}'s Library" with binoculars icon
- "View Only" badge displayed
- Middle-truncated npub shown under username (e.g., `npub1abc...xyz`)

**Restrictions (Read-Only):**
- Cannot create/edit/delete annotations
- Cannot edit book metadata
- Cannot delete books
- Cannot publish to Nostr
- Context menu (three-dot button) is hidden on book cards
- Text selection for annotation creation is disabled in reader
- SyncStatusButton is hidden (can't sync someone else's data)

**What Users CAN Do:**
- Browse the library
- Open and read books (if EPUB data exists locally)
- View existing annotations and highlights
- Navigate table of contents
- Use dark/light mode

### 3. Managing Spectate Session

**Currently Spectating Popover:**
- Shows profile picture and display name (if available)
- Shows middle-truncated npub
- Shows relative time since last sync (e.g., "5 minutes ago")
- **Sync button:** Re-fetch latest data from relays
- **Clear data button:** Delete locally stored data for this user
- **Exit Spectate Mode:** Return to own library

**History Management:**
- View previously spectated users
- Edit relay configuration per user
- Remove users from history
- Copy npub to clipboard

### 4. Exiting Spectate Mode

- Click "Exit Spectate Mode" in the popover
- Page reloads, user returns to their own library (if logged in) or welcome screen

---

## Technical Architecture

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/stores/spectate.svelte.ts` | Reactive state store for spectate mode |
| `src/lib/components/SpectateButton.svelte` | UI component for spectate controls |
| `src/lib/components/TopBar.svelte` | Integration point in app header |
| `src/lib/services/nostrService.ts` | `fetchRemoteUserData()` for fetching from relays |
| `src/routes/+layout.svelte` | Store initialization based on spectate state |
| `src/routes/+page.svelte` | Library view with spectate-aware rendering |
| `src/routes/book/[id]/+page.svelte` | Reader with spectate restrictions |

### State Management

**SpectateStore (`spectate.svelte.ts`):**
```typescript
interface SpectateTarget {
  pubkey: string;        // hex pubkey
  npub: string;          // bech32 for display
  profile?: NostrProfile;
  relays: string[];
  lastSynced?: number;   // timestamp
}

interface SpectateHistoryEntry {
  pubkey: string;
  npub: string;
  profile?: NostrProfile;
  relays: string[];
  lastSynced?: number;
}

// Reactive state (Svelte 5 runes)
let isSpectating = $state(false);
let target = $state<SpectateTarget | null>(null);
let history = $state<SpectateHistoryEntry[]>([]);
```

**Persistence:**
- `localStorage['sveltereader-spectate']` - Current spectate state (isSpectating, target)
- `localStorage['sveltereader-spectate-history']` - History array (up to 10 entries)

### Data Flow

```
User enters npub + relays
        ↓
SpectateButton.validateAndStartSpectating()
        ↓
nostrService.fetchRemoteUserData(pubkey, relays)
        ↓
    ┌───────────────────────────────────────┐
    │ Connects to relays via nostr-tools   │
    │ Subscribes to:                        │
    │   - kind 0 (profile)                  │
    │   - kind 30250 (books)                │
    │   - kind 30251 (annotations)          │
    │ Processes events with LWW merge       │
    └───────────────────────────────────────┘
        ↓
SpectateButton.storeFetchedData()
        ↓
    ┌───────────────────────────────────────┐
    │ Stores to IndexedDB:                  │
    │   - books (ownerPubkey = target)      │
    │   - annotations (ownerPubkey = target)│
    │ Updates spectate store                │
    └───────────────────────────────────────┘
        ↓
spectateStore.startSpectating()
        ↓
Page reload → +layout.svelte initializes stores with target pubkey
```

### Store Initialization

In `+layout.svelte`, stores are initialized based on spectate state:

```typescript
$effect(() => {
  if (spectateStore.isSpectating && spectateStore.target) {
    // Initialize with spectated user's pubkey
    books.initialize(spectateStore.target.pubkey);
    annotations.initialize(spectateStore.target.pubkey);
  } else if (cyphertap.pubkey) {
    // Initialize with logged-in user's pubkey
    books.initialize(cyphertap.pubkey);
    annotations.initialize(cyphertap.pubkey);
  }
});
```

### IndexedDB Schema

Books and annotations are scoped by `ownerPubkey`:

```typescript
// books store - indexed by 'by-owner' and 'by-sha256'
interface Book {
  id: string;
  ownerPubkey: string;  // ← scoping key
  sha256: string;
  title: string;
  // ...
}

// annotations store - indexed by 'by-owner'
interface Annotation {
  id: string;
  ownerPubkey: string;  // ← scoping key
  bookSha256: string;
  // ...
}
```

### Conditional UI Rendering

Components check `spectateStore.isSpectating` to adjust behavior:

```svelte
<!-- Hide context menu when spectating -->
{#if !spectateStore.isSpectating}
  <ContextMenu />
{/if}

<!-- Disable annotation creation in reader -->
epubService.onTextSelected((selection) => {
  if (isSpectating) {
    textSelection = null;
    return;
  }
  // ... handle selection
});
```

---

## Future Enhancement Ideas

### Discovery & Social
- [ ] **Public library listings** - Browse a directory of users who've opted-in to public discovery
- [ ] **Follow system** - Subscribe to users and get notified of new books/annotations
- [ ] **Recommendation engine** - "Users who read X also read Y"
- [ ] **Reading groups** - Shared annotations and discussions

### Data & Sync
- [ ] **Selective sync** - Choose which books to download EPUB data for
- [ ] **Background sync** - Periodically refresh spectated users' data
- [ ] **Offline indicators** - Show which books have local EPUB data vs. metadata only
- [ ] **Diff view** - Show what changed since last sync

### Annotations
- [ ] **Public annotations** - View-only access to highlights and notes
- [ ] **Annotation replies** - Comment on someone's annotations (requires new event kind)
- [ ] **Annotation sharing** - Share specific annotations via Nostr

### UI/UX
- [ ] **Quick switch** - Easily toggle between own library and spectated libraries
- [ ] **Multi-spectate** - View multiple users' libraries in tabs
- [ ] **Spectate from book** - "See who else is reading this book"
- [ ] **Profile cards** - Rich user profiles with reading stats

### Privacy & Permissions
- [ ] **Granular visibility** - Users control which books/annotations are public
- [ ] **Private spectating** - Don't announce that you're viewing someone's library
- [ ] **Block list** - Prevent specific users from spectating your library

---

## Nostr Event Kinds

| Kind | Purpose | NIP |
|------|---------|-----|
| 0 | User profile metadata | NIP-01 |
| 30250 | Book metadata (parameterized replaceable) | Custom |
| 30251 | Annotation (parameterized replaceable) | Custom |

**Book Event (kind 30250):**
```json
{
  "kind": 30250,
  "tags": [
    ["d", "<book-id>"],
    ["title", "Book Title"],
    ["author", "Author Name"],
    ["sha256", "<epub-hash>"],
    ["i", "isbn:<isbn>"]
  ],
  "content": "<optional cover base64>"
}
```

**Annotation Event (kind 30251):**
```json
{
  "kind": 30251,
  "tags": [
    ["d", "<annotation-id>"],
    ["a", "30250:<pubkey>:<book-id>"],
    ["book", "<book-sha256>"]
  ],
  "content": "{\"cfiRange\":\"...\",\"selectedText\":\"...\",\"note\":\"...\",\"color\":\"...\"}"
}
```

---

## Testing Considerations

### Manual Testing Checklist
- [ ] Spectate a user with books and annotations
- [ ] Spectate a user with no data
- [ ] Spectate with invalid npub
- [ ] Spectate with unreachable relays
- [ ] Sync after initial spectate
- [ ] Clear data for spectated user
- [ ] Exit spectate mode
- [ ] Re-spectate from history
- [ ] Edit relays for history entry
- [ ] Verify read-only restrictions in reader
- [ ] Verify context menu hidden on book cards
- [ ] Verify lastSynced persists across sessions

### Edge Cases
- User spectates themselves
- Spectated user has books but no EPUB data available
- Relay connection timeout
- Large number of books/annotations
- Concurrent spectate and login state changes
