/**
 * PDF Service - Centralized PDF.js initialization and utilities
 * 
 * Uses pdfjs-dist with proper worker setup for Vite/SvelteKit.
 */

import { browser } from '$app/environment';

let pdfjsLib: typeof import('pdfjs-dist') | null = null;
let initPromise: Promise<typeof import('pdfjs-dist')> | null = null;

/**
 * Initialize PDF.js with the worker properly configured.
 * Safe to call multiple times - will only initialize once.
 */
export async function initPdfJs(): Promise<typeof import('pdfjs-dist')> {
	if (!browser) {
		throw new Error('PDF.js can only be used in the browser');
	}

	if (pdfjsLib) {
		return pdfjsLib;
	}

	if (initPromise) {
		return initPromise;
	}

	initPromise = (async () => {
		const pdfjs = await import('pdfjs-dist');
		
		// Import the worker as a URL using Vite's ?url suffix
		// This copies the worker to the build output and gives us the URL
		const workerUrl = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
		pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
		
		pdfjsLib = pdfjs;
		return pdfjs;
	})();

	return initPromise;
}

/**
 * Load a PDF document from binary data.
 * Always creates a copy to avoid consuming the original buffer.
 */
export async function loadPdf(data: ArrayBuffer | Uint8Array): Promise<import('pdfjs-dist').PDFDocumentProxy> {
	const pdfjs = await initPdfJs();
	// Create a copy to avoid PDF.js transferring/consuming the original buffer
	const content = data instanceof Uint8Array 
		? new Uint8Array(data) 
		: new Uint8Array(data.slice(0));
	const loadingTask = pdfjs.getDocument({ data: content });
	return loadingTask.promise;
}

/**
 * Render a PDF page to a canvas and return as base64 PNG data URL.
 */
export async function renderPageToImage(
	pdf: import('pdfjs-dist').PDFDocumentProxy,
	pageNum: number,
	scale: number = 2.0
): Promise<string> {
	const page = await pdf.getPage(pageNum);
	const viewport = page.getViewport({ scale });
	
	const canvas = document.createElement('canvas');
	canvas.width = viewport.width;
	canvas.height = viewport.height;
	
	const context = canvas.getContext('2d');
	if (!context) {
		throw new Error('Failed to get canvas context');
	}
	
	await page.render({
		canvasContext: context,
		viewport: viewport,
		canvas: canvas as unknown as HTMLCanvasElement
	}).promise;
	
	return canvas.toDataURL('image/png');
}

/**
 * Generate a thumbnail from the first page of a PDF.
 */
export async function generateThumbnail(
	data: ArrayBuffer | Uint8Array,
	maxWidth: number = 200
): Promise<string | undefined> {
	try {
		const pdf = await loadPdf(data);
		const page = await pdf.getPage(1);
		
		const viewport = page.getViewport({ scale: 1.0 });
		const scale = maxWidth / viewport.width;
		const scaledViewport = page.getViewport({ scale });
		
		const canvas = document.createElement('canvas');
		canvas.width = scaledViewport.width;
		canvas.height = scaledViewport.height;
		
		const context = canvas.getContext('2d');
		if (!context) return undefined;
		
		await page.render({
			canvasContext: context,
			viewport: scaledViewport,
			canvas: canvas as unknown as HTMLCanvasElement
		}).promise;
		
		return canvas.toDataURL('image/png', 0.8);
	} catch (error) {
		console.error('[PDF] Failed to generate thumbnail:', error);
		return undefined;
	}
}

/**
 * Extract text from a PDF.
 */
export async function extractText(
	data: ArrayBuffer | Uint8Array,
	maxPages?: number
): Promise<string> {
	const pdf = await loadPdf(data);
	const numPages = maxPages ? Math.min(pdf.numPages, maxPages) : pdf.numPages;
	
	let fullText = '';
	
	for (let i = 1; i <= numPages; i++) {
		const page = await pdf.getPage(i);
		const textContent = await page.getTextContent();
		const pageText = textContent.items
			.filter((item): item is import('pdfjs-dist/types/src/display/api').TextItem => 'str' in item)
			.map(item => item.str)
			.join(' ');
		
		if (pageText.trim()) {
			fullText += (fullText ? '\n\n' : '') + pageText;
		}
	}
	
	return fullText;
}
