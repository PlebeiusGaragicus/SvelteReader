"""Wallet API endpoints for receiving and managing ecash payments.

These endpoints are called by:
- The LangGraph agent to redeem tokens after successful LLM processing
- Admin/CLI tools to check balance and sweep funds
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.services.wallet import get_wallet_service

router = APIRouter()


class ReceiveRequest(BaseModel):
    """Request to receive an ecash token."""
    token: str


class ReceiveResponse(BaseModel):
    """Response from receiving a token."""
    success: bool
    amount: int
    error: str | None = None


class BalanceResponse(BaseModel):
    """Response with wallet balance."""
    balance: int


class SweepResponse(BaseModel):
    """Response with sweep token."""
    success: bool
    amount: int
    token: str | None = None
    error: str | None = None


@router.post("/receive", response_model=ReceiveResponse)
async def receive_token(request: ReceiveRequest):
    """Receive an ecash token and store the proofs.
    
    This endpoint is called by the LangGraph agent after successful
    LLM processing to redeem the user's payment.
    
    The endpoint matches the nutstash API format for compatibility.
    """
    wallet = get_wallet_service()
    result = await wallet.receive_token(request.token)
    
    return ReceiveResponse(
        success=result["success"],
        amount=result["amount"],
        error=result.get("error"),
    )


@router.get("/balance", response_model=BalanceResponse)
async def get_balance():
    """Get the current wallet balance.
    
    Returns the total balance across all mints.
    """
    wallet = get_wallet_service()
    balance = await wallet.get_balance()
    
    return BalanceResponse(balance=balance)


@router.post("/sweep", response_model=SweepResponse)
async def sweep_funds():
    """Sweep all funds into a single token.
    
    Creates a cashu token containing all wallet funds that can be
    imported into another wallet.
    
    WARNING: This removes the funds from this wallet!
    """
    wallet = get_wallet_service()
    balance = await wallet.get_balance()
    
    if balance <= 0:
        return SweepResponse(
            success=False,
            amount=0,
            error="No funds to sweep",
        )
    
    token = await wallet.sweep_all()
    
    if token:
        return SweepResponse(
            success=True,
            amount=balance,
            token=token,
        )
    else:
        return SweepResponse(
            success=False,
            amount=0,
            error="Failed to create sweep token",
        )


@router.post("/send")
async def send_token(amount: int):
    """Create a send token for a specific amount.
    
    Args:
        amount: Amount in sats to send
        
    Returns:
        Token string that can be received by another wallet
    """
    wallet = get_wallet_service()
    balance = await wallet.get_balance()
    
    if amount > balance:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient balance: {balance} < {amount}",
        )
    
    token = await wallet.create_send_token(amount)
    
    if token:
        return {"success": True, "amount": amount, "token": token}
    else:
        raise HTTPException(
            status_code=500,
            detail="Failed to create send token",
        )
