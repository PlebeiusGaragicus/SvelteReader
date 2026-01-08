"""OCR Service - Extract text from images using OpenAI-compatible Vision API.

Uses vision-capable models to extract text from images.
Model configuration is read from environment variables - never hardcoded.

Environment Variables:
    LLM_BASE_URL: API endpoint URL (required)
    LLM_API_KEY: API key (optional for local models)
    OCR_MODEL: Vision model name for OCR (required)
"""

import os
from typing import Optional

import httpx

# OCR prompt for text extraction
OCR_PROMPT = """Extract all text from this image. Preserve the original formatting as much as possible using markdown. Include:
- Headings (use # for titles, ## for sections, etc.)
- Lists (bulleted or numbered)
- Tables (use markdown table syntax)
- Paragraphs with proper line breaks

Return ONLY the extracted text content in markdown format, no explanations or meta-commentary."""


OCR_PROMPT_ZAI = """Free OCR."""

def get_ocr_config() -> tuple[str, str, str]:
    """Get OCR configuration from environment.
    
    Returns:
        Tuple of (base_url, api_key, model)
        
    Raises:
        ValueError: If required environment variables are not set
    """
    base_url = os.getenv("LLM_BASE_URL")
    api_key = os.getenv("LLM_API_KEY", "")
    model = os.getenv("OCR_MODEL")
    
    if not base_url:
        raise ValueError(
            "LLM_BASE_URL environment variable is required. "
            "Set it to your OpenAI-compatible endpoint."
        )
    
    if not model:
        raise ValueError(
            "OCR_MODEL environment variable is required. "
            "Set it to a vision-capable model name."
        )
    
    return base_url, api_key, model


def is_configured() -> bool:
    """Check if OCR service is properly configured."""
    return bool(os.getenv("LLM_BASE_URL") and os.getenv("OCR_MODEL"))


def get_model_name() -> Optional[str]:
    """Get the configured OCR model name."""
    return os.getenv("OCR_MODEL")


def convert_to_png_base64(image_data: str) -> str:
    """Convert any image format to PNG base64 data URL.
    
    Some vision APIs don't support all formats (e.g., WebP).
    This converts to PNG which is universally supported.
    """
    import base64
    import io
    from PIL import Image
    
    # Extract base64 data from data URL
    if image_data.startswith("data:"):
        # Format: data:image/xxx;base64,XXXXX
        header, b64data = image_data.split(",", 1)
    else:
        b64data = image_data
    
    # Decode base64 to bytes
    img_bytes = base64.b64decode(b64data)
    
    # Open with PIL and convert to PNG
    img = Image.open(io.BytesIO(img_bytes))
    
    # Convert to RGB if necessary (e.g., for RGBA images)
    if img.mode in ('RGBA', 'LA', 'P'):
        # Create white background for transparency
        background = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'P':
            img = img.convert('RGBA')
        background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
        img = background
    elif img.mode != 'RGB':
        img = img.convert('RGB')
    
    # Save as PNG to bytes
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    png_bytes = buffer.getvalue()
    
    # Encode back to base64
    png_b64 = base64.b64encode(png_bytes).decode('utf-8')
    
    return f"data:image/png;base64,{png_b64}"


async def ocr_image(image_data: str) -> str:
    """Extract text from an image using vision model.
    
    Args:
        image_data: Base64-encoded image data or data URL
        
    Returns:
        Extracted text in markdown format
        
    Raises:
        ValueError: If not configured
        Exception: If OCR fails
    """
    base_url, api_key, model = get_ocr_config()
    
    # Convert to PNG for maximum compatibility (handles WebP, etc.)
    try:
        image_data = convert_to_png_base64(image_data)
    except Exception as e:
        print(f"[OCR] Warning: Could not convert image format: {e}")
        if not image_data.startswith("data:"):
            image_data = f"data:image/png;base64,{image_data}"
    
    # Build the request - use data URL format (OpenAI standard)
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": OCR_PROMPT_ZAI},
                    {
                        "type": "image_url",
                        "image_url": {"url": image_data}
                    }
                ]
            }
        ],
        "max_tokens": 4096,
        "temperature": 0,
    }
    
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{base_url}/chat/completions",
            json=payload,
            headers=headers,
        )
        
        if response.status_code != 200:
            error_text = response.text
            raise Exception(f"OCR API error ({response.status_code}): {error_text}")
        
        data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content")
        
        if not content:
            raise Exception("No content in OCR response")
        
        return content


async def ocr_images(images: list[str]) -> list[str]:
    """Extract text from multiple images.
    
    Args:
        images: List of base64-encoded image data or data URLs
        
    Returns:
        List of extracted text, one per image
    """
    results = []
    for image_data in images:
        text = await ocr_image(image_data)
        results.append(text)
    return results
