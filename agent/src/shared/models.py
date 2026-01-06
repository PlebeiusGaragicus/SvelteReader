"""Shared model creation utilities for SvelteReader agents."""

import os

from langchain_openai import ChatOpenAI


def get_model(
    temperature: float = 0.7,
    streaming: bool = True,
    model_name: str | None = None,
) -> ChatOpenAI:
    """Create the LLM model using OpenAI-compatible endpoint.
    
    Requires explicit configuration via environment variables.
    Works with any OpenAI-compatible API (Ollama, vLLM, LM Studio, OpenAI, etc.)
    
    Environment Variables:
        LLM_BASE_URL: API endpoint URL (required)
        LLM_API_KEY: API key (optional for local models)
        LLM_MODEL: Model name (required unless model_name arg provided)
    
    Args:
        temperature: Model temperature (default: 0.7)
        streaming: Enable streaming responses (default: True)
        model_name: Override for LLM_MODEL env var
        
    Returns:
        Configured ChatOpenAI instance
        
    Raises:
        ValueError: If required environment variables are not set
    """
    base_url = os.getenv("LLM_BASE_URL")
    api_key = os.getenv("LLM_API_KEY")
    model = model_name or os.getenv("LLM_MODEL")
    
    if not base_url:
        raise ValueError(
            "LLM_BASE_URL environment variable is required. "
            "Set it to your OpenAI-compatible endpoint (e.g., http://localhost:11434/v1 for Ollama)"
        )
    
    if not model:
        raise ValueError(
            "LLM_MODEL environment variable is required. "
            "Set it to your model name (e.g., llama3.2, gpt-4o, etc.)"
        )
    
    return ChatOpenAI(
        base_url=base_url,
        api_key=api_key or "not-needed",  # Some endpoints don't require a key
        model=model,
        temperature=temperature,
        streaming=streaming,
    )

