### Library Management

| Feature | Status | Description |
|---------|--------|-------------|
| EPUB Import | ✅ | Import EPUB files from local filesystem |
| Book Grid | ✅ | Visual library with cover images and progress bars |
| Reading Progress | ✅ | Track and display reading progress per book |
| Delete Books | ✅ | Remove books via context menu |
| Ghost Books | ✅ | Show synced annotations even without EPUB downloaded |
| SHA-256 Identity | ✅ | Content-addressable books by file hash |

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


# Book Sync Design

> Design document for Nostr-based book announcements and sync.

## Overview

SvelteReader extends its annotation-first sync to include **book announcements**:
- Books can be "announced" to Nostr with metadata and cover image
- Annotations reference their parent book announcement via NIP-01 `a` tag
- Ghost books can be created from synced book announcements (metadata only, no EPUB)
- Users can "complete" ghost books by uploading matching EPUBs (SHA-256 verified)

## User Flow

### 1. Book Upload & Announcement

```
User uploads EPUB
        ↓
Extract metadata (title, author, cover, SHA-256)
        ↓
Show "Book Announcement" modal
  - Preview/edit title, author
  - Crop cover to ~128x192 (2:3 ratio, ~15KB base64)
  - Choose: "Publish" or "Local Only"
        ↓
If "Publish":
  - Create addressable book event (kind 30801)
  - Set book.isPublic = true
  - All annotations for this book auto-publish to Nostr
        ↓
If "Local Only":
  - No Nostr event created
  - book.isPublic = false
  - All annotations for this book stay local
```

### 2. Sync & Ghost Books

```
User clicks "Sync" button
        ↓
Fetch user's book announcements (kind 30801)
Fetch user's annotations (kind 30800)
        ↓
For each book announcement:
  - If SHA-256 matches local book → update metadata
  - If SHA-256 not found locally → create ghost book
        ↓
Ghost book appears in library with:
  - Cover image (from announcement)
  - Title/author metadata
  - Ghost icon overlay
  - "..." menu with "Upload EPUB" option
```

### 3. Completing Ghost Books

```
User clicks "Upload EPUB" on ghost book
        ↓
File picker opens
        ↓
Compute SHA-256 of uploaded file
        ↓
If SHA-256 matches ghost book:
  - Store EPUB data
  - Set hasEpubData = true
  - Book becomes fully readable
        ↓
If SHA-256 doesn't match:
  - Show error: "This EPUB doesn't match the expected book"
  - Suggest: "Expected SHA: abc123..."
```

### 4. Editing Book Metadata

```
User opens book settings
        ↓
Edit title, author, cover
        ↓
If book.isPublic:
  - Republish book announcement event
  - Relays replace old event (addressable)
        ↓
If book is local only:
  - Update local metadata only
```

## Data Structures

### Extended Book Type

```typescript
interface Book extends BookIdentity, BookLocal {
  // Existing fields...
  
  // New Nostr sync fields
  isPublic?: boolean;              // Published to Nostr
  nostrEventId?: string;           // Book announcement event ID
  nostrCreatedAt?: number;         // Event created_at for LWW
  relays?: string[];               // Relay URLs where published
  syncPending?: boolean;           // Local changes not yet published
}
```

### Book Announcement Event (kind 30801)

Addressable event for book metadata:

```json
{
  "kind": 30801,
  "pubkey": "<user-pubkey>",
  "created_at": 1703100000,
  "tags": [
    ["d", "<sha256>"],                    // Book SHA-256 as unique identifier
    ["title", "The Great Gatsby"],
    ["author", "F. Scott Fitzgerald"],
    ["isbn", "978-0743273565"],           // Optional
    ["year", "1925"],                     // Optional
    ["image", "data:image/jpeg;base64,/9j/4AAQ..."],  // Cover image (data URL)
    ["r", "wss://relay1.example"],        // Relay hints
    ["r", "wss://relay2.example"]
  ],
  "content": "",                          // Empty or optional description
  "sig": "<signature>"
}
```

**Why kind 30801?**
- Addressable range (30000-39999)
- Adjacent to annotation kind 30800
- Unique per pubkey + kind + d-tag (SHA-256)

**Cover Image Constraints:**
- Format: JPEG (best compression for photos)
- Dimensions: ~128x192 pixels (2:3 aspect ratio, book cover standard)
- Max size: ~20KB base64 encoded
- Embedded as data URL per NIP-100 discussion

### Updated Annotation Event (kind 30800)

Annotations now reference their book announcement:

```json
{
  "kind": 30800,
  "pubkey": "<user-pubkey>",
  "created_at": 1703100000,
  "tags": [
    ["d", "<book-sha256>:<cfi-range>"],   // Composite unique identifier
    ["a", "30801:<pubkey>:<book-sha256>", "wss://relay.example"],  // Reference to book
    ["color", "yellow"],                   // Optional: highlight color
    ["r", "wss://relay1.example"],
    ["r", "wss://relay2.example"]
  ],
  "content": "{\"text\":\"selected text\",\"note\":\"user note\"}",
  "sig": "<signature>"
}
```

**The `a` tag:**
- Format: `["a", "<kind>:<pubkey>:<d-tag>", "<relay-hint>"]`
- Links annotation to its book announcement
- Enables clients to fetch book metadata for annotations
- Per NIP-01 standard for addressable event references

### Book Deletion (Tombstone)

```json
{
  "kind": 30801,
  "pubkey": "<user-pubkey>",
  "created_at": 1703100001,
  "tags": [
    ["d", "<sha256>"]
  ],
  "content": "{\"deleted\":true}",
  "sig": "<signature>"
}
```

## UI Components

### 1. Book Announcement Modal

New modal shown after EPUB upload:

```
┌─────────────────────────────────────┐
│  Announce Book                   ✕  │
├─────────────────────────────────────┤
│  ┌─────────┐                        │
│  │  Cover  │  Title: [___________]  │
│  │  Image  │  Author: [__________]  │
│  │ (crop)  │  Year: [____]          │
│  └─────────┘  ISBN: [___________]   │
│                                     │
│  ○ Publish to Nostr                 │
│    Annotations will be synced       │
│                                     │
│  ○ Local Only                       │
│    Keep book private                │
│                                     │
│  [Cancel]              [Save Book]  │
└─────────────────────────────────────┘
```

**Cover Cropping:**
- Use a simple cropper (e.g., `svelte-easy-crop` or custom)
- Fixed 2:3 aspect ratio
- Output: 128x192 JPEG, quality ~0.7
- Show file size estimate

### 2. Extended BookCard Menu

For ghost books, add "Upload EPUB" option:

```
┌──────────────────┐
│ 📤 Upload EPUB   │  ← New option for ghost books
│ ───────────────  │
│ 🗑️ Delete...     │
└──────────────────┘
```

For published books, add "Edit Metadata" option:

```
┌──────────────────┐
│ ✏️ Edit Metadata │  ← Opens announcement modal
│ 🔄 Republish     │  ← Force republish
│ ───────────────  │
│ 🗑️ Delete...     │
└──────────────────┘
```

### 3. Enhanced Sync Status

Update `SyncStatusButton` popover:

```
┌─────────────────────────────────┐
│  Nostr Sync           Connected │
├─────────────────────────────────┤
│  Last sync: 5m ago              │
│  Books: 12 synced               │  ← New
│  Annotations: 47 synced         │
│  Ghost books: 2                 │  ← New
│                                 │
│  [Sync Now]                     │
└─────────────────────────────────┘
```

### 4. Settings Panel

The global settings panel now shows informational text about per-book sync:

```
┌─────────────────────────────────┐
│  Settings                       │
├─────────────────────────────────┤
│  ℹ️ Nostr Sync                   │
│                                 │
│  Annotation syncing is          │
│  controlled per-book. Choose    │
│  "Publish to Nostr" or "Local   │
│  Only" when importing a book.   │
│                                 │
│  Change via book card menu →    │
│  "Edit Metadata"                │
└─────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Core Types & Services

1. **Update types** (`frontend/src/lib/types/index.ts`)
   - Add `isPublic`, `nostrEventId`, `nostrCreatedAt`, `relays`, `syncPending` to `Book`

2. **Create book Nostr types** (`frontend/src/lib/types/nostr.ts`)
   - Add `BOOK_EVENT_KIND = 30801`
   - Add `bookToEvent()`, `eventToBook()` functions
   - Add `bookDeletionEvent()` function

3. **Extend nostrService** (`frontend/src/lib/services/nostrService.ts`)
   - Add `publishBook()`, `fetchBooks()`, `publishBookDeletion()`

4. **Update annotation events**
   - Add `a` tag reference to book announcement in `annotationToEvent()`

### Phase 2: Sync Store Updates

1. **Extend syncStore** (`frontend/src/lib/stores/sync.svelte.ts`)
   - Fetch both books and annotations
   - Track book sync stats
   - Create ghost books for unknown SHA-256s

2. **Update books store** (`frontend/src/lib/stores/books.ts`)
   - Add `mergeFromNostr()` for book sync
   - Add `setCyphertap()` for publishing
   - Add `publishBook()`, `republishBook()` methods

### Phase 3: UI Components

1. **BookAnnouncementModal** (new component)
   - Cover cropper
   - Metadata editor
   - Publish/Local toggle

2. **Update BookCard**
   - Add "Upload EPUB" menu item for ghost books
   - Add "Edit Metadata" menu item for published books

3. **Update SyncStatusButton**
   - Show book sync stats
   - Show ghost book count

4. **Update ImportButton**
   - Trigger BookAnnouncementModal after EPUB processing

### Phase 4: Ghost Book Completion

1. **EPUB upload for ghost books**
   - File picker in BookCard menu
   - SHA-256 verification
   - Error handling for mismatches

2. **Update library page**
   - Visual distinction for ghost books
   - Upload prompt on ghost book click

## Cover Image Processing

### Cropping & Compression

```typescript
async function processCoverImage(
  imageBlob: Blob,
  targetWidth: number = 128,
  targetHeight: number = 192
): Promise<string> {
  // 1. Load image
  const img = await createImageBitmap(imageBlob);
  
  // 2. Create canvas with target dimensions
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d')!;
  
  // 3. Calculate crop (center crop to 2:3 ratio)
  const sourceRatio = img.width / img.height;
  const targetRatio = targetWidth / targetHeight;
  
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (sourceRatio > targetRatio) {
    // Source is wider - crop sides
    sw = img.height * targetRatio;
    sx = (img.width - sw) / 2;
  } else {
    // Source is taller - crop top/bottom
    sh = img.width / targetRatio;
    sy = (img.height - sh) / 2;
  }
  
  // 4. Draw cropped & scaled image
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
  
  // 5. Export as JPEG data URL
  return canvas.toDataURL('image/jpeg', 0.7);
}
```

### Size Estimation

- 128x192 JPEG at quality 0.7 ≈ 5-15KB
- Base64 encoding adds ~33% overhead
- Final data URL: ~7-20KB
- Well within Nostr event size limits (~64KB typical)

## Conflict Resolution

Same as annotations: **Last Write Wins (LWW)** using `created_at`.

- Book metadata updates replace previous versions
- Relays keep only latest event per pubkey+kind+d-tag
- Local changes marked `syncPending` until published

## Migration

No migration needed - new fields are optional and additive.

## Security Considerations

1. **Cover images**: Validate MIME type, limit size before base64 encoding
2. **SHA-256 verification**: Always verify uploaded EPUBs match expected hash
3. **Private books**: `isPublic: false` books never publish events
4. **Relay selection**: Use user's configured relays, not hardcoded

## Future Enhancements

1. **Social discovery**: Browse other users' book announcements
2. **Book recommendations**: Based on shared annotations
3. **Reading groups**: Shared book lists with friends
4. **EPUB sharing**: Optional encrypted EPUB sharing (separate NIP)


---

## Future Roadmap:

- [ ] Browse public annotations by book SHA-256
- [ ] Discover books through shared annotations

### Book Discovery
- [ ] Browse public annotations by book SHA-256
- [ ] Discover books through shared annotations
- [ ] Follow other readers' annotations

