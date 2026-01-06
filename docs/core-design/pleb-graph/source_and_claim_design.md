# Source and Claim Event Design Guide

This document specifies two **addressable Nostr event kinds** for building a decentralized knowledge graph:

1. **Source** (`kind: 31234`) — a citable unit of knowledge (definition, photo, document, dataset, etc.)
2. **Claim** (`kind: 31235`) — a narrative, annotation, or argument that references one or more sources

Together they form a "citation-first" knowledge system: the **source is the article**, and claims/narratives attach to it — inverting the Wikipedia model where narrative is primary and citations are footnotes.

---

## Design Philosophy

### No Single Source of Truth

Nostr is relay-based and pubkey-centric. This system **explicitly rejects** the notion of a single canonical authority.

- Two pubkeys can publish **divergent definitions** of the same term (e.g., "terrorism").
- Both versions coexist; neither is "correct" by protocol fiat.
- Resolution happens socially via **Claims** that argue for one interpretation, cite sources, and are themselves signed by pubkeys.

This mirrors nature: there is no single source of truth — only perspectives, evidence, and argument.

### Identity is Pubkey-Scoped

A **Source address** is the tuple `(kind, pubkey, d-tag)`.

- `"terrorism"` defined by pubkey `A` is a **different source** than `"terrorism"` defined by pubkey `B`.
- To reference "pubkey A's definition of terrorism", you use its address.
- To reference the exact revision you read, you also include the `event_id`.

### Sources Are Editable (Addressable)

Sources use an **addressable kind** (`31234` in range `30000–39999`), meaning:

- The `d` tag provides a stable identifier.
- Updates replace the prior version at that address.
- The `event_id` changes with each revision — capturing the "current version".

This allows fixing typos, improving citations, adding metadata — while the address remains stable for linking.

---

## Kind Definitions

| Purpose | Kind   | Type        |
|---------|--------|-------------|
| Source  | 31234  | Addressable |
| Claim   | 31235  | Addressable |

Both are in the addressable range per NIP-01: `30000 <= kind < 40000`.

---

## Source Event (`kind: 31234`)

A **Source** is the atomic unit of citable knowledge.

### Examples of Sources

- **Concept/definition**: "elenchus" — the Socratic method of cross-examination
- **Photo**: captured image of President Maduro (2026-01-02)
- **Document**: US Code Title 18 § 2331 (definition of terrorism)
- **Dataset**: Bitcoin block heights with timestamps
- **AI output**: GPT-4 response with usage metadata
- **Quote**: exact text from a book, speech, or post

### Event Structure

```json
{
  "kind": 31234,
  "pubkey": "<author-pubkey>",
  "created_at": <unix-timestamp>,
  "tags": [
    ["d", "<stable-source-identifier>"],
    ["title", "<human-readable-title>"],
    ["source_type", "<type>"],
    ["t", "<topic-tag>"],
    ["alt", "<short-description-for-accessibility>"]
  ],
  "content": "<stringified-JSON-or-markdown>",
  "id": "<event-id>",
  "sig": "<signature>"
}
```

### Required Tags

| Tag | Description |
|-----|-------------|
| `d` | Stable identifier for the source. Forms part of the address tuple. |
| `title` | Human-readable title for display. |
| `source_type` | Category of source (see below). |

### Optional Tags

| Tag | Description |
|-----|-------------|
| `t` | Topic/hashtag for discoverability (repeatable). |
| `alt` | Accessibility description / short summary. |
| `published_at` | Original publication timestamp (stringified unix seconds). |
| `language` | ISO 639-1 language code (e.g., `"en"`). |
| `r` | External URL reference (e.g., original web source). |
| `license` | License identifier (e.g., `"CC-BY-4.0"`, `"public-domain"`). |

### Source Types

The `source_type` tag categorizes the source. Suggested values:

| Value | Description |
|-------|-------------|
| `concept` | Definition, term, idea |
| `photo` | Photograph or image |
| `document` | Legal document, official text |
| `paper` | Academic paper |
| `book` | Book or book excerpt |
| `article` | News article, blog post |
| `dataset` | Structured data |
| `ai_output` | AI-generated content with model metadata |
| `quote` | Direct quotation |
| `transcript` | Audio/video transcript |
| `code` | Source code snippet |

Implementations SHOULD accept unknown types gracefully.

### Content Format

The `content` field is a **stringified JSON object** with the source body and citation metadata:

```json
{
  "body": "The elenchus (pronounced 'el-en-kus') is the Socratic method...",
  "citation": {
    "style": "apa",
    "text": "Plato. (c. 399 BCE). Apology. Athens."
  },
  "metadata": {}
}
```

#### Content Fields

| Field | Required | Description |
|-------|----------|-------------|
| `body` | Yes | The source content (markdown text, description, or structured data). |
| `citation` | No | Citation object with `style` and `text`. |
| `metadata` | No | Arbitrary metadata (e.g., AI model info, EXIF data). |

#### Citation Styles

| Style | Use Case |
|-------|----------|
| `mla` | Modern Language Association |
| `apa` | American Psychological Association |
| `chicago` | Chicago Manual of Style |
| `ieee` | IEEE citation format |
| `bibtex` | BibTeX entry |
| `ai-model` | AI inference metadata (model, tokens, timestamp) |
| `custom` | Free-form citation |

#### AI Output Metadata Example

For `source_type: "ai_output"`:

```json
{
  "body": "The elenchus is a dialectical method...",
  "citation": {
    "style": "ai-model",
    "text": "Generated by GPT-4 (gpt-4-0125-preview)"
  },
  "metadata": {
    "model": "gpt-4-0125-preview",
    "provider": "openai",
    "timestamp": "2026-01-02T15:30:00Z",
    "prompt_hash": "a1b2c3...",
    "usage": {
      "prompt_tokens": 150,
      "completion_tokens": 200
    }
  }
}
```

---

## Handling Binary Data (Photos, Files)

### Design Decision

Binary data (images, PDFs, etc.) **MUST NOT** be embedded as base64 in the event content.

### Production Approach (TBD)

For production deployments, use one of:

1. **NIP-94 File Metadata** (`kind: 1063`) + NIP-96 upload service
   - Upload file to a blossom/NIP-96 server
   - Create a `kind: 1063` event with `url`, `m` (mime), `x` (sha256), etc.
   - Reference the file event from your Source via `e` tag

2. **IPFS / content-addressed storage**
   - Store file on IPFS
   - Reference by CID in Source content or `r` tag

3. **Blossom (BUD-01)**
   - Upload to blossom server
   - Reference by sha256 hash URL

### Demo/Local Implementation

For demo software and local development:

- Store binary files in **browser localStorage / IndexedDB**
- Reference via local file paths or database keys
- The Source event stores a **reference** (path, key, or hash), not the data itself

Example content for a photo source (demo mode):

```json
{
  "body": "Photograph of President Maduro in custody, taken 2026-01-02",
  "citation": {
    "style": "custom",
    "text": "Digital photograph via Truth Social post by @realDonaldTrump, 2026-01-02"
  },
  "metadata": {
    "file_ref": {
      "storage": "indexeddb",
      "key": "photos/maduro-custody-2026-01-02",
      "mime": "image/jpeg",
      "sha256": "abc123..."
    },
    "provenance": "Screenshot of printed digital photograph"
  }
}
```

---

## Claim Event (`kind: 31235`)

A **Claim** is a narrative, annotation, argument, or statement that **references one or more Sources**.

### Purpose

- Make assertions about sources
- Synthesize multiple sources into an argument
- Annotate or comment on a source
- Propose a resolution when sources conflict

### Event Structure

```json
{
  "kind": 31235,
  "pubkey": "<author-pubkey>",
  "created_at": <unix-timestamp>,
  "tags": [
    ["d", "<stable-claim-identifier>"],
    ["title", "<claim-title>"],
    ["claim_type", "<type>"],
    ["a", "31234:<source-pubkey>:<source-d>", "<relay-hint>"],
    ["e", "<source-event-id>", "<relay-hint>", "<source-pubkey>"],
    ["t", "<topic-tag>"]
  ],
  "content": "<stringified-JSON-or-markdown>",
  "id": "<event-id>",
  "sig": "<signature>"
}
```

### Required Tags

| Tag | Description |
|-----|-------------|
| `d` | Stable identifier for this claim. |
| `title` | Human-readable title. |
| `claim_type` | Category of claim (see below). |

### Source Reference Tags

Each cited source SHOULD include:

| Tag | Purpose |
|-----|---------|
| `a` | Address of the source (`31234:<pubkey>:<d>`) — the "blue link" to the source object |
| `e` | Event ID of the specific revision cited — pins the exact version |

Including **both** `a` and `e` for each source provides:
- **Durability**: `a` tag follows the source through updates
- **Precision**: `e` tag captures exactly what was read/cited
- **Change detection**: compare current source `event_id` to cited `e` to detect updates

#### Structured Source Reference (Optional)

For richer citation data, use a custom `src` tag:

```json
["src", "31234:<pubkey>:<d>", "<event_id>", "<locator>"]
```

Where `<locator>` is optional and can be:
- `#p=3` — paragraph index
- `#s=introduction` — section identifier
- `t=120..140` — timestamp range (seconds) for audio/video
- `q=abc123` — hash of quoted text for verification

### Claim Types

| Value | Description |
|-------|-------------|
| `definition` | Proposes a canonical definition by citing sources |
| `annotation` | Commentary on a single source |
| `argument` | Logical argument citing multiple sources |
| `synthesis` | Combines multiple sources into a summary |
| `correction` | Disputes or corrects a source |
| `timeline` | Chronological arrangement of sources |
| `comparison` | Compares/contrasts multiple sources |

### Content Format

```json
{
  "text": "The term 'terrorism' has no universally accepted definition...",
  "sources": [
    {
      "ref": "31234:<pubkey-a>:<terrorism-usg>",
      "event_id": "abc123...",
      "label": "USG definition",
      "note": "US Code Title 18 § 2331"
    },
    {
      "ref": "31234:<pubkey-b>:<terrorism-colloquial>",
      "event_id": "def456...",
      "label": "Colloquial usage",
      "note": "Common usage in Portland, OR activist communities"
    }
  ],
  "conclusion": "These definitions diverge on the question of state actors..."
}
```

---

## Addressing and Referencing

### The Address Tuple

For addressable events, identity is:

```
(kind, pubkey, d-tag)
```

Encoded in an `a` tag as:

```
["a", "<kind>:<pubkey>:<d>"]
```

Example:
```
["a", "31234:a1b2c3d4e5f6...:<terrorism-usg>"]
```

### Event ID vs Address

| Identifier | Meaning | Use When |
|------------|---------|----------|
| Address (`a` tag) | "This source object" | You want to follow updates, link to "the concept" |
| Event ID (`e` tag) | "This exact revision" | You want to pin a specific version, detect changes |
| Both | "This object, as I saw it" | Best practice for citations |

### NIP-19 Encoding

For sharing links:

| Type | Encodes | Example Use |
|------|---------|-------------|
| `naddr` | Address (kind+pubkey+d+relays) | Shareable link to a source |
| `nevent` | Event ID (+author+relays) | Link to specific revision |

A "blue link" in the UI would typically be an `naddr` — clicking it resolves to the latest version of that source.

---

## Conflict Resolution Pattern

When two pubkeys have divergent definitions of the same term:

1. **Both sources exist** at different addresses (different pubkeys)
   - `31234:<alice>:terrorism` — Alice's definition
   - `31234:<bob>:terrorism` — Bob's definition

2. **A Claim resolves the conflict** by:
   - Citing both sources
   - Arguing for one interpretation
   - Being signed by its author's pubkey

3. **Users choose** which claims/sources to trust based on:
   - Pubkey reputation (web of trust)
   - Quality of argument
   - Citation depth
   - Community consensus (likes, reposts, replies)

This is **social consensus**, not protocol-enforced truth.

---

## Relay Query Patterns (TBD)

The following patterns are candidates for implementation. Final selection depends on relay support and performance testing.

### Pattern 1: Query by Address

Fetch the latest version of a source:

```json
{
  "kinds": [31234],
  "authors": ["<pubkey>"],
  "#d": ["<d-tag>"]
}
```

### Pattern 2: Query by Event ID

Fetch a specific revision:

```json
{
  "ids": ["<event-id>"]
}
```

### Pattern 3: Query Claims Citing a Source

Find all claims that reference a source address:

```json
{
  "kinds": [31235],
  "#a": ["31234:<pubkey>:<d>"]
}
```

### Pattern 4: Query by Topic

Find sources/claims on a topic:

```json
{
  "kinds": [31234, 31235],
  "#t": ["terrorism"]
}
```

### Pattern 5: Full-Text Search (Relay-Dependent)

Some relays support NIP-50 search:

```json
{
  "kinds": [31234],
  "search": "elenchus socratic"
}
```

### Open Questions

- Which relays to prioritize for this use case?
- Caching strategy for frequently-accessed sources?
- How to handle relay disagreement on "latest" version?
- Outbox model (NIP-65) integration?

---

## Example: Complete Source Event

```json
{
  "kind": 31234,
  "pubkey": "a1b2c3d4e5f6789...",
  "created_at": 1735840000,
  "tags": [
    ["d", "elenchus"],
    ["title", "Elenchus"],
    ["source_type", "concept"],
    ["t", "philosophy"],
    ["t", "socratic-method"],
    ["language", "en"],
    ["alt", "The Socratic method of cross-examination"]
  ],
  "content": "{\"body\":\"The elenchus (pronounced 'el-en-kus') is the Socratic method of questioning that involves:\\n- Cross-examination of someone's beliefs or claims\\n- Exposing contradictions in their reasoning\\n- Demonstrating the limits of their knowledge through careful questioning\",\"citation\":{\"style\":\"custom\",\"text\":\"Derived from Plato's dialogues, particularly the Apology and Euthyphro.\"}}",
  "id": "event123...",
  "sig": "sig..."
}
```

## Example: Complete Claim Event

```json
{
  "kind": 31235,
  "pubkey": "b2c3d4e5f6789a...",
  "created_at": 1735841000,
  "tags": [
    ["d", "elenchus-modern-application"],
    ["title", "The Elenchus in Modern Critical Thinking"],
    ["claim_type", "synthesis"],
    ["a", "31234:a1b2c3d4e5f6789...:elenchus", "wss://relay.example.com"],
    ["e", "event123...", "wss://relay.example.com", "a1b2c3d4e5f6789..."],
    ["a", "31234:c3d4e5f6789a1b2...:critical-thinking", "wss://relay.example.com"],
    ["t", "philosophy"],
    ["t", "education"]
  ],
  "content": "{\"text\":\"The Socratic elenchus remains foundational to modern critical thinking pedagogy. By systematically questioning assumptions, educators can...\",\"sources\":[{\"ref\":\"31234:a1b2c3d4e5f6789...:elenchus\",\"event_id\":\"event123...\",\"label\":\"Elenchus definition\"},{\"ref\":\"31234:c3d4e5f6789a1b2...:critical-thinking\",\"event_id\":\"event456...\",\"label\":\"Critical thinking methods\"}]}",
  "id": "claim789...",
  "sig": "sig..."
}
```

---

## Summary

| Aspect | Source (`31234`) | Claim (`31235`) |
|--------|------------------|-----------------|
| Purpose | Citable knowledge unit | Narrative/argument citing sources |
| Identity | `(31234, pubkey, d)` | `(31235, pubkey, d)` |
| Editable | Yes (addressable) | Yes (addressable) |
| Version | `event_id` | `event_id` |
| References | May link to files, external URLs | MUST reference ≥1 source via `a`/`e` tags |

### Key Principles

1. **No single source of truth** — divergent sources coexist
2. **Pubkey-scoped identity** — "your definition" vs "my definition"
3. **Address for identity, event_id for version**
4. **Citation-first** — the source IS the article
5. **Social resolution** — claims argue, users decide

---

## Related Documents

- `event_vs_address.md` — Nostr event ID vs address fundamentals
- NIP-01 — Basic protocol, addressable event semantics
- NIP-23 — Long-form content (prior art for addressable articles)
- NIP-94 — File metadata (for binary attachments)

---

## Status

- **Draft** — ready for implementation feedback
- **Kind numbers**: `31234` (source), `31235` (claim) — finalized
- **Binary handling**: TBD for production; demo uses IndexedDB references
- **Relay patterns**: TBD pending testing
