## Event IDs (kind `1` and basically all events)

In Nostr, an **event ID** is always the **SHA-256 hash of the event’s serialized content** (per NIP-01). That means:

- If *anything* in the event changes (content, tags, `created_at`, etc.), the **event ID changes**.
- Therefore, **an event ID always refers to one immutable version** of that event.

So for **kind `1` notes**, quoting/replying/reposting “by `id`” is straightforward because kind `1` is *not* editable/replaceable in-protocol: you just reference the immutable event by its `id`.

## “Addressable” / replaceable events: what changes is *the pointer*, not the rule

Nostr supports *replaceable* semantics for certain kinds (defined across NIPs; commonly discussed in NIP-16/33 patterns). The key idea:

- The **event ID still identifies a specific immutable version**
- But clients treat some events as “the latest version wins” **for a given address**

So you effectively have *two kinds of identifiers*:

- **Event ID**: “this exact version”
- **Event address**: “the latest version for this logical object”

## What is an “address” for addressable events?

For **parameterized replaceable (addressable) events** (commonly per **NIP-33**), the stable identifier is:

- **kind**
- **pubkey (author)**
- **`d` tag value** (the “identifier” for the parameterized object)

This tuple forms the “address” of the object.

### How you reference them in other events

You generally do **not** reference an addressable thing only by event id if you mean “the concept” rather than “that specific revision”.

Instead you use an **`a` tag** (NIP-33) which encodes:

- `kind:pubkey:d`

That is the stable pointer.

## So how do quoting/“retweeting” work for addressable events?

You have two valid intents, and they use different references:

### 1) Reference *a specific version*
Use the **event id** (e.g., with an `e`-tag / quote mechanisms depending on the NIP/client convention).

- Meaning: “I am referring to *this exact historical revision*.”

### 2) Reference *the latest version of the addressable object*
Use the **address** via an **`a` tag** (`kind:pubkey:d`).

- Meaning: “I am referring to *this object*, whatever its current/latest content is.”

Many clients will include **both** when they want durability *and* “follow the latest”.

## “Its hash would change — so how do we reference it?”

You reference it by its **address**, not by “a stable hash”.

- There is **no stable event-id-like hash** for “the object across updates” baked into the core model.
- The stable identifier is the **address tuple** (kind + pubkey + `d`).

## “If I want the addressable ID but the current VERSION… do I use both `d` and `event_id`?”

If your goal is “point to the object, but also know if it changed”, then yes, the common approach is:

- Track the **address** (`kind + pubkey + d`)
- Also track the **latest observed event id** (or `created_at`) for that address

To resolve “current version”, clients typically:

- Query relays for events matching that address
- Choose the one with the greatest `created_at` (newest)
- Treat that as the current version (with some tie-break rules depending on the NIP/client; often “newest created_at wins”, and if equal, lowest/lexicographic id is used as a deterministic tie-break)

So practically:

- **Use the `a` tag/address** to *find* the object.
- **Use the latest event id** to *pin* a specific revision and/or detect updates.

## Quick clarification: kind `1` vs “addressable”

- **Kind `1`** is a regular note; it’s **not addressable** in the NIP-33 sense.
- “Addressable events” are a different class (parameterized replaceable kinds), where the “address” is the stable identity.

## If you want, I can point you at the exact NIP text in this repo

If you tell me which NIP you’re primarily using for “addressable events” in your mental model (most likely NIP-33), I can quote the relevant sections and map them directly to:
- which tag to use (`e` vs `a`)
- how “latest” is selected
- what you should store client-side for update detection

## Status

- **Explained** how immutable event IDs coexist with addressable/replaceable semantics.
- **Answered** how to reference addressable events (use **`a` tag** for the object, **event id** for a specific revision, often both for robustness).