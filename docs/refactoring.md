# Refactoring Guide

This document identifies areas of the codebase that need improvement as SvelteReader matures from proof-of-concept to production.

## High Priority

### 1. Nostr Sync Implementation

**Current State:** Types and stores prepared but sync not fully wired up.

**Issues:**
- `nostrService.ts` exists but annotation/book publishing not complete
- `SyncStatusButton` UI ready but missing actual sync logic
- Relay configuration hardcoded or incomplete

**TODO:**
- [ ] Complete `publishAnnotation()` in nostrService
- [ ] Complete `publishBook()` for kind 30801 events
- [ ] Implement `fetchUserAnnotations()` on login
- [ ] Add relay configuration UI
- [ ] Handle offline queue and retry logic
- [ ] Test LWW conflict resolution

**Files:**
- `frontend/src/lib/services/nostrService.ts`
- `frontend/src/lib/stores/annotations.svelte.ts`
- `frontend/src/lib/components/reader/SyncStatusButton.svelte`

---

### 2. Error Handling Consolidation

**Current State:** Mix of try/catch, custom `AppError`, and unhandled rejections.

**Issues:**
- Inconsistent error display (some toast, some console)
- `AppError` class defined but not used everywhere
- No centralized error boundary

**TODO:**
- [ ] Create error boundary component for routes
- [ ] Standardize on `AppError` for all user-facing errors
- [ ] Add consistent toast notifications for errors
- [ ] Improve error messages with actionable guidance
- [ ] Add error logging service (optional: send to backend)

**Files:**
- `frontend/src/lib/types/index.ts` (AppError definition)
- All service files

---

### 3. IndexedDB Schema Migrations

**Current State:** Schema version bumps handled manually.

**Issues:**
- No migration framework for schema changes
- Adding `ownerPubkey` index required careful handling
- Future changes will be risky without proper migrations

**TODO:**
- [ ] Create migration system with version tracking
- [ ] Document IndexedDB schema in a central location
- [ ] Add rollback support for failed migrations
- [ ] Test data preservation across upgrades

**Files:**
- `frontend/src/lib/services/storageService.ts`

---

### 4. Chat Thread Persistence

**Current State:** Chat threads managed by LangGraph server, not persisted locally.

**Issues:**
- Thread history lost if server restarts
- No offline viewing of past conversations
- `chatThreadIds` on annotations not fully utilized

**TODO:**
- [ ] Persist chat messages to IndexedDB
- [ ] Link threads to annotations via `chatThreadIds`
- [ ] Support offline viewing of chat history
- [ ] Sync thread references to Nostr (optional)

**Files:**
- `frontend/src/lib/stores/chat.svelte.ts`
- `frontend/src/lib/services/langgraph.ts`

---

## Medium Priority

### 5. Component Size Reduction

**Current State:** Several large components with mixed concerns.

**Files to Split:**

| Component | Lines | Suggested Split |
|-----------|-------|-----------------|
| `book/[id]/+page.svelte` | ~400 | Extract annotation creation logic |
| `ChatThread.svelte` | ~200 | Extract message list, input handling |
| `AnnotationsPanel.svelte` | ~250 | Extract annotation item component |

---

### 6. Type Safety Improvements

**Current State:** Some `any` types and loose typing.

**Issues:**
- epub.js types are incomplete/missing
- Some Nostr event types hand-rolled
- LangGraph SDK types not fully utilized

**TODO:**
- [ ] Create proper epub.js type declarations
- [ ] Use nostr-tools types consistently
- [ ] Add stricter TypeScript settings (`strict: true` if not already)
- [ ] Remove `as any` casts

---

### 7. Testing Coverage

**Current State:** Basic E2E tests, minimal unit tests.

**Gaps:**
- Store logic not unit tested
- Annotation CRUD flow not E2E tested
- Chat flow not tested
- Spectate mode not tested

**TODO:**
- [ ] Add unit tests for stores (books, annotations, chat)
- [ ] Add E2E tests for annotation flow
- [ ] Add E2E tests for AI chat (mock backend)
- [ ] Add E2E tests for spectate mode
- [ ] Set up CI with test running

---

### 8. Accessibility (a11y)

**Current State:** Basic ARIA where bits-ui provides it.

**Gaps:**
- Reader keyboard navigation incomplete
- Screen reader support untested
- Focus management in modals/panels

**TODO:**
- [ ] Audit with axe or similar tool
- [ ] Add keyboard shortcuts documentation
- [ ] Ensure all interactive elements are focusable
- [ ] Add skip links for reader navigation

---

## Low Priority

### 9. Performance Optimization

**Current State:** Works well for typical use (few books, <100 annotations).

**Potential Issues at Scale:**
- Large annotation sets may slow rendering
- Location cache computation is CPU-intensive
- Cover images stored as base64 (large)

**TODO:**
- [ ] Virtualize annotation lists
- [ ] Lazy-load book covers
- [ ] Add performance monitoring
- [ ] Consider Web Workers for heavy computation

---

### 10. Code Organization

**Current State:** Reasonable structure, some inconsistencies.

**Suggestions:**
- [ ] Standardize on `.svelte.ts` for stores using runes
- [ ] Move all Nostr-related code to `lib/nostr/` directory
- [ ] Create `lib/utils/` for shared helpers
- [ ] Add barrel exports (`index.ts`) for cleaner imports

---

### 11. Backend Improvements

**Current State:** Minimal FastAPI backend, works for POC.

**TODO:**
- [ ] Add request validation with Pydantic models
- [ ] Add rate limiting
- [ ] Add proper logging (structured JSON)
- [ ] Add metrics endpoint for monitoring
- [ ] Consider adding Redis for session/cache

**Files:**
- `backend/src/main.py`
- `backend/src/routers/`

---

### 12. Agent Enhancements

**Current State:** Single chat node, no tools.

**TODO:**
- [ ] Add book search tool
- [ ] Add citation extraction tool
- [ ] Support multi-turn reasoning
- [ ] Add configurable system prompts
- [ ] Support different models per use case

**Files:**
- `agent/src/agent/graph.py`

---

## Technical Debt Summary

| Area | Severity | Effort | Impact |
|------|----------|--------|--------|
| Nostr Sync | High | Large | Core feature incomplete |
| Error Handling | High | Medium | Poor user experience |
| IndexedDB Migrations | High | Medium | Risk of data loss |
| Chat Persistence | Medium | Medium | Feature completeness |
| Testing | Medium | Large | Regression prevention |
| Type Safety | Medium | Medium | Developer experience |
| Accessibility | Medium | Medium | User inclusivity |
| Performance | Low | Medium | Scale preparation |

---

## Recommended Order

1. **Nostr Sync** - Complete the core differentiating feature
2. **Error Handling** - Improve user experience
3. **Testing** - Prevent regressions before adding features
4. **Chat Persistence** - Complete the AI feature loop
5. **IndexedDB Migrations** - Prepare for future schema changes
6. Everything else as time permits

