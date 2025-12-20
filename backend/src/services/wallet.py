"""Cashu wallet service for receiving and managing ecash payments.

This service uses the cashu library (nutshell) to:
- Receive ecash tokens from the LangGraph agent
- Store proofs persistently in SQLite
- Provide balance and sweep functionality
"""

import os
from pathlib import Path
from typing import Optional

from cashu.core.settings import settings as cashu_settings
from cashu.wallet.wallet import Wallet
from cashu.wallet.helpers import deserialize_token_from_string, receive
from cashu.core.helpers import sum_proofs


class WalletService:
    """Service for managing the Cashu hot wallet."""

    def __init__(
        self, 
        db_path: str = "wallet_db", 
        mint_url: Optional[str] = None,
        mnemonic: Optional[str] = None,
    ):
        """Initialize the wallet service.

        Args:
            db_path: Path to the SQLite database directory
            mint_url: Default mint URL (can be overridden by token's mint)
            mnemonic: BIP39 mnemonic seed phrase for deterministic wallet recovery
        """
        self.db_path = Path(db_path)
        self.mint_url = mint_url or os.getenv(
            "MINT_URL", "https://mint.minibits.cash/Bitcoin"
        )
        self.mnemonic = mnemonic
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
        
        # Create wallet - use skip_db_read=True so we can init with custom mnemonic
        wallet = Wallet(
            url=url,
            db=str(self.db_path),
            name="sveltereader",
        )
        
        # Run migrations
        await wallet._migrate_database()
        
        # Initialize private key with mnemonic if provided
        await wallet._init_private_key(from_mnemonic=self.mnemonic)
        
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
            await self._wallet.load_proofs(reload=True)
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

    async def receive_token(self, token_str: str) -> dict:
        """Receive an ecash token and store the proofs.

        Args:
            token_str: Cashu token string (cashuA... or cashuB...)

        Returns:
            dict with 'success', 'amount', and optionally 'error'
        """
        try:
            # Deserialize the token string to get Token object
            token_obj = deserialize_token_from_string(token_str)
            mint_url = token_obj.mint
            
            print(f"[Wallet] Receiving token from mint: {mint_url}")
            print(f"[Wallet] Token amount: {token_obj.amount} sats")
            
            # Get wallet for this mint
            wallet = await self._get_or_create_wallet(mint_url)
            await wallet.load_proofs(reload=True)
            
            # Use the receive helper which handles TokenV3/V4 and calls redeem
            await receive(wallet, token_obj)
            
            # Reload proofs to get updated balance
            await wallet.load_proofs(reload=True)
            
            amount = token_obj.amount
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
            await self._wallet.load_proofs(reload=True)
            # available_balance returns Amount object, get the int value
            balance = self._wallet.available_balance
            # Handle both Amount object and int
            return int(balance.amount) if hasattr(balance, 'amount') else int(balance)
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
            await self._wallet.load_proofs(reload=True)
            balance_obj = self._wallet.available_balance
            # Handle both Amount object and int
            balance = int(balance_obj.amount) if hasattr(balance_obj, 'amount') else int(balance_obj)
            
            if amount > balance:
                print(f"[Wallet] Insufficient balance: {balance} < {amount}")
                return None
            
            # Select proofs to send
            send_proofs, fees = await self._wallet.select_to_send(
                self._wallet.proofs,
                amount,
                set_reserved=False,
            )
            
            # Serialize proofs to token string
            token = await self._wallet.serialize_proofs(send_proofs)
            
            # Mark proofs as reserved (spent from our perspective)
            await self._wallet.set_reserved_for_send(send_proofs, reserved=True)
            
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
        mnemonic = os.getenv("WALLET_MNEMONIC")
        
        if not mnemonic:
            raise RuntimeError(
                "\n" + "=" * 60 + "\n"
                "FATAL: WALLET_MNEMONIC environment variable is not set!\n"
                "=" * 60 + "\n"
                "A BIP39 12-word mnemonic is REQUIRED to run the wallet.\n"
                "Without it, funds cannot be recovered if the database is lost.\n\n"
                "To fix this:\n"
                "1. Generate a mnemonic at: https://iancoleman.io/bip39/\n"
                "2. Add to backend/.env: WALLET_MNEMONIC=word1 word2 word3 ...\n"
                "3. BACK UP YOUR MNEMONIC SECURELY!\n"
                "=" * 60
            )
        
        _wallet_service = WalletService(db_path=db_path, mint_url=mint_url, mnemonic=mnemonic)
    return _wallet_service


async def initialize_wallet() -> None:
    """Initialize the wallet service (call on startup)."""
    service = get_wallet_service()
    await service.initialize()
