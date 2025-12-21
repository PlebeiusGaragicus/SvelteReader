# SvelteReader Roadmap

> Development roadmap following the annotation-first architecture refactor.

## ✅ Completed: Data Structure Refactor

The core annotation sync architecture is complete:

- **Types**: `BookIdentity`, `BookLocal`, `Book`, `Annotation`, `AnnotationLocal`, `AnnotationDisplay`
- **IndexedDB v2**: Separate `books` and `annotations` stores with proper indexes
- **Stores**: Reactive Svelte stores for books and annotations with async persistence
- **Composite Keys**: Annotations keyed by `bookSha256:cfiRange`
- **SHA-256 on Import**: Content-addressable book identification
- **Ghost Books**: Support for annotations without downloaded EPUB
- **UI Components**: Updated `BookCard`, `AnnotationPopup`, `AnnotationsPanel`

---

### Testing
- [ ] Add E2E tests for annotation create/edit/delete flow
- [ ] Add E2E tests for ghost book scenarios
- [ ] Add unit tests for edge cases in stores

### Documentation
- [ ] Update README with new architecture overview
- [ ] Add developer setup guide


Per the design in `docs/annotation-sync-design.md`:

### Annotation Publishing
- [ ] Implement kind 30078 addressable event creation
- [ ] Sign events with user's private key
- [ ] Publish to configured relays
- [ ] Store `nostrEventId` and `relays` after publish
- [ ] Add per-annotation publish toggle in UI

### Annotation Syncing
- [ ] Query relays for user's annotations on login
- [ ] Parse `d` tag to extract `bookSha256:cfiRange`
- [ ] Create/update local annotations from events
- [ ] Create ghost books for unknown `bookSha256` values
- [ ] Handle LWW conflict resolution via `created_at`

### Deletion Sync
- [ ] Publish tombstone events (`{"deleted": true}`)
- [ ] Handle incoming tombstone events
- [ ] Clean up local annotations on tombstone receipt

### Relay Management
- [ ] Add relay configuration UI
- [ ] Support multiple relays with hints
- [ ] Handle relay failures gracefully

---

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

### Book Discovery
- [ ] Browse public annotations by book SHA-256
- [ ] Discover books through shared annotations
- [ ] Follow other readers' annotations

### AI Chat Integration
- [ ] Persist chat threads in IndexedDB
- [ ] Link chat threads to annotations via `chatThreadIds`
- [ ] Sync chat context across sessions

---

### Offline Support
- [ ] Queue sync operations when offline
- [ ] Sync pending changes on reconnect
- [ ] Show sync status indicator

### Multi-Device
- [ ] Reading position sync via Nostr
- [ ] Book metadata sync
- [ ] Conflict resolution for reading progress

### Social Features
- [ ] View annotations from followed users
- [ ] Annotation reactions/replies
- [ ] Book clubs / shared reading groups

---

## Technical Debt

- [ ] Consolidate error handling patterns
- [ ] Add comprehensive logging for debugging
- [ ] Performance optimization for large annotation sets

---

## Notes

- Nostr integration uses **Addressable Events (kind 30078)** for update/delete support
- **Last Write Wins (LWW)** conflict resolution using `created_at` timestamps
- Ghost books enable annotation sync before book download
- Local-only fields (`chatThreadIds`) are never broadcast to Nostr
