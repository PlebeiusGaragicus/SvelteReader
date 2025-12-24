/**
 * Vector Service - Client-Side Semantic Search
 * 
 * Provides client-side embedding and vector search for books using:
 * - transformers.js: Runs embedding models in browser via WASM/WebGPU
 * - Orama: Pure JS search engine with vector support
 * 
 * This enables the AI agent to search the book without sending content to a server.
 */

// Note: These imports require installing the packages:
// pnpm add @xenova/transformers @orama/orama

// Types for the vector search results
export interface SearchResult {
	text: string;
	chapter: string;
	chapterId: string;
	score: number;
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
 * Check if a book has been indexed.
 */
export function isBookIndexed(bookId: string): boolean {
	const index = bookIndexes.get(bookId);
	return index?.ready ?? false;
}

/**
 * Index a book for semantic search.
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
	
	// Ensure embedder is loaded
	await getEmbedder();
	
	const chunks: ChunkData[] = [];
	
	// Count total chunks for progress
	const totalChunks = chapters.reduce(
		(sum, ch) => sum + Math.ceil(ch.text.length / (CHUNK_SIZE - CHUNK_OVERLAP)),
		0
	);
	let processedChunks = 0;
	
	// Process each chapter
	for (const chapter of chapters) {
		if (!chapter.text || chapter.text.trim().length === 0) {
			continue;
		}
		
		// Split chapter into chunks
		const textChunks = chunkText(chapter.text, CHUNK_SIZE, CHUNK_OVERLAP);
		
		// Embed each chunk
		for (let i = 0; i < textChunks.length; i++) {
			const chunkText = textChunks[i];
			
			try {
				const embedding = await embed(chunkText);
				
				chunks.push({
					id: `${chapter.id}-${i}`,
					chapterId: chapter.id,
					chapterTitle: chapter.title,
					text: chunkText,
					embedding,
				});
			} catch (error) {
				console.warn(`[VectorService] Failed to embed chunk ${i} of ${chapter.id}:`, error);
			}
			
			processedChunks++;
			onProgress?.(processedChunks / totalChunks);
		}
	}
	
	// Store the index
	bookIndexes.set(bookId, {
		chunks,
		ready: true,
	});
	
	console.log(`[VectorService] Indexed ${chunks.length} chunks for book ${bookId.slice(0, 8)}`);
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
	
	// Return top K results
	return scored.slice(0, topK).map(({ chunk, score }) => ({
		text: chunk.text,
		chapter: chunk.chapterTitle,
		chapterId: chunk.chapterId,
		score,
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
 * Split text into overlapping chunks.
 */
function chunkText(text: string, size: number, overlap: number): string[] {
	const chunks: string[] = [];
	let start = 0;
	
	while (start < text.length) {
		// Try to break at sentence/word boundaries
		let end = start + size;
		
		if (end < text.length) {
			// Look for a good break point (sentence end or space)
			const searchStart = Math.max(end - 50, start);
			const searchText = text.slice(searchStart, end + 50);
			
			// Prefer sentence boundaries
			const sentenceMatch = searchText.match(/[.!?]\s+/g);
			if (sentenceMatch) {
				const lastSentenceEnd = searchText.lastIndexOf(sentenceMatch[sentenceMatch.length - 1]);
				if (lastSentenceEnd > 0) {
					end = searchStart + lastSentenceEnd + sentenceMatch[sentenceMatch.length - 1].length;
				}
			} else {
				// Fall back to word boundary
				const spaceIndex = text.lastIndexOf(' ', end);
				if (spaceIndex > start) {
					end = spaceIndex;
				}
			}
		} else {
			end = text.length;
		}
		
		const chunk = text.slice(start, end).trim();
		if (chunk.length > 0) {
			chunks.push(chunk);
		}
		
		start = end - overlap;
		if (start >= text.length) break;
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
	indexBook,
	search,
	clearBookIndex,
	clearAllIndexes,
	getMemoryUsage,
};

