# SvelteReader LangGraph Agent

This is the LangGraph agent that powers the AI chat feature in SvelteReader.

**Important:** This agent uses OpenAI-compatible endpoints and does NOT default to OpenAI. You must explicitly configure your LLM endpoint.

## Setup

1. Install dependencies:

```bash
cd agent
pip install -e . "langgraph-cli[inmem]"
```

2. Configure environment:

```bash
cp .env.example .env
# Edit .env with your LLM endpoint configuration
```

3. Run the LangGraph server:

```bash
langgraph dev
```

The server will be available at `http://localhost:2024`.

## Configuration

The agent requires explicit LLM configuration via environment variables:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `LLM_BASE_URL` | **Yes** | OpenAI-compatible API endpoint | `http://localhost:11434/v1` |
| `LLM_MODEL` | **Yes** | Model name | `llama3.2` |
| `LLM_API_KEY` | No | API key (if required by endpoint) | `ollama` |

### Supported Endpoints

| Provider | Base URL | API Key |
|----------|----------|---------|
| Ollama | `http://localhost:11434/v1` | `ollama` |
| vLLM | `http://localhost:8000/v1` | Your key |
| LM Studio | `http://localhost:1234/v1` | `lm-studio` |
| OpenRouter | `https://openrouter.ai/api/v1` | Your key |
| Together AI | `https://api.together.xyz/v1` | Your key |

## Development

Use LangGraph Studio for visual debugging:

```bash
langgraph dev
```

Then open the Studio UI that appears in the terminal output.

## Graph Structure

The agent uses a simple single-node graph:

```
START → chat → END
```

The `chat` node:
- Receives the conversation history and passage context
- Generates a system prompt with the book/passage context
- Calls the LLM to generate a response
- Returns the response to be added to the message history

## Extending the Agent

To add tools or more complex behavior:

1. Define tool functions in `graph.py`
2. Add a tools node to the graph
3. Update the conditional edges to route between chat and tools
