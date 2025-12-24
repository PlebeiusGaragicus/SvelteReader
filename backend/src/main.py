"""FastAPI backend for SvelteReader.

This backend handles wallet/ecash operations for the pay-per-use model.
Chat functionality now goes directly between the frontend and LangGraph server.

Responsibilities:
- Ecash wallet management (receive tokens, check balance)
- Health checks
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.routers import wallet
from src.services.wallet import initialize_wallet

load_dotenv()

app = FastAPI(
    title="SvelteReader API",
    description="Backend API for SvelteReader wallet operations",
    version="0.0.1",
)

# Configure CORS for the Svelte frontend
origins = [
    "http://localhost:5173",  # Vite dev server
    "http://localhost:4173",  # Vite preview
    "http://127.0.0.1:5173",
    "http://127.0.0.1:4173",
]

# Add any additional origins from environment
if os.getenv("ALLOWED_ORIGINS"):
    origins.extend(os.getenv("ALLOWED_ORIGINS", "").split(","))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers (wallet only - chat goes directly to LangGraph)
app.include_router(wallet.router, prefix="/api/wallet", tags=["wallet"])


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup."""
    print("[Startup] Initializing wallet service...")
    await initialize_wallet()
    print("[Startup] Wallet service ready")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "SvelteReader API",
        "docs": "/docs",
        "health": "/health",
    }
