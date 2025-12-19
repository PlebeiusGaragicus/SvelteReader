# Chat Interface Refactor: fullstack-chat-client → SvelteReader

This document outlines the plan to refactor the existing proof-of-concept chat interface in SvelteReader by adapting patterns from the `fullstack-chat-client` (Next.js/React) reference implementation.

## Overview

**Goal**: Replace the current basic `AIChatPanel.svelte` with a full-featured chat interface inspired by the LangGraph Agent Chat UI, using **CypherTap** for authentication/payments instead of Stripe/Supabase.

### Current State

| Aspect | Current (SvelteReader) | Reference (fullstack-chat-client) |
|--------|------------------------|-----------------------------------|
| **Framework** | SvelteKit + Svelte 5 | Next.js + React 19 |
| **Auth** | None (backend-only) | Supabase + Stripe |
| **Chat Backend** | Custom Python backend | LangGraph SDK |
| **State Management** | Svelte stores | React Context + Zustand |
| **UI Components** | Basic Tailwind | shadcn/ui + Radix |
| **Payments** | None | Stripe credits system |

### Target State

| Aspect | Target |
|--------|--------|
| **Framework** | SvelteKit + Svelte 5 (unchanged) |
| **Auth/Payments** | **CypherTap** (Nostr + Lightning/Ecash) |
| **Chat Backend** | LangGraph SDK (adapted for Svelte) |
| **State Management** | Svelte 5 runes + stores |
| **UI Components** | bits-ui + existing components |

---

## Architecture Comparison

### Reference Implementation Structure

```
fullstack-chat-client/src/
├── app/                    # Next.js app router pages
│   ├── (app)/              # Main app routes
│   ├── (auth)/             # Auth routes (login, signup)
│   ├── api/                # API routes (webhooks, passthrough)
│   ├── pricing/            # Stripe pricing page
│   └── success/            # Payment success page
├── components/
│   ├── credits/            # Credit balance display
│   ├── thread/             # Chat thread components (main UI)
│   │   ├── messages/       # Human/AI message components
│   │   ├── history/        # Thread history sidebar
│   │   ├── agent-inbox/    # Interrupt handling
│   │   └── artifact.tsx    # Side panel for artifacts
│   ├── navbar/             # Navigation
│   └── ui/                 # shadcn/ui components
├── features/               # Feature-specific components
│   ├── signin/
│   ├── signup/
│   └── user-auth-status/
├── hooks/                  # Custom React hooks
│   ├── use-credit-deduction.ts
│   ├── use-file-upload.ts
│   └── useMediaQuery.ts
├── lib/
│   ├── auth/               # Supabase auth utilities
│   ├── stripe.ts           # Stripe integration
│   └── utils.ts
└── providers/              # React context providers
    ├── Auth.tsx            # Authentication context
    ├── Credits.tsx         # Credits management
    ├── Stream.tsx          # LangGraph streaming
    └── Thread.tsx          # Thread management
```

### Proposed SvelteReader Structure

```
frontend/src/lib/
├── components/
│   ├── chat/                    # NEW: Chat components
│   │   ├── ChatThread.svelte    # Main chat interface
│   │   ├── ChatInput.svelte     # Message input with file upload
│   │   ├── ChatHistory.svelte   # Thread history sidebar
│   │   ├── messages/
│   │   │   ├── HumanMessage.svelte
│   │   │   ├── AssistantMessage.svelte
│   │   │   └── ToolMessage.svelte
│   │   ├── MarkdownRenderer.svelte
│   │   └── ArtifactPanel.svelte
│   ├── credits/                 # NEW: Credits display
│   │   └── CreditBalance.svelte
│   └── reader/                  # Existing reader components
├── stores/
│   ├── chat.ts                  # NEW: Chat state management
│   ├── credits.svelte.ts        # NEW: Credits (via CypherTap)
│   └── books.ts                 # Existing
├── services/
│   ├── langgraph.ts             # NEW: LangGraph SDK wrapper
│   └── chatService.ts           # Existing (to be replaced)
└── types/
    ├── chat.ts                  # NEW: Chat types
    └── index.ts                 # Existing
```

---

## Key Design Decisions

### 1. Authentication: CypherTap vs Supabase/Stripe

**Reference uses**: Supabase for auth + Stripe for payments/credits

**We will use**: CypherTap (already integrated as submodule)

| Feature | Supabase/Stripe | CypherTap Equivalent |
|---------|-----------------|----------------------|
| User auth | `supabase.auth.signIn()` | `cyphertap.isLoggedIn` |
| Session token | `session.accessToken` | Nostr signed events |
| Credits/Balance | Stripe + DB | `cyphertap.balance` (sats) |
| Payments | Stripe checkout | Lightning/Ecash |
| User ID | `user.id` | `cyphertap.npub` |

**Implementation approach**:
```svelte
<script lang="ts">
  import { Cyphertap, cyphertap } from 'cyphertap';
  
  const MESSAGE_COST_SATS = 1; // Cost per message
  
  // Auth check before chat
  $effect(() => {
    if (!cyphertap.isLoggedIn) {
      // Prompt login via CypherTap
    }
  });
  
  async function sendMessage(content: string) {
    // Check balance
    if (cyphertap.balance < MESSAGE_COST_SATS) {
      toast.error('Insufficient balance', {
        description: 'Add sats to your wallet to send messages'
      });
      return;
    }
    
    // Generate ecash token for this request
    const { token } = await cyphertap.generateEcashToken(
      MESSAGE_COST_SATS, 
      'Chat message'
    );
    
    // Send message + payment token to LangGraph
    await submitToLangGraph({
      messages: [{ role: 'user', content }],
      payment: { ecash_token: token }
    });
  }
</script>
```

### 2. Streaming: React useStream → Svelte Stores

**Reference uses**: `@langchain/langgraph-sdk/react` with `useStream` hook

**Svelte approach**: Create a reactive store wrapper

```typescript
// lib/stores/chat.ts
import { Client } from '@langchain/langgraph-sdk';

export function createChatStore() {
  let messages = $state<Message[]>([]);
  let isLoading = $state(false);
  let threadId = $state<string | null>(null);
  
  const client = new Client({ apiUrl: import.meta.env.VITE_LANGGRAPH_URL });
  
  async function submit(content: string) {
    isLoading = true;
    // Stream handling...
  }
  
  return {
    get messages() { return messages; },
    get isLoading() { return isLoading; },
    get threadId() { return threadId; },
    submit,
  };
}
```

### 3. UI Components Mapping

| React (shadcn/ui) | Svelte Equivalent |
|-------------------|-------------------|
| `@radix-ui/react-*` | `bits-ui` (already in deps) |
| `framer-motion` | Svelte transitions/animate |
| `react-markdown` | `svelte-markdown` or custom |
| `sonner` (toasts) | `svelte-sonner` (already in deps) |
| `use-stick-to-bottom` | Custom Svelte action |

### 4. Payment System: Ecash-per-Request Model

**Reference credit flow** (Stripe):
1. User purchases credits via Stripe
2. Credits stored in Supabase `users.credits_available`
3. Deduct 1 credit per LLM request
4. Optimistic UI updates + server sync

**Our approach: Ecash Token per Request**

Every chat message submission includes an ecash token as payment. The agent graph has a **payment verification node** that redeems the token before proceeding with LLM execution.

**Key principle**: Pressing "Send" = Pressing "Pay"

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Client    │────▶│  Payment Node    │────▶│  LLM Node   │
│ (Send msg   │     │  (Redeem ecash,  │     │  (Execute   │
│  + ecash)   │     │   verify payment)│     │   if paid)  │
└─────────────┘     └──────────────────┘     └─────────────┘
                            │
                            ▼ (reject if invalid)
                    ┌──────────────────┐
                    │  Error Response  │
                    │  "Payment failed"│
                    └──────────────────┘
```

**Flow**:
1. User types message and clicks "Send"
2. Client generates ecash token via CypherTap (`cyphertap.generateEcashToken(amount)`)
3. Token sent alongside message to LangGraph API
4. **Payment verification node** (first node in graph):
   - Redeems ecash token
   - Verifies amount meets minimum (e.g., 1 sat per request)
   - If valid: proceeds to LLM node
   - If invalid: returns error, graph halts
5. LLM processes request, streams response
6. User sees response (payment already confirmed)

**Benefits**:
- No credit tracking database needed
- Instant, verifiable payments
- Server only processes paid requests
- No refund logic needed (payment verified upfront)
- Censorship-resistant (ecash is bearer token)

---

## TODO List

### Phase 1: Foundation (Est. 2-3 days)

- [ ] **1.1** Install LangGraph SDK dependencies
  ```bash
  npm install @langchain/langgraph-sdk
  ```
- [ ] **1.2** Create `lib/services/langgraph.ts` - SDK wrapper for Svelte
- [ ] **1.3** Create `lib/stores/chat.svelte.ts` - Reactive chat state with Svelte 5 runes
- [ ] **1.4** Create `lib/types/chat.ts` - TypeScript interfaces for messages, threads
- [ ] **1.5** Set up environment variables for LangGraph connection

### Phase 2: Core Chat Components (Est. 3-4 days)

- [ ] **2.1** Create `ChatThread.svelte` - Main chat container
- [ ] **2.2** Create `ChatInput.svelte` - Message input with:
  - Text input with Enter to send
  - File upload (images, PDFs)
  - Loading/cancel states
- [ ] **2.3** Create `messages/HumanMessage.svelte` - User message display
- [ ] **2.4** Create `messages/AssistantMessage.svelte` - AI message with:
  - Streaming text display
  - Markdown rendering
  - Tool call visualization (optional toggle)
  - Regenerate button
- [ ] **2.5** Create `MarkdownRenderer.svelte` - Markdown with syntax highlighting

### Phase 3: Thread Management (Est. 2-3 days)

- [ ] **3.1** Create `ChatHistory.svelte` - Sidebar with thread list
- [ ] **3.2** Implement thread persistence (IndexedDB or backend)
- [ ] **3.3** Add URL-based thread selection (`?threadId=xxx`)
- [ ] **3.4** Implement "New Thread" functionality

### Phase 4: CypherTap + Payment Integration (Est. 3-4 days)

- [ ] **4.1** Create `lib/stores/wallet.svelte.ts` - Reactive wrapper for CypherTap balance
- [ ] **4.2** Create `WalletBalance.svelte` - Balance display component in chat header
- [ ] **4.3** Implement ecash token generation on message submit
- [ ] **4.4** Add "insufficient balance" handling with deposit prompt
- [ ] **4.5** Create auth guard for chat feature (require CypherTap login)
- [ ] **4.6** **Backend**: Create payment verification node in LangGraph agent
- [ ] **4.7** **Backend**: Implement ecash redemption logic (Cashu mint integration)

### Phase 5: Advanced Features (Est. 3-4 days)

- [ ] **5.1** Implement file upload handling (images, PDFs)
- [ ] **5.2** Create `ArtifactPanel.svelte` - Side panel for rich content
- [ ] **5.3** Add tool call display toggle
- [ ] **5.4** Implement message editing
- [ ] **5.5** Add scroll-to-bottom behavior

### Phase 6: Reader Integration (Est. 2-3 days)

- [ ] **6.1** Integrate chat with book context (selected text, annotations)
- [ ] **6.2** Pass book/chapter metadata to LangGraph
- [ ] **6.3** Update existing `AIChatPanel.svelte` or replace entirely
- [ ] **6.4** Add "Ask AI about this passage" from reader

### Phase 7: Polish & Testing (Est. 2-3 days)

- [ ] **7.1** Add loading states and error handling
- [ ] **7.2** Implement responsive design (mobile drawer vs desktop panel)
- [ ] **7.3** Add keyboard shortcuts
- [ ] **7.4** Write unit tests for stores
- [ ] **7.5** Write E2E tests for chat flow

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Foundation | 2-3 days | None |
| Phase 2: Core Components | 3-4 days | Phase 1 |
| Phase 3: Thread Management | 2-3 days | Phase 2 |
| Phase 4: CypherTap Integration | 2-3 days | Phase 1 |
| Phase 5: Advanced Features | 3-4 days | Phase 2, 3 |
| Phase 6: Reader Integration | 2-3 days | Phase 2 |
| Phase 7: Polish & Testing | 2-3 days | All |

**Total Estimate**: 16-23 days (3-5 weeks)

*Note: Phases 3, 4, and 6 can be parallelized after Phase 2 completion.*

---

## Dependencies to Add

```json
{
  "dependencies": {
    "@langchain/langgraph-sdk": "^0.0.73",
    "svelte-markdown": "^0.4.0",
    "uuid": "^11.1.0"
  }
}
```

*Note: `cyphertap` is already linked as a local dependency.*

---

## Key Files to Reference

### From fullstack-chat-client:

| File | Purpose | Svelte Equivalent |
|------|---------|-------------------|
| `src/providers/Stream.tsx` | LangGraph streaming setup | `lib/stores/chat.svelte.ts` |
| `src/providers/Auth.tsx` | Auth context | CypherTap integration |
| `src/providers/Credits.tsx` | Credits management | `lib/stores/credits.svelte.ts` |
| `src/components/thread/index.tsx` | Main chat UI | `ChatThread.svelte` |
| `src/components/thread/messages/ai.tsx` | AI message rendering | `AssistantMessage.svelte` |
| `src/components/thread/messages/human.tsx` | Human message | `HumanMessage.svelte` |
| `src/hooks/use-credit-deduction.ts` | Credit deduction logic | Part of credits store |
| `CREDIT_SYSTEM.md` | Credit system docs | This document |

### Current SvelteReader files to update/replace:

| File | Action |
|------|--------|
| `src/lib/components/reader/AIChatPanel.svelte` | Replace with new chat system |
| `src/lib/services/chatService.ts` | Replace with LangGraph service |

---

## Open Questions

1. ~~**Credit model**~~: **DECIDED** - Ecash token per request (Option A). Each message includes payment.

2. **Backend**: Keep existing Python backend or switch entirely to LangGraph server?

3. **Offline support**: Should chat history be persisted locally (IndexedDB) for offline viewing?

4. **Multi-book context**: Should the AI have access to all user's books or just the current one?

---

## References

- [LangGraph SDK Documentation](https://langchain-ai.github.io/langgraph/)
- [Agent Chat UI Repository](https://github.com/langchain-ai/agent-chat-ui)
- [CypherTap Documentation](../cyphertap/README.md)
- [Cashu Protocol](https://cashu.space/) - Ecash implementation
- [Current AI Chat Integration](./ai-chat-integration.md)
