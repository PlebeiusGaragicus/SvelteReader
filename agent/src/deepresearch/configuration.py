"""Configuration management for the Deep Research agent.

Provides configurable settings for research behavior, model selection,
search APIs, and concurrency limits.
"""

import os
from enum import Enum
from typing import Any, Optional

from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field


class SearchAPI(Enum):
    """Available search API providers."""
    
    SEARXNG = "searxng"  # Self-hosted SearXNG (default)
    TAVILY = "tavily"    # Tavily API (premium)
    NONE = "none"        # No search (for testing)


class Configuration(BaseModel):
    """Main configuration for the Deep Research agent.
    
    All settings can be configured via:
    - Environment variables (UPPERCASE)
    - RunnableConfig configurable dict
    - Direct instantiation
    """
    
    # =========================================================================
    # GENERAL CONFIGURATION
    # =========================================================================
    
    max_structured_output_retries: int = Field(
        default=3,
        description="Maximum retries for structured output calls from models",
    )
    
    allow_clarification: bool = Field(
        default=True,
        description="Whether to allow clarifying questions before research",
    )
    
    # =========================================================================
    # RESEARCH CONFIGURATION
    # =========================================================================
    
    max_concurrent_research_units: int = Field(
        default=3,
        description="Maximum parallel researchers. More = faster but higher API costs",
    )
    
    max_researcher_iterations: int = Field(
        default=5,
        description="Maximum iterations for the research supervisor",
    )
    
    max_react_tool_calls: int = Field(
        default=8,
        description="Maximum tool calls per researcher",
    )
    
    search_api: SearchAPI = Field(
        default=SearchAPI.SEARXNG,
        description="Search API provider to use",
    )
    
    # =========================================================================
    # MODEL CONFIGURATION
    # =========================================================================
    
    research_model: str = Field(
        default="",
        description="Model for research tasks. Uses LLM_MODEL env var if empty",
    )
    
    research_model_max_tokens: int = Field(
        default=8192,
        description="Max output tokens for research model",
    )
    
    compression_model: str = Field(
        default="",
        description="Model for compressing research. Uses LLM_MODEL env var if empty",
    )
    
    compression_model_max_tokens: int = Field(
        default=4096,
        description="Max output tokens for compression model",
    )
    
    final_report_model: str = Field(
        default="",
        description="Model for final report. Uses LLM_MODEL env var if empty",
    )
    
    final_report_model_max_tokens: int = Field(
        default=8192,
        description="Max output tokens for final report model",
    )
    
    summarization_model: str = Field(
        default="",
        description="Model for summarizing search results. Uses LLM_MODEL env var if empty",
    )
    
    summarization_model_max_tokens: int = Field(
        default=2048,
        description="Max output tokens for summarization model",
    )
    
    max_content_length: int = Field(
        default=50000,
        description="Max character length for webpage content before summarization",
    )
    
    # =========================================================================
    # API CONFIGURATION
    # =========================================================================
    
    searxng_url: str = Field(
        default="",
        description="SearXNG instance URL. Uses SEARXNG_URL env var if empty",
    )
    
    tavily_api_key: str = Field(
        default="",
        description="Tavily API key. Uses TAVILY_API_KEY env var if empty",
    )
    
    def get_llm_base_url(self) -> str:
        """Get the LLM base URL from environment."""
        return os.getenv("LLM_BASE_URL", "")
    
    def get_llm_api_key(self) -> str:
        """Get the LLM API key from environment."""
        return os.getenv("LLM_API_KEY", "not-needed")
    
    def get_llm_model(self) -> str:
        """Get the default LLM model from environment."""
        return os.getenv("LLM_MODEL", "")
    
    def get_research_model(self) -> str:
        """Get the research model, falling back to default."""
        return self.research_model or self.get_llm_model()
    
    def get_compression_model(self) -> str:
        """Get the compression model, falling back to default."""
        return self.compression_model or self.get_llm_model()
    
    def get_final_report_model(self) -> str:
        """Get the final report model, falling back to default."""
        return self.final_report_model or self.get_llm_model()
    
    def get_summarization_model(self) -> str:
        """Get the summarization model, falling back to default."""
        return self.summarization_model or self.get_llm_model()
    
    def get_searxng_url(self) -> str:
        """Get SearXNG URL from config or environment."""
        return self.searxng_url or os.getenv("SEARXNG_URL", "http://localhost:8080")
    
    def get_tavily_api_key(self) -> str:
        """Get Tavily API key from config or environment."""
        return self.tavily_api_key or os.getenv("TAVILY_API_KEY", "")
    
    @classmethod
    def from_runnable_config(
        cls, config: Optional[RunnableConfig] = None
    ) -> "Configuration":
        """Create Configuration from a RunnableConfig.
        
        Merges environment variables with configurable values,
        where configurable takes precedence.
        """
        configurable = config.get("configurable", {}) if config else {}
        
        # Build values dict from env vars and configurable
        field_names = list(cls.model_fields.keys())
        values: dict[str, Any] = {}
        
        for field_name in field_names:
            # Try configurable first
            if field_name in configurable:
                values[field_name] = configurable[field_name]
            else:
                # Fall back to environment variable
                env_value = os.environ.get(field_name.upper())
                if env_value is not None:
                    values[field_name] = env_value
        
        return cls(**{k: v for k, v in values.items() if v is not None})

    class Config:
        """Pydantic configuration."""
        arbitrary_types_allowed = True


def get_today_str() -> str:
    """Get current date formatted for prompts.
    
    Returns:
        Date string like 'Mon Jan 15, 2024'
    """
    from datetime import datetime
    now = datetime.now()
    return f"{now:%a} {now:%b} {now.day}, {now:%Y}"

