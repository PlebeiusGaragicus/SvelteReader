/**
 * OCR Service - Extract text from PDFs and images via backend OCR API
 * 
 * Calls the backend /api/ocr endpoint which uses vision-capable LLMs.
 * PDFs are rendered page-by-page as images and sent to backend for OCR.
 * 
 * Model configuration is handled by the backend via environment variables.
 */

import { settingsStore } from '$lib/stores/settings.svelte';
import type { UserFile, OcrVersion } from '$lib/stores/userFiles.svelte';
import { loadPdf, renderPageToImage } from '$lib/services/pdfService';

// =============================================================================
// TYPES
// =============================================================================

export interface OcrResult {
	success: boolean;
	ocrVersion?: OcrVersion;
	error?: string;
}

export interface OcrProgress {
	currentPage: number;
	totalPages: number;
	status: 'rendering' | 'processing' | 'complete' | 'error';
}

interface BackendOcrResponse {
	text: string;
	model: string;
}

interface BackendBatchOcrResponse {
	pages: string[];
	model: string;
	page_count: number;
}

interface BackendStatusResponse {
	available: boolean;
	model: string | null;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Convert ArrayBuffer/Uint8Array to base64 data URL
 */
function arrayBufferToBase64DataUrl(buffer: ArrayBuffer | Uint8Array, mimeType: string): string {
	const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	const base64 = btoa(binary);
	return `data:${mimeType};base64,${base64}`;
}


/**
 * Call the backend OCR API for a single image
 * Returns both the extracted text and the model used
 */
async function callBackendOcr(imageDataUrl: string): Promise<BackendOcrResponse> {
	const backendUrl = settingsStore.backendUrl;
	
	const response = await fetch(`${backendUrl}/api/ocr`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			image: imageDataUrl,
		}),
	});
	
	if (!response.ok) {
		const errorData = await response.json().catch(() => ({ detail: response.statusText }));
		throw new Error(errorData.detail || `OCR API error (${response.status})`);
	}
	
	return await response.json();
}

/**
 * Call the backend batch OCR API for multiple images (PDF pages)
 * Returns both the extracted pages and the model used
 */
async function callBackendBatchOcr(images: string[]): Promise<BackendBatchOcrResponse> {
	const backendUrl = settingsStore.backendUrl;
	
	const response = await fetch(`${backendUrl}/api/ocr/batch`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			images,
		}),
	});
	
	if (!response.ok) {
		const errorData = await response.json().catch(() => ({ detail: response.statusText }));
		throw new Error(errorData.detail || `OCR API error (${response.status})`);
	}
	
	return await response.json();
}

/**
 * Check if OCR service is available on the backend
 */
export async function checkOcrAvailability(): Promise<{ available: boolean; model: string | null }> {
	try {
		const backendUrl = settingsStore.backendUrl;
		const response = await fetch(`${backendUrl}/api/ocr/status`);
		
		if (!response.ok) return { available: false, model: null };
		
		const data: BackendStatusResponse = await response.json();
		return { available: data.available, model: data.model };
	} catch {
		return { available: false, model: null };
	}
}

// =============================================================================
// MAIN OCR FUNCTIONS
// =============================================================================

/**
 * OCR an image file
 */
async function ocrImage(file: UserFile): Promise<OcrVersion> {
	const imageDataUrl = arrayBufferToBase64DataUrl(file.content, file.mimeType);
	const result = await callBackendOcr(imageDataUrl);
	
	return {
		id: crypto.randomUUID(),
		model: result.model,
		provider: 'backend',
		generatedAt: Date.now(),
		temperature: 0,
		maxTokens: 4096,
		pages: [result.text],
		label: 'OCR Extract',
	};
}

/**
 * OCR a PDF file, page by page
 * 
 * For PDFs with many pages, we render all pages first, then batch OCR them.
 * This provides better UX with progress updates.
 */
async function ocrPdf(
	file: UserFile,
	onProgress?: (progress: OcrProgress) => void
): Promise<OcrVersion> {
	// Load the PDF using centralized pdfService
	const pdf = await loadPdf(file.content);
	const totalPages = pdf.numPages;
	
	// Step 1: Render all pages to images
	const imageDataUrls: string[] = [];
	
	for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
		onProgress?.({
			currentPage: pageNum,
			totalPages,
			status: 'rendering',
		});
		
		const imageDataUrl = await renderPageToImage(pdf, pageNum);
		imageDataUrls.push(imageDataUrl);
	}
	
	// Step 2: OCR pages - use batch for efficiency, or one-by-one for progress
	let pages: string[];
	let modelUsed: string;
	
	if (totalPages <= 5) {
		// For small PDFs, use batch API (more efficient)
		onProgress?.({
			currentPage: 1,
			totalPages,
			status: 'processing',
		});
		
		const result = await callBackendBatchOcr(imageDataUrls);
		pages = result.pages;
		modelUsed = result.model;
	} else {
		// For larger PDFs, process one by one with progress updates
		pages = [];
		modelUsed = 'unknown';
		
		for (let i = 0; i < imageDataUrls.length; i++) {
			onProgress?.({
				currentPage: i + 1,
				totalPages,
				status: 'processing',
			});
			
			const result = await callBackendOcr(imageDataUrls[i]);
			pages.push(result.text);
			modelUsed = result.model; // Use the last model (they should all be the same)
		}
	}
	
	onProgress?.({
		currentPage: totalPages,
		totalPages,
		status: 'complete',
	});
	
	return {
		id: crypto.randomUUID(),
		model: modelUsed,
		provider: 'backend',
		generatedAt: Date.now(),
		temperature: 0,
		maxTokens: 4096,
		pages,
		label: 'OCR Extract',
	};
}

/**
 * OCR a file (PDF or image)
 * 
 * @param file The UserFile to OCR
 * @param onProgress Optional callback for progress updates (PDFs only)
 * @returns OcrResult with the extracted text or error
 */
export async function ocrFile(
	file: UserFile,
	onProgress?: (progress: OcrProgress) => void
): Promise<OcrResult> {
	try {
		// Validate file type
		if (file.type !== 'pdf' && file.type !== 'image') {
			return {
				success: false,
				error: `OCR not supported for file type: ${file.type}`,
			};
		}
		
		let ocrVersion: OcrVersion;
		
		if (file.type === 'pdf') {
			ocrVersion = await ocrPdf(file, onProgress);
		} else {
			ocrVersion = await ocrImage(file);
		}
		
		return {
			success: true,
			ocrVersion,
		};
	} catch (error) {
		console.error('[OCR Service] Error:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown OCR error',
		};
	}
}

/**
 * Check if a file can be OCR'd
 */
export function canOcrFile(file: UserFile): boolean {
	return file.type === 'pdf' || file.type === 'image';
}
