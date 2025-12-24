/**
 * Indexing Store - Tracks book indexing status for AI search
 * 
 * Indexing is triggered when a book is opened and runs in the background.
 * Indexes are persisted to IndexedDB for "index once, use forever".
 * The UI can display progress and status to inform users.
 */

import { ensureBookIndexed } from '$lib/services/agentToolsService';
import { loadIndexFromStorage, isBookIndexed } from '$lib/services/vectorService';

export type IndexingStatus = 'idle' | 'loading-model' | 'indexing' | 'ready' | 'error';

interface IndexingState {
	status: IndexingStatus;
	progress: number; // 0-1
	bookId: string | null;
	error: string | null;
}

function createIndexingStore() {
	let status = $state<IndexingStatus>('idle');
	let progress = $state(0);
	let bookId = $state<string | null>(null);
	let error = $state<string | null>(null);
	
	// Track which book is currently being indexed to prevent duplicate indexing
	let currentlyIndexingBookId: string | null = null;
	
	/**
	 * Start indexing a book in the background.
	 * First checks if index exists in storage (persisted from previous session).
	 * Safe to call multiple times - will skip if already indexing or indexed.
	 */
	async function indexBook(id: string): Promise<void> {
		// Skip if already indexing this book
		if (currentlyIndexingBookId === id) {
			console.log('[IndexingStore] Already indexing this book, skipping');
			return;
		}
		
		// Skip if already indexed in memory
		if (bookId === id && status === 'ready') {
			console.log('[IndexingStore] Book already indexed in memory, skipping');
			return;
		}
		
		// Check if already in memory from somewhere else
		if (isBookIndexed(id)) {
			console.log('[IndexingStore] Book already indexed in memory');
			bookId = id;
			status = 'ready';
			progress = 1;
			return;
		}
		
		// Try to load from persistent storage first (fast!)
		console.log(`[IndexingStore] Checking for persisted index: ${id.slice(0, 8)}...`);
		const loadedFromStorage = await loadIndexFromStorage(id);
		if (loadedFromStorage) {
			console.log('[IndexingStore] Loaded index from storage - no re-indexing needed!');
			bookId = id;
			status = 'ready';
			progress = 1;
			return;
		}
		
		// Need to index from scratch
		currentlyIndexingBookId = id;
		bookId = id;
		status = 'loading-model';
		progress = 0;
		error = null;
		
		console.log(`[IndexingStore] No persisted index found, indexing book: ${id.slice(0, 8)}...`);
		
		try {
			const success = await ensureBookIndexed(id, (p) => {
				// Update progress and status
				if (status === 'loading-model' && p > 0) {
					status = 'indexing';
				}
				progress = p;
			});
			
			if (success) {
				status = 'ready';
				progress = 1;
				console.log('[IndexingStore] Book indexed and saved to storage');
			} else {
				status = 'error';
				error = 'Indexing failed - search may not work';
				console.warn('[IndexingStore] Indexing failed');
			}
		} catch (e) {
			status = 'error';
			error = e instanceof Error ? e.message : 'Unknown error';
			console.error('[IndexingStore] Indexing error:', e);
		} finally {
			currentlyIndexingBookId = null;
		}
	}
	
	/**
	 * Reset the store (e.g., when closing a book).
	 */
	function reset(): void {
		status = 'idle';
		progress = 0;
		bookId = null;
		error = null;
		currentlyIndexingBookId = null;
	}
	
	return {
		get status() { return status; },
		get progress() { return progress; },
		get bookId() { return bookId; },
		get error() { return error; },
		
		// Derived states for UI
		get isIndexing() { return status === 'loading-model' || status === 'indexing'; },
		get isReady() { return status === 'ready'; },
		get progressPercent() { return Math.round(progress * 100); },
		
		indexBook,
		reset,
	};
}

export const indexingStore = createIndexingStore();

