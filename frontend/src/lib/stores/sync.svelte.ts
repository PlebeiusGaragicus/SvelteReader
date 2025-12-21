/**
 * Sync Store - Manages Nostr annotation and book sync state
 * 
 * Provides:
 * - Sync status (idle, syncing, error)
 * - Last sync timestamp
 * - Sync statistics for both annotations and books
 * - Manual sync trigger
 * - Ghost book creation for books synced without local EPUB
 */

import { browser } from '$app/environment';
import { fetchAnnotations, fetchBooks, type CyphertapPublisher, type BookFetchResult } from '$lib/services/nostrService';
import type { Annotation, BookIdentity } from '$lib/types';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface SyncStats {
	lastSyncAt: number | null;
	// Annotation stats
	fetchedCount: number;
	mergedCount: number;
	conflictCount: number;
	// Book stats
	booksFetchedCount: number;
	booksMergedCount: number;
	ghostBooksCreated: number;
}

const STORAGE_KEY = 'sveltereader-sync';

const DEFAULT_STATS: SyncStats = {
	lastSyncAt: null,
	fetchedCount: 0,
	mergedCount: 0,
	conflictCount: 0,
	booksFetchedCount: 0,
	booksMergedCount: 0,
	ghostBooksCreated: 0,
};

function loadSyncStats(): SyncStats {
	if (!browser) return { ...DEFAULT_STATS };
	
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			// Merge with defaults to handle new fields
			return { ...DEFAULT_STATS, ...JSON.parse(stored) };
		}
	} catch (e) {
		console.error('[Sync] Failed to load sync stats:', e);
	}
	return { ...DEFAULT_STATS };
}

function saveSyncStats(stats: SyncStats): void {
	if (!browser) return;
	
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
	} catch (e) {
		console.error('[Sync] Failed to save sync stats:', e);
	}
}

// Book with Nostr sync metadata from fetch
export type FetchedBook = BookIdentity & { nostrEventId: string; nostrCreatedAt: number; relays: string[] };

function createSyncStore() {
	let status = $state<SyncStatus>('idle');
	let error = $state<string | null>(null);
	let stats = $state<SyncStats>(loadSyncStats());
	let cyphertapInstance: CyphertapPublisher | null = null;
	
	// Callback to merge fetched annotations into local store
	let mergeAnnotationsCallback: ((annotations: Annotation[]) => Promise<{ merged: number; conflicts: number }>) | null = null;
	
	// Callback to merge fetched books into local store
	let mergeBooksCallback: ((books: FetchedBook[]) => Promise<{ merged: number; ghostsCreated: number }>) | null = null;

	function setCyphertap(cyphertap: CyphertapPublisher | null): void {
		cyphertapInstance = cyphertap;
		// Clear error state when CypherTap connects (user logged in)
		if (cyphertap && status === 'error') {
			status = 'idle';
			error = null;
		}
	}

	function setMergeCallback(callback: (annotations: Annotation[]) => Promise<{ merged: number; conflicts: number }>): void {
		mergeAnnotationsCallback = callback;
	}

	function setBookMergeCallback(callback: (books: FetchedBook[]) => Promise<{ merged: number; ghostsCreated: number }>): void {
		mergeBooksCallback = callback;
	}

	async function sync(): Promise<boolean> {
		if (!cyphertapInstance) {
			console.warn('[Sync] No CypherTap instance available');
			error = 'Not connected to Nostr';
			return false;
		}

		if (!cyphertapInstance.isLoggedIn) {
			console.warn('[Sync] Not logged in');
			error = 'Not logged in';
			return false;
		}

		if (status === 'syncing') {
			console.warn('[Sync] Already syncing');
			return false;
		}

		console.log('[Sync] Starting sync...');
		status = 'syncing';
		error = null;

		try {
			// Fetch both books and annotations in parallel
			const [booksResult, annotationsResult] = await Promise.all([
				fetchBooks(cyphertapInstance),
				fetchAnnotations(cyphertapInstance),
			]);
			
			if (!annotationsResult.success) {
				throw new Error(annotationsResult.error || 'Annotation fetch failed');
			}
			
			if (!booksResult.success) {
				throw new Error(booksResult.error || 'Book fetch failed');
			}

			console.log(`[Sync] Fetched ${annotationsResult.annotations.length} annotations from Nostr`);
			console.log(`[Sync] Fetched ${booksResult.books.length} books from Nostr`);

			// Merge books first (so ghost books exist for annotations)
			let booksMerged = 0;
			let ghostsCreated = 0;

			if (mergeBooksCallback && booksResult.books.length > 0) {
				const bookMergeResult = await mergeBooksCallback(booksResult.books);
				booksMerged = bookMergeResult.merged;
				ghostsCreated = bookMergeResult.ghostsCreated;
				console.log(`[Sync] Books merged: ${booksMerged}, Ghost books created: ${ghostsCreated}`);
			}

			// Then merge annotations
			let annotationsMerged = 0;
			let conflicts = 0;

			if (mergeAnnotationsCallback && annotationsResult.annotations.length > 0) {
				const mergeResult = await mergeAnnotationsCallback(annotationsResult.annotations);
				annotationsMerged = mergeResult.merged;
				conflicts = mergeResult.conflicts;
				console.log(`[Sync] Annotations merged: ${annotationsMerged}, Conflicts: ${conflicts}`);
			}

			stats = {
				lastSyncAt: Date.now(),
				fetchedCount: annotationsResult.annotations.length,
				mergedCount: annotationsMerged,
				conflictCount: conflicts,
				booksFetchedCount: booksResult.books.length,
				booksMergedCount: booksMerged,
				ghostBooksCreated: ghostsCreated,
			};
			saveSyncStats(stats);

			status = 'success';
			error = null; // Clear any previous error on success
			console.log('[Sync] ✓ Sync complete!');
			
			// Reset to idle after a short delay
			setTimeout(() => {
				if (status === 'success') {
					status = 'idle';
				}
			}, 3000);

			return true;
		} catch (e) {
			console.error('[Sync] ✗ Sync failed:', e);
			error = e instanceof Error ? e.message : 'Unknown error';
			status = 'error';
			return false;
		}
	}

	function reset(): void {
		status = 'idle';
		error = null;
		stats = { ...DEFAULT_STATS };
		saveSyncStats(stats);
	}

	return {
		get status() { return status; },
		get error() { return error; },
		get stats() { return stats; },
		// Note: For reactive login state in UI, use cyphertap.isLoggedIn directly
		// This getter is for internal use only (e.g., in sync() function)
		get hasCyphertap() { return cyphertapInstance !== null; },
		
		setCyphertap,
		setMergeCallback,
		setBookMergeCallback,
		sync,
		reset,
	};
}

export const syncStore = createSyncStore();

export function useSyncStore() {
	return syncStore;
}
