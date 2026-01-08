"""FastAPI backend for SvelteReader AI services.

This backend handles:
- Web search proxy (SearXNG) for Web Scrape mode
- URL scraping (Firecrawl) for content extraction
- AI-powered suggestions
- OCR via vision models

Payments are handled by a separate service (payments/) for security isolation.
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.routers import search, suggestions, ocr
from src.services.search import cleanup_clients

load_dotenv()

app = FastAPI(
    title="SvelteReader AI API",
    description="AI backend API for SvelteReader",
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
app.include_router(search.router, prefix="/api", tags=["search"])
app.include_router(suggestions.router, prefix="/api", tags=["suggestions"])
app.include_router(ocr.router, prefix="/api", tags=["ocr"])


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup."""
    print("[Startup] AI backend ready")
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
    return {"status": "healthy", "service": "ai-backend"}


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "SvelteReader AI API",
        "docs": "/docs",
        "health": "/health",
    }
