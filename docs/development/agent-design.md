
## Agent Architecture

### LangGraph State Machine

```
┌─────────────────┐
│     START       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ validate_payment│────▶│      END        │ (if payment invalid)
└────────┬────────┘     └─────────────────┘
         │ (if valid)
         ▼
┌─────────────────┐
│     chat        │ → Invoke LLM with context
└────────┬────────┘
         │
         ▼ (on success: redeem token)
┌─────────────────┐
│      END        │
└─────────────────┘
```

### Agent State

```python
class AgentState(TypedDict):
    messages: list[BaseMessage]      # Conversation history
    passage_context: PassageContext  # Book/chapter/highlighted text
    payment: PaymentInfo             # Ecash token from client
    payment_validated: bool          # Token checked
    payment_token: str               # Token to redeem on success
    refund: bool                     # Signal client to self-recover
```


# Agent-Driven RAG Architecture

This document describes the client-side RAG (Retrieval Augmented Generation) architecture where the LangGraph agent drives book retrieval through tool calls executed in the browser.

## Overview

```
┌─────────────────────┐                    ┌─────────────────────┐
│   Svelte Frontend   │◄──────────────────►│  LangGraph Agent    │
│                     │   Direct via SDK    │  (Port 2024)        │
│  - Chat UI          │                    │                     │
│  - Tool Executor    │                    │  - AI Reasoning     │
│  - Vector Service   │                    │  - Tool Calls       │
│  - EPUB Service     │                    │  - Payment Verify   │
└─────────────────────┘                    └─────────────────────┘
         │
         ▼
┌─────────────────────┐
│  FastAPI Backend    │  (Wallet only)
│  (Port 8000)        │
│  - Ecash Receive    │
│  - Balance Check    │
└─────────────────────┘
```

## How It Works

### 1. Agent Tools with Interrupt

The LangGraph agent has tools that require client-side data:

| Tool | Purpose | Client Execution |
|------|---------|------------------|
| `get_table_of_contents()` | Book structure | `epubService.getTableOfContentsForAgent()` |
| `get_book_metadata()` | Title, author, pages | `epubService.getMetadata()` |
| `get_chapter(chapter_id)` | Full chapter text | `epubService.getChapterText()` |
| `search_book(query)` | Semantic search | `vectorService.search()` |

The graph is compiled with `interrupt_before=["tools"]`, causing execution to pause before any tool runs.

### 2. Interrupt Flow

```
User sends message
       ↓
Agent decides to call search_book("redemption theme")
       ↓
Graph INTERRUPTS (returns state with pending tool call)
       ↓
Frontend receives interrupt via stream
       ↓
Frontend executes search locally using vectorService
       ↓
Frontend calls client.threads.updateState() with tool result
       ↓
Frontend resumes stream with null input
       ↓
Agent continues with search results in context
       ↓
Agent may call more tools or generate final response
```

### 3. Client-Side Vector Search

Books are indexed locally using:

- **Embeddings**: `@xenova/transformers` (MiniLM-L6-v2, ~23MB)
- **Search**: Custom cosine similarity over in-memory embeddings

Indexing happens on-demand when the agent first calls `search_book()`.

## Key Files

| File | Purpose |
|------|---------|
| `agent/src/agent/graph.py` | Agent with tools and `interrupt_before` config |
| `frontend/src/lib/services/langgraph.ts` | SDK wrapper with interrupt handling loop |
| `frontend/src/lib/services/agentToolsService.ts` | Client-side tool dispatcher |
| `frontend/src/lib/services/vectorService.ts` | Embedding and vector search |
| `frontend/src/lib/services/epubService.ts` | EPUB text extraction |
| `frontend/src/lib/stores/chat.svelte.ts` | Chat state with tool status |

## Agent Tool Definitions

```python
# agent/src/agent/graph.py

@tool
def get_table_of_contents() -> str:
    """Get the table of contents for the current book.
    Returns chapter titles, IDs, and hierarchy."""
    return ""  # Never called - client executes via interrupt

@tool
def get_chapter(chapter_id: str) -> str:
    """Get the full text content of a specific chapter."""
    return ""

@tool
def search_book(query: str, top_k: int = 5) -> str:
    """Semantic search across the entire book."""
    return ""

# Graph compiled with interrupt
graph = builder.compile(interrupt_before=["tools"])
```

## Frontend Interrupt Handler

```typescript
// frontend/src/lib/services/langgraph.ts

while (iteration < maxIterations) {
  const stream = client.runs.stream(threadId, assistantId, { input });
  
  for await (const event of stream) {
    if (lastMessage?.tool_calls?.length > 0) {
      // Interrupt detected - execute tools locally
      pendingToolCalls = lastMessage.tool_calls;
      interrupted = true;
    }
  }
  
  if (!interrupted) break;
  
  // Execute tools and resume
  const results = await Promise.all(
    pendingToolCalls.map(tc => executeToolCall(tc, bookId))
  );
  
  await client.threads.updateState(threadId, {
    values: { messages: toolResultMessages }
  });
  
  input = null;  // Resume from interrupt
}
```

## Tool Execution Service

```typescript
// frontend/src/lib/services/agentToolsService.ts

export async function executeToolCall(toolCall, bookId) {
  switch (toolCall.name) {
    case 'get_table_of_contents':
      return { id: toolCall.id, result: await epubService.getTableOfContentsForAgent() };
    case 'get_chapter':
      return { id: toolCall.id, result: await epubService.getChapterText(toolCall.args.chapter_id) };
    case 'search_book':
      return { id: toolCall.id, result: await vectorService.search(toolCall.args.query, bookId) };
    // ...
  }
}
```

## Chat UI Status

The chat interface shows tool execution status:

- "Searching book..." when `search_book()` is running
- "Reading chapter..." when `get_chapter()` is running
- "Reading book structure..." when `get_table_of_contents()` is running

This provides transparency about what the agent is doing.

## Benefits

1. **Agent Control**: Agent decides what to retrieve based on the question
2. **Multi-Step Reasoning**: Can search, analyze, search again
3. **Privacy**: EPUB content stays in browser, only excerpts sent to LLM
4. **No Backend Chat**: Chat goes directly to LangGraph, simpler architecture
5. **Rich Context**: Agent has full access to book via tools

## Limitations

1. **Latency**: Each tool call adds a round-trip
2. **Embedding Model Download**: ~23MB on first use
3. **Memory Usage**: Large books with many chunks use browser memory
4. **Max Iterations**: Capped at 10 tool calls per message to prevent loops

## Configuration

### Frontend Environment

```bash
# frontend/.env
VITE_LANGGRAPH_API_URL=http://localhost:2024
VITE_LANGGRAPH_ASSISTANT_ID=agent
```

### Agent Environment

```bash
# agent/.env
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=llama3.2
```

## See Also

- [AI Chat Integration](ai-chat-integration.md) - Original chat design
- [Ecash Payment Flow](ecash-payment-flow.md) - Payment validation in agent
- [Architecture](architecture.md) - Overall system design

