"""LangGraph agent for the SvelteReader AI chat assistant.

This agent helps users discuss and analyze passages from their ebooks.
It receives context about highlighted text and user notes, then provides
intelligent responses about the content.
"""

from __future__ import annotations

import os
from typing import Annotated, Literal, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages


class PassageContext(TypedDict, total=False):
    """Context about the passage being discussed."""

    text: str  # The highlighted text from the book
    note: str | None  # User's note about the passage
    book_title: str | None  # Title of the book
    chapter: str | None  # Current chapter


class AgentState(TypedDict):
    """State for the reader assistant agent."""

    messages: Annotated[list[BaseMessage], add_messages]
    passage_context: PassageContext | None


def get_system_prompt(context: PassageContext | None) -> str:
    """Generate a system prompt based on the passage context."""
    base_prompt = """You are a helpful reading assistant that helps users understand and discuss passages from books they are reading.

Your role is to:
- Help explain complex passages or concepts
- Provide historical or cultural context when relevant
- Answer questions about themes, characters, or literary devices
- Engage in thoughtful discussion about the text
- Help users make connections to other works or ideas

Be concise but thorough. If you don't know something, say so rather than making things up."""

    if context:
        context_parts = []
        if context.get("book_title"):
            context_parts.append(f"Book: {context['book_title']}")
        if context.get("chapter"):
            context_parts.append(f"Chapter: {context['chapter']}")
        if context.get("text"):
            context_parts.append(f'\nHighlighted passage:\n"{context["text"]}"')
        if context.get("note"):
            context_parts.append(f"\nUser's note: {context['note']}")

        if context_parts:
            base_prompt += "\n\n--- Current Context ---\n" + "\n".join(context_parts)

    return base_prompt


def create_model():
    """Create the LLM model using OpenAI-compatible endpoint.

    Requires explicit configuration - does NOT default to OpenAI.
    Works with any OpenAI-compatible API (Ollama, vLLM, LM Studio, etc.)
    """
    base_url = os.getenv("LLM_BASE_URL")
    api_key = os.getenv("LLM_API_KEY")
    model_name = os.getenv("LLM_MODEL")

    if not base_url:
        raise ValueError(
            "LLM_BASE_URL environment variable is required. "
            "Set it to your OpenAI-compatible endpoint (e.g., http://localhost:11434/v1 for Ollama)"
        )

    if not model_name:
        raise ValueError(
            "LLM_MODEL environment variable is required. "
            "Set it to your model name (e.g., llama3.2, mistral, etc.)"
        )

    return ChatOpenAI(
        base_url=base_url,
        api_key=api_key or "not-needed",  # Some endpoints don't require a key
        model=model_name,
        temperature=0.7,
        streaming=True,
    )


async def chat_node(state: AgentState) -> dict:
    """Process the user's message and generate a response."""
    model = create_model()

    # Build messages with system prompt
    system_prompt = get_system_prompt(state.get("passage_context"))
    messages = [SystemMessage(content=system_prompt)] + state["messages"]

    # Generate response
    response = await model.ainvoke(messages)

    return {"messages": [response]}


def should_continue(state: AgentState) -> Literal["end"]:
    """Determine if the conversation should continue or end."""
    # For now, always end after one response
    # This can be extended for multi-turn tool use
    return "end"


# Build the graph
builder = StateGraph(AgentState)

# Add nodes
builder.add_node("chat", chat_node)

# Add edges
builder.add_edge("__start__", "chat")
builder.add_conditional_edges(
    "chat",
    should_continue,
    {"end": END},
)

# Compile the graph
graph = builder.compile()
