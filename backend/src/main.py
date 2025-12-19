"""FastAPI backend for SvelteReader.

This backend serves as the interface between the Svelte frontend and the
self-hosted LangGraph agent. It handles:
- Chat message routing to the LangGraph agent
- Business logic (payment verification, rate limiting, etc.)
- Streaming responses back to the frontend
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.routers import chat

load_dotenv()

app = FastAPI(
    title="SvelteReader API",
    description="Backend API for SvelteReader AI chat features",
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
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])


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
