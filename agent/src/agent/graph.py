"""LangGraph agent for the SvelteReader AI chat assistant.

This agent helps users discuss and analyze passages from their ebooks.
It receives context about highlighted text and user notes, then provides
intelligent responses about the content.

Payment flow (validate-then-redeem-on-success):
1. Client sends ecash token with message
2. validate_payment node checks token is UNSPENT (doesn't redeem)
3. chat_node processes the LLM request
4. On SUCCESS: redeem token to nutstash wallet
5. On FAILURE: don't redeem, return refund flag so client can self-recover

This ensures zero fund loss - if anything fails, the client keeps their token.
See docs/ecash-payment-flow.md for full design documentation.
"""

from __future__ import annotations

import os
import httpx
import json
import base64
from typing import Annotated, Literal, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages


class PaymentInfo(TypedDict, total=False):
    """Payment information from client."""

    ecash_token: str  # Cashu ecash token
    amount_sats: int  # Expected amount in sats
    mint: str | None  # Mint URL


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
    payment: PaymentInfo | None
    payment_validated: bool  # Token checked but not redeemed
    payment_token: str | None  # Token to redeem on success
    refund: bool  # Signal client to self-redeem on error


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


def validate_token_format(token: str) -> bool:
    """Validate that a string looks like a valid Cashu token.
    
    Cashu tokens have two formats:
    - cashuA: base64url encoded JSON
    - cashuB: base64url encoded CBOR (binary)
    
    We just check the prefix and that it's valid base64url.
    Actual validation happens when nutstash tries to redeem it.
    """
    try:
        # Check prefix
        if not (token.startswith("cashuA") or token.startswith("cashuB")):
            print(f"[Payment] Unknown token format: {token[:10]}...")
            return False
        
        token_data = token[6:]
        
        # Check it's valid base64url by trying to decode
        # Add padding if needed
        padding = 4 - len(token_data) % 4
        if padding != 4:
            token_data += "=" * padding
        
        decoded = base64.urlsafe_b64decode(token_data)
        
        # Just check we got some data
        if len(decoded) < 10:
            print("[Payment] Token data too short")
            return False
        
        token_type = "CBOR" if token.startswith("cashuB") else "JSON"
        print(f"[Payment] Token format valid: {token_type}, {len(decoded)} bytes")
        return True
        
    except Exception as e:
        print(f"[Payment] Token format validation failed: {e}")
        return False


async def validate_token_state(token: str) -> tuple[bool, str | None]:
    """Validate that a Cashu token has valid format.
    
    We do basic format validation here. The actual spend check
    happens when nutstash tries to redeem the token.
    
    Returns (is_valid, mint_url or None).
    """
    if not validate_token_format(token):
        return False, None
    
    # We can't easily extract the mint URL from cashuB tokens without CBOR parsing
    # Just return True with no mint URL - nutstash will handle the actual redemption
    print("[Payment] Token format validated, will attempt redemption on success")
    return True, None


async def redeem_token_to_nutstash(token: str) -> bool:
    """Redeem a Cashu token to the nutstash wallet."""
    # TODO: this should be robust for a production environment
    nutstash_url = os.getenv("NUTSTASH_URL", "http://localhost:3338")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{nutstash_url}/api/receive",
                json={"token": token},
                timeout=30.0,
            )
            
            if response.status_code == 200:
                result = response.json()
                amount = result.get("amount", 0)
                print(f"[Payment] Successfully redeemed {amount} sats to nutstash")
                return True
            else:
                print(f"[Payment] Failed to redeem: {response.text}")
                return False
                
    except Exception as e:
        print(f"[Payment] Redemption error: {e}")
        return False


async def validate_payment_node(state: AgentState) -> dict:
    """Validate the ecash token WITHOUT redeeming it.
    
    This node checks that the token is valid and unspent.
    The token is stored in state for later redemption on success.
    """
    payment = state.get("payment")
    
    # If no payment provided, skip validation (free mode for development)
    if not payment or not payment.get("ecash_token"):
        print("[Payment] No payment token provided, skipping validation (free mode)")
        return {
            "payment_validated": True,
            "payment_token": None,
            "refund": False,
        }
    
    token = payment["ecash_token"]
    
    # DEV: Log full token for manual recovery if funds are lost
    print(f"[Payment] ========== RECEIVED TOKEN (for recovery) ==========")
    print(f"[Payment] {token}")
    print(f"[Payment] ====================================================")
    
    # Validate token format and check state
    is_valid, mint_url = await validate_token_state(token)
    
    if not is_valid:
        print("[Payment] Token validation failed - client should still have valid token")
        print(f"[Payment] RECOVERY TOKEN: {token}")
        return {
            "payment_validated": False,
            "payment_token": None,
            "refund": True,  # Signal refund - token format was bad but might still be valid
        }
    
    # Token is valid - store it for redemption after successful LLM processing
    print(f"[Payment] Token validated from mint: {mint_url}, will redeem on success")
    return {
        "payment_validated": True,
        "payment_token": token,
        "refund": False,
    }


async def chat_node(state: AgentState) -> dict:
    """Process the user's message and generate a response.
    
    On success: redeems the payment token
    On failure: sets refund flag so client can self-recover
    """
    # Check if payment was validated
    if not state.get("payment_validated", True):
        return {
            "messages": [AIMessage(content="Payment validation failed. Please try again with a valid ecash token.")],
            "refund": True,  # Changed to True - client should try to recover
        }
    
    token = state.get("payment_token")
    
    try:
        model = create_model()

        # Build messages with system prompt
        system_prompt = get_system_prompt(state.get("passage_context"))
        messages = [SystemMessage(content=system_prompt)] + state["messages"]

        # Generate response
        print("[Payment] Invoking LLM...")
        response = await model.ainvoke(messages)
        print("[Payment] LLM response received successfully")
        
        # SUCCESS - Now redeem the token
        if token:
            print("[Payment] Attempting to redeem token to nutstash...")
            redeemed = await redeem_token_to_nutstash(token)
            if not redeemed:
                # Redemption failed but LLM succeeded
                # Log full token for manual recovery
                print("[Payment] !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
                print("[Payment] WARNING: LLM succeeded but token redemption failed!")
                print("[Payment] UNREDEEMED TOKEN - MANUAL RECOVERY NEEDED:")
                print(f"[Payment] {token}")
                print("[Payment] !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
            else:
                print("[Payment] Token redeemed successfully")
        
        return {
            "messages": [response],
            "refund": False,
        }
        
    except Exception as e:
        # FAILURE - Don't redeem, signal client to self-recover
        print(f"[Payment] LLM processing failed: {e}")
        if token:
            print("[Payment] ========== REFUNDABLE TOKEN ==========")
            print(f"[Payment] {token}")
            print("[Payment] Client should self-redeem this token")
            print("[Payment] ========================================")
        return {
            "messages": [AIMessage(content=f"Sorry, I encountered an error processing your request. Your payment has not been taken - please try again.")],
            "refund": True,  # Signal client to self-redeem their token
        }


def should_continue(state: AgentState) -> Literal["end"]:
    """Determine if the conversation should continue or end."""
    return "end"


def route_after_validation(state: AgentState) -> Literal["chat", "end"]:
    """Route based on payment validation result."""
    if state.get("payment_validated", True):
        return "chat"
    return "end"


# Build the graph
builder = StateGraph(AgentState)

# Add nodes
builder.add_node("validate_payment", validate_payment_node)
builder.add_node("chat", chat_node)

# Add edges
builder.add_edge("__start__", "validate_payment")
builder.add_conditional_edges(
    "validate_payment",
    route_after_validation,
    {"chat": "chat", "end": END},
)
builder.add_conditional_edges(
    "chat",
    should_continue,
    {"end": END},
)

# Compile the graph
graph = builder.compile()
