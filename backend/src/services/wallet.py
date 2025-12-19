"""Cashu wallet service for receiving and managing ecash payments.

This service uses the cashu library (nutshell) to:
- Receive ecash tokens from the LangGraph agent
- Store proofs persistently in SQLite
- Provide balance and sweep functionality
"""

import asyncio
import os
from pathlib import Path
from typing import Optional

from cashu.core.base import TokenV4
from cashu.core.settings import settings as cashu_settings
from cashu.wallet.wallet import Wallet


class WalletService:
    """Service for managing the Cashu hot wallet."""

    def __init__(self, db_path: str = "wallet_db", mint_url: Optional[str] = None):
        """Initialize the wallet service.

        Args:
            db_path: Path to the SQLite database directory
            mint_url: Default mint URL (can be overridden by token's mint)
        """
        self.db_path = Path(db_path)
        self.mint_url = mint_url or os.getenv(
            "MINT_URL", "https://mint.minibits.cash/Bitcoin"
        )
        self._wallet: Optional[Wallet] = None
        self._initialized = False

    async def _get_or_create_wallet(self, mint_url: Optional[str] = None) -> Wallet:
        """Get or create a wallet instance for a specific mint.
        
        The cashu library creates separate wallet instances per mint.
        """
        url = mint_url or self.mint_url
        
        # Configure cashu settings
        cashu_settings.tor = False
        cashu_settings.socks_host = None
        cashu_settings.socks_port = None
        
        # Ensure db directory exists
        self.db_path.mkdir(parents=True, exist_ok=True)
        
        # Create wallet with the mint URL
        wallet = await Wallet.with_db(
            url=url,
            db=str(self.db_path / "wallet"),
            name="sveltereader",
        )
        
        # Load the mint's keys
        await wallet.load_mint()
        
        return wallet

    async def initialize(self) -> None:
        """Initialize the wallet on startup."""
        if self._initialized:
            return
            
        print(f"[Wallet] Initializing wallet with db at {self.db_path}")
        print(f"[Wallet] Default mint: {self.mint_url}")
        
        try:
            self._wallet = await self._get_or_create_wallet()
            self._initialized = True
            print("[Wallet] Wallet initialized successfully")
            
            # Print current balance on startup
            balance = await self.get_balance()
            print(f"[Wallet] Current balance: {balance} sats")
            
            # If there's a balance, offer to sweep
            if balance > 0:
                await self._print_sweep_token()
                
        except Exception as e:
            print(f"[Wallet] Failed to initialize wallet: {e}")
            raise

    async def _print_sweep_token(self) -> None:
        """Print a sweep token to console for fund recovery."""
        try:
            balance = await self.get_balance()
            if balance <= 0:
                print("[Wallet] No funds to sweep")
                return
                
            token = await self.create_send_token(balance)
            if token:
                print("\n" + "=" * 60)
                print("[Wallet] SWEEP TOKEN - Copy this to recover funds:")
                print("=" * 60)
                print(token)
                print("=" * 60 + "\n")
        except Exception as e:
            print(f"[Wallet] Failed to create sweep token: {e}")

    async def receive_token(self, token: str) -> dict:
        """Receive an ecash token and store the proofs.

        Args:
            token: Cashu token string (cashuA... or cashuB...)

        Returns:
            dict with 'success', 'amount', and optionally 'error'
        """
        try:
            # Parse the token to get the mint URL
            token_obj = TokenV4.deserialize(token)
            mint_url = token_obj.mint
            
            print(f"[Wallet] Receiving token from mint: {mint_url}")
            
            # Get wallet for this mint
            wallet = await self._get_or_create_wallet(mint_url)
            
            # Receive the token (this redeems it with the mint and stores proofs)
            amount = await wallet.receive(token)
            
            print(f"[Wallet] Successfully received {amount} sats")
            
            return {
                "success": True,
                "amount": amount,
            }
            
        except Exception as e:
            error_msg = str(e)
            print(f"[Wallet] Failed to receive token: {error_msg}")
            return {
                "success": False,
                "amount": 0,
                "error": error_msg,
            }

    async def get_balance(self) -> int:
        """Get the total wallet balance across all mints.

        Returns:
            Total balance in sats
        """
        if not self._wallet:
            await self.initialize()
            
        try:
            balance = self._wallet.balance
            return balance
        except Exception as e:
            print(f"[Wallet] Failed to get balance: {e}")
            return 0

    async def create_send_token(self, amount: int) -> Optional[str]:
        """Create a token to send/sweep funds.

        Args:
            amount: Amount in sats to include in the token

        Returns:
            Cashu token string or None if failed
        """
        if not self._wallet:
            await self.initialize()
            
        try:
            balance = await self.get_balance()
            if amount > balance:
                print(f"[Wallet] Insufficient balance: {balance} < {amount}")
                return None
                
            # Create send token
            token, _ = await self._wallet.send(amount, memo="SvelteReader sweep")
            
            print(f"[Wallet] Created send token for {amount} sats")
            return token
            
        except Exception as e:
            print(f"[Wallet] Failed to create send token: {e}")
            return None

    async def sweep_all(self) -> Optional[str]:
        """Sweep all funds into a single token.

        Returns:
            Cashu token string with all funds, or None if no funds/failed
        """
        balance = await self.get_balance()
        if balance <= 0:
            print("[Wallet] No funds to sweep")
            return None
            
        return await self.create_send_token(balance)


# Global wallet instance
_wallet_service: Optional[WalletService] = None


def get_wallet_service() -> WalletService:
    """Get the global wallet service instance."""
    global _wallet_service
    if _wallet_service is None:
        db_path = os.getenv("WALLET_DB_PATH", "wallet_db")
        mint_url = os.getenv("MINT_URL", "https://mint.minibits.cash/Bitcoin")
        _wallet_service = WalletService(db_path=db_path, mint_url=mint_url)
    # TODO - we should probably gracefully fail and warn the admin
    return _wallet_service


async def initialize_wallet() -> None:
    """Initialize the wallet service (call on startup)."""
    service = get_wallet_service()
    await service.initialize()
