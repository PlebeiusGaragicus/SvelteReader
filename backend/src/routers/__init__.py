"""API Routers for AI backend.

Handles search, suggestions, and OCR.
Payments are in a separate service (payments/).
"""

from src.routers import search, suggestions, ocr

__all__ = ["search", "suggestions", "ocr"]
