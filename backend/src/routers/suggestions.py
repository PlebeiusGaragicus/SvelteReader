"""Suggestions router for generating follow-up questions.

Uses an LLM to generate relevant follow-up questions based on 
the conversation history, similar to Perplexica's "Related" feature.
"""

import os
from datetime import datetime
from typing import List, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# Suggestion prompt template (inspired by Perplexica)
SUGGESTION_PROMPT = """You are an AI suggestion generator for an AI-powered search engine. 
You will be given a conversation below. Generate 4-5 follow-up questions based on the conversation.

Requirements:
- Suggestions should be relevant and help the user explore the topic further
- Make them specific enough to be useful but broad enough to invite exploration
- Vary the types of questions (comparisons, deeper dives, related topics, applications)
- Keep suggestions medium length - not too short, not too long

Today's date is {date}

Conversation:
{conversation}

Generate exactly 4-5 suggestions as a JSON array. Only output the JSON array, no other text.

Example output format:
["What are the latest developments in X?", "How does X compare to Y?", "What are practical applications of X?", "Who are the key figures in X field?"]
"""


class SuggestionsRequest(BaseModel):
    """Request body for suggestions generation."""
    history: List[Tuple[str, str]]  # List of (role, content) tuples


class SuggestionsResponse(BaseModel):
    """Response body with generated suggestions."""
    suggestions: List[str]


def format_conversation(history: List[Tuple[str, str]]) -> str:
    """Format conversation history for the prompt."""
    formatted = []
    for role, content in history:
        role_label = "Human" if role == "human" else "Assistant"
        formatted.append(f"{role_label}: {content}")
    return "\n".join(formatted)


@router.post("/suggestions", response_model=SuggestionsResponse)
async def generate_suggestions(request: SuggestionsRequest) -> SuggestionsResponse:
    """Generate follow-up question suggestions based on conversation history."""
    
    if not request.history:
        return SuggestionsResponse(suggestions=[])
    
    # Need at least one exchange to generate meaningful suggestions
    if len(request.history) < 2:
        return SuggestionsResponse(suggestions=[])
    
    try:
        # Check for OpenAI API key
        openai_api_key = os.getenv("OPENAI_API_KEY")
        anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
        
        conversation = format_conversation(request.history)
        prompt = SUGGESTION_PROMPT.format(
            date=datetime.now().isoformat(),
            conversation=conversation
        )
        
        suggestions = []
        
        if openai_api_key:
            # Use OpenAI
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=openai_api_key)
            
            response = await client.chat.completions.create(
                model=" glm-4.6v-flash",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that generates search suggestions."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=500,
            )
            
            content = response.choices[0].message.content or "[]"
            
            # Parse JSON from response
            import json
            try:
                # Clean up the response in case of markdown code blocks
                if "```" in content:
                    content = content.split("```")[1]
                    if content.startswith("json"):
                        content = content[4:]
                suggestions = json.loads(content.strip())
            except json.JSONDecodeError:
                # If parsing fails, try to extract suggestions manually
                suggestions = []
                
        elif anthropic_api_key:
            # Use Anthropic
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=anthropic_api_key)
            
            response = await client.messages.create(
                model="claude-3-haiku-20240307",  # Fast and cheap for suggestions
                max_tokens=500,
                messages=[
                    {"role": "user", "content": prompt}
                ],
            )
            
            content = response.content[0].text if response.content else "[]"
            
            # Parse JSON from response
            import json
            try:
                if "```" in content:
                    content = content.split("```")[1]
                    if content.startswith("json"):
                        content = content[4:]
                suggestions = json.loads(content.strip())
            except json.JSONDecodeError:
                suggestions = []
        else:
            # No API key available - return empty suggestions
            print("[Suggestions] No LLM API key configured (OPENAI_API_KEY or ANTHROPIC_API_KEY)")
            return SuggestionsResponse(suggestions=[])
        
        # Ensure we have a list of strings
        if not isinstance(suggestions, list):
            suggestions = []
        suggestions = [str(s) for s in suggestions if s][:5]
        
        return SuggestionsResponse(suggestions=suggestions)
        
    except Exception as e:
        print(f"[Suggestions] Error generating suggestions: {e}")
        # Don't fail the request, just return empty suggestions
        return SuggestionsResponse(suggestions=[])

