"""OCR router for extracting text from images.

Provides endpoints for OCR using vision-capable models.
Supports single images and batch processing for multi-page documents.

Model configuration is read from environment variables - never hardcoded.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.services.ocr import ocr_image, ocr_images, is_configured, get_model_name

router = APIRouter()


# Request/Response models

class OcrRequest(BaseModel):
    """Request body for single image OCR."""
    image: str  # Base64-encoded image or data URL


class OcrResponse(BaseModel):
    """Response from OCR endpoint."""
    text: str
    model: str


class BatchOcrRequest(BaseModel):
    """Request body for batch OCR (multiple pages)."""
    images: list[str]  # List of base64-encoded images or data URLs


class BatchOcrResponse(BaseModel):
    """Response from batch OCR endpoint."""
    pages: list[str]  # Extracted text per page
    model: str
    page_count: int


# Endpoints

@router.post("/ocr", response_model=OcrResponse)
async def perform_ocr(request: OcrRequest) -> OcrResponse:
    """Extract text from a single image using OCR.
    
    Args:
        request: Image data
        
    Returns:
        Extracted text in markdown format
    """
    if not is_configured():
        raise HTTPException(
            status_code=503,
            detail="OCR service not configured. Set LLM_BASE_URL and OCR_MODEL environment variables."
        )
    
    try:
        text = await ocr_image(image_data=request.image)
        
        return OcrResponse(
            text=text,
            model=get_model_name() or "unknown",
        )
        
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        print(f"[OCR] Error: {e}")
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")


@router.post("/ocr/batch", response_model=BatchOcrResponse)
async def perform_batch_ocr(request: BatchOcrRequest) -> BatchOcrResponse:
    """Extract text from multiple images (e.g., PDF pages).
    
    Args:
        request: List of image data
        
    Returns:
        Extracted text per page in markdown format
    """
    if not is_configured():
        raise HTTPException(
            status_code=503,
            detail="OCR service not configured. Set LLM_BASE_URL and OCR_MODEL environment variables."
        )
    
    if not request.images:
        raise HTTPException(status_code=400, detail="No images provided")
    
    if len(request.images) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 pages per request")
    
    try:
        pages = await ocr_images(images=request.images)
        
        return BatchOcrResponse(
            pages=pages,
            model=get_model_name() or "unknown",
            page_count=len(pages),
        )
        
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        print(f"[OCR Batch] Error: {e}")
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")


@router.get("/ocr/status")
async def ocr_status():
    """Check if OCR service is available.
    
    Returns:
        Status of OCR service configuration
    """
    return {
        "available": is_configured(),
        "model": get_model_name(),
    }


@router.get("/ocr/models")
async def list_models():
    """List available models from the LLM endpoint.
    
    Calls the /models endpoint to show what's available.
    Useful for finding vision-capable models for OCR.
    """
    import os
    import httpx
    
    base_url = os.getenv("LLM_BASE_URL")
    api_key = os.getenv("LLM_API_KEY")
    
    if not base_url:
        return {"error": "LLM_BASE_URL not configured", "models": [], "base_url": None}
    
    models_url = f"{base_url}/models"
    
    try:
        headers = {}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(models_url, headers=headers, timeout=10.0)
            if response.status_code == 200:
                data = response.json()
                models = [m.get("id") for m in data.get("data", [])]
                return {
                    "models": models,
                    "current_ocr_model": get_model_name(),
                    "base_url": base_url,
                    "hint": "Vision/VL models are needed for OCR"
                }
            else:
                return {
                    "error": f"API returned {response.status_code}: {response.text[:200]}",
                    "models": [],
                    "tried_url": models_url
                }
    except Exception as e:
        return {
            "error": str(e),
            "models": [],
            "tried_url": models_url,
            "base_url": base_url
        }
