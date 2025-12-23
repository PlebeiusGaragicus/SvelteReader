# Design Decisions FAQ

This document explains the key design decisions in SvelteReader and the reasoning behind them.

---

## Authentication & Identity

### Why Nostr instead of traditional auth (email/password, OAuth)?

**Decision:** Users authenticate via Nostr public keys (npubs) using the CypherTap component.

**Reasoning:**
- **Sovereignty:** Users own their identity (private key), not the platform
- **Portability:** Same identity works across all Nostr-compatible apps
- **No email:** No PII collection, no password reset flows, no email verification
- **Censorship resistance:** No central authority can ban a user

**Trade-offs:**
- Key management is user's responsibility (can be complex)
- No account recovery if private key is lost
- Less familiar UX for mainstream users

---

### Why no server-side user accounts?

**Decision:** All user data is stored client-side (browser) with optional sync to Nostr relays.

**Reasoning:**
- **Privacy:** User data never touches our servers
- **Simplicity:** No user database to manage, secure, or GDPR-comply with
- **Offline-first:** App works without internet after initial load
- **Cost:** No database hosting costs that scale with users

**Trade-offs:**
- Data lost if browser storage cleared (unless synced to Nostr)
- No server-side features (email notifications, etc.)
- Multi-device requires Nostr sync (not instant)

---

## Payments

### Why ecash (Cashu) instead of Stripe or subscriptions?

**Decision:** Users pay per AI message using Cashu ecash tokens.

**Reasoning:**
- **Micropayments:** Pay 1 sat per message (fractions of a cent)
- **No accounts:** No Stripe account, credit card, or identity required
- **Privacy:** Bearer tokens, no payment history linked to identity
- **Instant:** No payment processing delays
- **Global:** Works anywhere Bitcoin/Lightning works

**Trade-offs:**
- Users must acquire Bitcoin/Lightning sats first
- Ecash is less familiar than credit cards
- Wallet balance management UX is new

---

### Why pay-per-message instead of subscriptions?

**Decision:** Each AI message costs a fixed amount (default: 1 sat).

**Reasoning:**
- **Fairness:** Pay only for what you use
- **Low barrier:** Try for 1 sat, no monthly commitment
- **Scalability:** Heavy users pay more, light users pay less
- **Simplicity:** No subscription tiers, no billing cycles

**Trade-offs:**
- Less predictable revenue for operator
- Friction on every message (mitigated by wallet balance)
- No "unlimited" option for power users (yet)

---

### Why validate-then-redeem instead of redeem-then-process?

**Decision:** Validate ecash tokens before LLM processing, redeem only on success.

**Reasoning:**
- **Zero fund loss:** If LLM fails, user keeps their sats
- **Trust:** Users don't pay for failed requests
- **Recovery:** Client can self-redeem unredeemed tokens

**Trade-offs:**
- Server does work before payment (minor DoS vector)
- More complex payment flow
- Requires NUT-07 state checking

---

## Data & Storage

### Why SHA-256 for book identity?

**Decision:** Books are identified by the SHA-256 hash of their EPUB file, not by title or local ID.

**Reasoning:**
- **Content-addressable:** Same book = same hash, regardless of filename
- **Deduplication:** Multiple users syncing same book share annotations
- **Verification:** Can verify EPUB matches expected hash
- **Cross-device:** Annotations link to book by hash, not device-specific ID

**Trade-offs:**
- Different EPUB editions = different hashes (even minor changes)
- Hash computation adds import latency (~500ms for large files)
- No fuzzy matching for "same book, different edition"

---

### Why IndexedDB + localStorage instead of just one?

**Decision:** Large data (EPUBs, annotations) in IndexedDB; small state (theme, spectate) in localStorage.

**Reasoning:**
- **IndexedDB:** Designed for large binary blobs, supports transactions
- **localStorage:** Synchronous, simple API, good for small config
- **Separation:** Keeps frequently-accessed config fast
- **Quotas:** IndexedDB has higher storage limits

**Trade-offs:**
- Two storage APIs to manage
- Sync between them if needed
- Different browser support characteristics

---

### Why ghost books?

**Decision:** Annotations can exist for books that aren't downloaded locally.

**Reasoning:**
- **Sync-first:** Download annotations from Nostr before downloading EPUBs
- **Storage saving:** Don't need EPUB to see annotation list
- **Discovery:** See what books others annotate before committing to download
- **Multi-device:** Annotations sync immediately, EPUBs sync when needed

**Trade-offs:**
- Can't read book content without EPUB
- UI must handle "book without data" state
- SHA-256 verification needed when uploading EPUB later

---

## Sync & Protocol

### Why Nostr instead of a custom sync protocol?

**Decision:** Use Nostr protocol (NIPs) for annotation and book sync.

**Reasoning:**
- **Decentralized:** No single point of failure or control
- **Interoperable:** Other Nostr apps can read/write same data
- **Relay diversity:** User chooses which relays to use
- **Social potential:** Follow other readers, discover books

**Trade-offs:**
- Nostr relays may not store data forever
- Eventual consistency (not real-time sync)
- Custom event kinds (30800, 30801) may not be widely supported

---

### Why addressable events (kind 30000+) instead of regular notes?

**Decision:** Use addressable events for annotations and books.

**Reasoning:**
- **Updatable:** Edit annotations without creating duplicates
- **Deletable:** Publish tombstone to "delete" an annotation
- **LWW:** Last write wins, simple conflict resolution
- **Deduplication:** Relays keep only latest event per d-tag

**Trade-offs:**
- More complex event structure
- Requires d-tag management
- Some relays may not fully support NIP-33

---

### Why Last Write Wins (LWW) for conflict resolution?

**Decision:** When annotations conflict, the one with later `created_at` wins.

**Reasoning:**
- **Simplicity:** No CRDT complexity
- **Predictable:** User understands "latest edit wins"
- **Nostr-native:** Uses existing `created_at` field
- **No merge conflicts:** Never need to resolve conflicting edits

**Trade-offs:**
- Concurrent edits lose data (last one overwrites)
- Clock skew can cause issues
- No rich merge (both versions preserved)

---

## AI Integration

### Why self-hosted LangGraph instead of OpenAI API directly?

**Decision:** AI runs through a self-hosted LangGraph agent, not direct API calls.

**Reasoning:**
- **Flexibility:** Use any OpenAI-compatible LLM (Ollama, vLLM, etc.)
- **Control:** Run inference on own hardware
- **Privacy:** Conversations don't go to OpenAI by default
- **Extensibility:** Add tools, RAG, multi-step reasoning
- **Cost:** Self-hosted inference can be cheaper at scale

**Trade-offs:**
- More infrastructure to manage
- Need GPU for good performance
- LangGraph learning curve

---

### Why not default to OpenAI?

**Decision:** No hardcoded OpenAI defaults. Users must configure LLM endpoint.

**Reasoning:**
- **Philosophy:** Avoid vendor lock-in, support open models
- **Privacy:** User controls where their data goes
- **Cost transparency:** User pays their own inference costs
- **Local-first:** Encourage local LLM experimentation

**Trade-offs:**
- More setup required
- No "just works" experience
- Users must understand LLM options

---

## Frontend

### Why Svelte 5 with runes instead of Svelte 4 stores?

**Decision:** Use Svelte 5 runes (`$state`, `$derived`, `$effect`) for new code.

**Reasoning:**
- **Future-proof:** Runes are the future of Svelte
- **Fine-grained:** Better reactivity control
- **TypeScript:** Better type inference than stores
- **Simpler:** No subscription boilerplate

**Trade-offs:**
- Mixing patterns with existing Svelte 4 stores
- Runes still evolving (potential API changes)
- Learning curve for Svelte 4 developers

---

### Why epub.js instead of alternatives?

**Decision:** Use epub.js for EPUB rendering.

**Reasoning:**
- **Mature:** Well-established library with active community
- **Features:** CFI support, pagination, search
- **Iframe isolation:** Secure content rendering
- **Customizable:** Themes, fonts, layout options

**Trade-offs:**
- Large bundle size
- Types are incomplete/missing
- Some APIs are callback-based (not async/await)
- Requires browser environment (no SSR)

---

### Why disable SSR for the reader page?

**Decision:** `export const ssr = false` on `/book/[id]` route.

**Reasoning:**
- **epub.js requirement:** Needs DOM APIs (window, document)
- **IndexedDB:** Can't access browser storage server-side
- **Performance:** No benefit to SSR for authenticated content

**Trade-offs:**
- Slightly slower initial load
- No SEO (but reader content shouldn't be indexed anyway)
- Must handle loading state client-side

---

## Backend

### Why FastAPI instead of Node.js?

**Decision:** Python backend with FastAPI.

**Reasoning:**
- **LangChain ecosystem:** LangGraph, LangChain are Python-first
- **AI tooling:** Python has best ML/AI library support
- **Type hints:** FastAPI's Pydantic models are excellent
- **Performance:** Async support, uvicorn is fast

**Trade-offs:**
- Different language than frontend
- Python packaging can be complex
- Less isomorphic code sharing

---

### Why Cashu wallet in backend instead of direct redemption?

**Decision:** Backend has a Cashu wallet for token redemption.

**Reasoning:**
- **Separation:** Agent doesn't need wallet dependencies
- **Flexibility:** Backend can aggregate tokens, withdraw to Lightning
- **Security:** Wallet keys only on backend, not in agent
- **Abstraction:** API hides ecash complexity

**Trade-offs:**
- Additional service to run
- Backend must be trusted with funds
- More complex deployment

---

## Security & Privacy

### Why store ecash tokens in logs during development?

**Decision:** Full tokens logged for recovery during POC phase.

**Reasoning:**
- **Recovery:** If funds are lost due to bugs, can manually recover
- **Debugging:** See exact token flow through system
- **POC phase:** Will be removed before production

**Trade-offs:**
- Tokens visible in logs (security risk)
- Log storage requirements
- Must disable before production

