"""FastAPI backend for SvelteReader.

This backend handles:
- Wallet/ecash operations for the pay-per-use model
- Web search proxy (SearXNG) for Web Scrape mode
- URL scraping (Firecrawl) for content extraction

Chat functionality goes directly between the frontend and LangGraph server.
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.routers import wallet, search, suggestions
from src.services.wallet import initialize_wallet
from src.services.search import cleanup_clients

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

# Include routers
app.include_router(wallet.router, prefix="/api/wallet", tags=["wallet"])
app.include_router(search.router, prefix="/api", tags=["search"])
app.include_router(suggestions.router, prefix="/api", tags=["suggestions"])


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup."""
    print("[Startup] Initializing wallet service...")
    await initialize_wallet()
    print("[Startup] Wallet service ready")
    print("[Startup] Search service ready")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    print("[Shutdown] Cleaning up search clients...")
    await cleanup_clients()
    print("[Shutdown] Cleanup complete")


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
