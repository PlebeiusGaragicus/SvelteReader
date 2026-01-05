"""Web Agent for SvelteReader Web Scrape mode.

This agent handles web search and synthesis, similar to Perplexica.
It uses tools to search the web and scrape URLs, then synthesizes
answers with citations.
"""

from web_agent.graph import graph

__all__ = ["graph"]

