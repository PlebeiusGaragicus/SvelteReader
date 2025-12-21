/**
 * Sync Store - Manages Nostr annotation sync state
 * 
 * Provides:
 * - Sync status (idle, syncing, error)
 * - Last sync timestamp
 * - Sync statistics
 * - Manual sync trigger
 */

import { browser } from '$app/environment';
import { fetchAnnotations, type CyphertapPublisher } from '$lib/services/nostrService';
import type { Annotation } from '$lib/types';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface SyncStats {
	lastSyncAt: number | null;
	fetchedCount: number;
	mergedCount: number;
	conflictCount: number;
}

const STORAGE_KEY = 'sveltereader-sync';

function loadSyncStats(): SyncStats {
	if (!browser) return { lastSyncAt: null, fetchedCount: 0, mergedCount: 0, conflictCount: 0 };
	
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			return JSON.parse(stored);
		}
	} catch (e) {
		console.error('[Sync] Failed to load sync stats:', e);
	}
	return { lastSyncAt: null, fetchedCount: 0, mergedCount: 0, conflictCount: 0 };
}

function saveSyncStats(stats: SyncStats): void {
	if (!browser) return;
	
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
	} catch (e) {
		console.error('[Sync] Failed to save sync stats:', e);
	}
}

function createSyncStore() {
	let status = $state<SyncStatus>('idle');
	let error = $state<string | null>(null);
	let stats = $state<SyncStats>(loadSyncStats());
	let cyphertapInstance: CyphertapPublisher | null = null;
	
	// Callback to merge fetched annotations into local store
	let mergeCallback: ((annotations: Annotation[]) => Promise<{ merged: number; conflicts: number }>) | null = null;

	function setCyphertap(cyphertap: CyphertapPublisher | null): void {
		cyphertapInstance = cyphertap;
	}

	function setMergeCallback(callback: (annotations: Annotation[]) => Promise<{ merged: number; conflicts: number }>): void {
		mergeCallback = callback;
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
			const result = await fetchAnnotations(cyphertapInstance);
			
			if (!result.success) {
				throw new Error(result.error || 'Fetch failed');
			}

			console.log(`[Sync] Fetched ${result.annotations.length} annotations from Nostr`);

			let merged = 0;
			let conflicts = 0;

			if (mergeCallback && result.annotations.length > 0) {
				const mergeResult = await mergeCallback(result.annotations);
				merged = mergeResult.merged;
				conflicts = mergeResult.conflicts;
				console.log(`[Sync] Merged: ${merged}, Conflicts: ${conflicts}`);
			}

			stats = {
				lastSyncAt: Date.now(),
				fetchedCount: result.annotations.length,
				mergedCount: merged,
				conflictCount: conflicts,
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
		stats = { lastSyncAt: null, fetchedCount: 0, mergedCount: 0, conflictCount: 0 };
		saveSyncStats(stats);
	}

	return {
		get status() { return status; },
		get error() { return error; },
		get stats() { return stats; },
		get isLoggedIn() { return cyphertapInstance?.isLoggedIn ?? false; },
		
		setCyphertap,
		setMergeCallback,
		sync,
		reset,
	};
}

export const syncStore = createSyncStore();

export function useSyncStore() {
	return syncStore;
}
