/**
 * Vector Service - Client-Side Semantic Search
 * 
 * Provides client-side embedding and vector search for books using:
 * - transformers.js: Runs embedding models in browser via WASM/WebGPU
 * - Persistent storage in IndexedDB for "index once, use forever"
 * 
 * This enables the AI agent to search the book without sending content to a server.
 */

import { 
	getVectorIndex, 
	storeVectorIndex, 
	type StoredVectorIndex 
} from './storageService';

// Types for the vector search results
export interface SearchResult {
	text: string;
	chapter: string;
	chapterId: string;
	score: number;
	startOffset?: number;  // Character offset within chapter
	endOffset?: number;    // End character offset within chapter
}

export interface ChapterInput {
	id: string;
	title: string;
	text: string;
	href?: string;
}

// Chunk configuration
const CHUNK_SIZE = 500;  // Characters per chunk
const CHUNK_OVERLAP = 50;  // Overlap between chunks

// In-memory storage for book indexes
const bookIndexes = new Map<string, BookIndex>();

interface BookIndex {
	chunks: ChunkData[];
	ready: boolean;
}

interface ChunkData {
	id: string;
	chapterId: string;
	chapterTitle: string;
	text: string;
	embedding: number[];
	startOffset: number;  // Character offset within chapter
	endOffset: number;    // End character offset within chapter
}

// Embedding model state
let embedderPromise: Promise<any> | null = null;
let embedderReady = false;

/**
 * Get or initialize the embedding model.
 * Uses lazy loading to avoid blocking the main thread.
 */
async function getEmbedder(): Promise<any> {
	if (embedderPromise) {
		return embedderPromise;
	}
	
	embedderPromise = (async () => {
		try {
			// Dynamically import transformers.js to enable code splitting
			const { pipeline } = await import('@xenova/transformers');
			
			console.log('[VectorService] Loading embedding model...');
			const embedder = await pipeline(
				'feature-extraction',
				'Xenova/all-MiniLM-L6-v2',
				{ 
					// Use WebGPU if available, fall back to WASM
					device: 'webgpu' in navigator ? 'webgpu' : 'wasm',
				}
			);
			
			embedderReady = true;
			console.log('[VectorService] Embedding model loaded');
			return embedder;
		} catch (error) {
			console.error('[VectorService] Failed to load embedding model:', error);
			embedderPromise = null;
			throw error;
		}
	})();
	
	return embedderPromise;
}

/**
 * Generate embedding for a text string.
 */
async function embed(text: string): Promise<number[]> {
	const embedder = await getEmbedder();
	const output = await embedder(text, { 
		pooling: 'mean', 
		normalize: true 
	});
	return Array.from(output.data as Float32Array);
}

/**
 * Check if the embedding model is ready.
 */
export function isEmbedderReady(): boolean {
	return embedderReady;
}

/**
 * Pre-load the embedding model (can be called early to reduce latency).
 */
export async function preloadEmbedder(): Promise<void> {
	await getEmbedder();
}

/**
 * Check if a book has been indexed (in memory).
 * For checking storage, use loadIndexFromStorage first.
 */
export function isBookIndexed(bookId: string): boolean {
	const index = bookIndexes.get(bookId);
	return index?.ready ?? false;
}

/**
 * Try to load a book's index from persistent storage.
 * Returns true if found and loaded, false otherwise.
 */
export async function loadIndexFromStorage(bookId: string): Promise<boolean> {
	// Already in memory?
	if (isBookIndexed(bookId)) {
		return true;
	}
	
	try {
		const stored = await getVectorIndex(bookId);
		if (stored && stored.chunks && stored.chunks.length > 0) {
			// Load into memory
			bookIndexes.set(bookId, {
				chunks: stored.chunks,
				ready: true,
			});
			console.log(`[VectorService] Loaded index from storage: ${stored.chunkCount} chunks for ${bookId.slice(0, 8)}...`);
			return true;
		}
	} catch (e) {
		console.warn('[VectorService] Failed to load index from storage:', e);
	}
	
	return false;
}

/**
 * Helper to yield to the event loop, keeping UI responsive during heavy processing.
 * Uses a longer timeout to ensure the UI can update.
 */
function yieldToMain(): Promise<void> {
	return new Promise(resolve => {
		// Use setTimeout with a small delay to ensure the browser can render
		// requestIdleCallback doesn't work well with CPU-intensive tasks
		setTimeout(resolve, 10);
	});
}

// Batch size for yielding - yield after every chunk to maximize responsiveness
// Embedding is CPU-intensive, so we need to yield frequently
const YIELD_BATCH_SIZE = 1;

/**
 * Index a book for semantic search.
 * Uses chunked processing with yielding to keep UI responsive.
 * 
 * @param bookId - Unique identifier for the book (SHA-256)
 * @param chapters - Array of chapters with id, title, and text
 * @param onProgress - Optional progress callback (0-1)
 */
export async function indexBook(
	bookId: string,
	chapters: ChapterInput[],
	onProgress?: (progress: number) => void
): Promise<void> {
	console.log(`[VectorService] Indexing book ${bookId.slice(0, 8)}... (${chapters.length} chapters)`);
	
	// Ensure embedder is loaded first (this can take time on first run)
	console.log('[VectorService] Loading embedding model...');
	await getEmbedder();
	console.log('[VectorService] Embedding model ready');
	
	const chunks: ChunkData[] = [];
	
	// Collect all text chunks first (fast, non-blocking)
	const allTextChunks: Array<{ 
		text: string; 
		chapterId: string; 
		chapterTitle: string; 
		index: number;
		startOffset: number;
		endOffset: number;
	}> = [];
	
	for (const chapter of chapters) {
		if (!chapter.text || chapter.text.trim().length === 0) {
			continue;
		}
		
		const textChunksWithOffsets = chunkTextWithOffsets(chapter.text, CHUNK_SIZE, CHUNK_OVERLAP);
		for (let i = 0; i < textChunksWithOffsets.length; i++) {
			const chunk = textChunksWithOffsets[i];
			allTextChunks.push({
				text: chunk.text,
				chapterId: chapter.id,
				chapterTitle: chapter.title,
				index: i,
				startOffset: chunk.startOffset,
				endOffset: chunk.endOffset,
			});
		}
	}
	
	const totalChunks = allTextChunks.length;
	console.log(`[VectorService] Processing ${totalChunks} text chunks...`);
	
	// Process chunks with yielding to keep UI responsive
	for (let i = 0; i < allTextChunks.length; i++) {
		const chunk = allTextChunks[i];
		
		try {
			const embedding = await embed(chunk.text);
			
			chunks.push({
				id: `${chunk.chapterId}-${chunk.index}`,
				chapterId: chunk.chapterId,
				chapterTitle: chunk.chapterTitle,
				text: chunk.text,
				embedding,
				startOffset: chunk.startOffset,
				endOffset: chunk.endOffset,
			});
		} catch (error) {
			console.warn(`[VectorService] Failed to embed chunk ${chunk.index} of ${chunk.chapterId}:`, error);
		}
		
		// Report progress
		onProgress?.((i + 1) / totalChunks);
		
		// Yield to event loop every YIELD_BATCH_SIZE chunks to keep UI responsive
		if ((i + 1) % YIELD_BATCH_SIZE === 0) {
			await yieldToMain();
		}
	}
	
	// Store the index in memory
	bookIndexes.set(bookId, {
		chunks,
		ready: true,
	});
	
	// Persist to IndexedDB for "index once, use forever"
	const storedIndex: StoredVectorIndex = {
		bookId,
		createdAt: Date.now(),
		chunkCount: chunks.length,
		chunks,
	};
	await storeVectorIndex(storedIndex);
	
	console.log(`[VectorService] Indexed and persisted ${chunks.length} chunks for book ${bookId.slice(0, 8)}`);
}

/**
 * Search a book using semantic similarity.
 * 
 * @param query - Natural language search query
 * @param bookId - Book to search
 * @param topK - Number of results to return
 * @returns Array of search results ranked by similarity
 */
export async function search(
	query: string,
	bookId: string,
	topK: number = 5
): Promise<SearchResult[]> {
	const index = bookIndexes.get(bookId);
	
	if (!index || !index.ready) {
		throw new Error(`Book not indexed: ${bookId.slice(0, 8)}...`);
	}
	
	// Embed the query
	const queryEmbedding = await embed(query);
	
	// Calculate similarity scores for all chunks
	const scored = index.chunks.map(chunk => ({
		chunk,
		score: cosineSimilarity(queryEmbedding, chunk.embedding),
	}));
	
	// Sort by score descending
	scored.sort((a, b) => b.score - a.score);
	
	// Return top K results with position metadata for citations
	return scored.slice(0, topK).map(({ chunk, score }) => ({
		text: chunk.text,
		chapter: chunk.chapterTitle,
		chapterId: chunk.chapterId,
		score,
		startOffset: chunk.startOffset,
		endOffset: chunk.endOffset,
	}));
}

/**
 * Clear the index for a book (to free memory).
 */
export function clearBookIndex(bookId: string): void {
	bookIndexes.delete(bookId);
	console.log(`[VectorService] Cleared index for book ${bookId.slice(0, 8)}`);
}

/**
 * Clear all book indexes.
 */
export function clearAllIndexes(): void {
	bookIndexes.clear();
	console.log('[VectorService] Cleared all book indexes');
}

/**
 * Get memory usage estimate for indexes.
 */
export function getMemoryUsage(): { totalChunks: number; books: number } {
	let totalChunks = 0;
	for (const index of bookIndexes.values()) {
		totalChunks += index.chunks.length;
	}
	return {
		totalChunks,
		books: bookIndexes.size,
	};
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Split text into overlapping chunks with position tracking.
 * Returns chunks with their start/end offsets in the original text.
 */
function chunkTextWithOffsets(text: string, size: number, overlap: number): Array<{ text: string; startOffset: number; endOffset: number }> {
	if (!text || text.length === 0) return [];
	if (size <= 0) return [{ text, startOffset: 0, endOffset: text.length }];
	if (overlap >= size) overlap = Math.floor(size / 2); // Prevent overlap >= size
	
	const chunks: Array<{ text: string; startOffset: number; endOffset: number }> = [];
	let start = 0;
	const maxChunks = Math.ceil(text.length / (size - overlap)) + 10; // Safety limit
	
	while (start < text.length && chunks.length < maxChunks) {
		// Calculate end position
		let end = Math.min(start + size, text.length);
		
		// Only try to find better break points if we're not at the end
		if (end < text.length) {
			// Look for a sentence boundary near the end
			const searchStart = Math.max(start + Math.floor(size * 0.7), start);
			const searchEnd = Math.min(end + 50, text.length);
			const searchText = text.slice(searchStart, searchEnd);
			
			// Find last sentence boundary in search area
			const sentenceMatch = searchText.match(/[.!?]\s+/);
			if (sentenceMatch && sentenceMatch.index !== undefined) {
				const breakPoint = searchStart + sentenceMatch.index + sentenceMatch[0].length;
				if (breakPoint > start && breakPoint <= end + 50) {
					end = breakPoint;
				}
			} else {
				// Fall back to word boundary
				const spaceIndex = text.lastIndexOf(' ', end);
				if (spaceIndex > start + Math.floor(size * 0.5)) {
					end = spaceIndex + 1; // Include the space in current chunk
				}
			}
		}
		
		// Extract and add chunk with offsets
		const chunkText = text.slice(start, end).trim();
		if (chunkText.length > 0) {
			// Find the actual start offset after trimming
			const trimmedStart = start + (text.slice(start, end).length - text.slice(start, end).trimStart().length);
			chunks.push({
				text: chunkText,
				startOffset: trimmedStart,
				endOffset: trimmedStart + chunkText.length,
			});
		}
		
		// Calculate next start position - ensure forward progress
		const nextStart = end - overlap;
		start = Math.max(nextStart, start + 1); // Always advance at least 1 character
		
		// If we've covered all the text, stop
		if (end >= text.length) break;
	}
	
	return chunks;
}

/**
 * Calculate cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) {
		throw new Error('Vectors must have same length');
	}
	
	let dotProduct = 0;
	let normA = 0;
	let normB = 0;
	
	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	
	const denominator = Math.sqrt(normA) * Math.sqrt(normB);
	
	if (denominator === 0) return 0;
	
	return dotProduct / denominator;
}

// Export as a namespace-like object for consistency
export const vectorService = {
	isEmbedderReady,
	preloadEmbedder,
	isBookIndexed,
	loadIndexFromStorage,
	indexBook,
	search,
	clearBookIndex,
	clearAllIndexes,
	getMemoryUsage,
};

