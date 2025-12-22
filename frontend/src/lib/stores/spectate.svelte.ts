/**
 * Spectate Store - View another user's library by their npub
 * 
 * This store manages the "spectate mode" where users can view
 * another Nostr user's books and annotations in read-only mode.
 */

import { browser } from '$app/environment';

// Nostr profile information (kind 0)
export interface NostrProfile {
	name?: string;
	displayName?: string;
	picture?: string;
	about?: string;
	nip05?: string;
}

// Spectate target information
export interface SpectateTarget {
	pubkey: string;        // hex pubkey
	npub: string;          // bech32 npub for display
	profile?: NostrProfile;
	relays: string[];      // relays to fetch from
	lastSynced?: number;   // timestamp of last sync
}

// History entry for previously spectated users
export interface SpectateHistoryEntry {
	pubkey: string;
	npub: string;
	profile?: NostrProfile;
	relays: string[];
	lastSynced?: number;
}

// Reactive state using Svelte 5 runes
let isSpectating = $state(false);
let target = $state<SpectateTarget | null>(null);
let history = $state<SpectateHistoryEntry[]>([]);

// LocalStorage key for persisting spectate state
const STORAGE_KEY = 'sveltereader-spectate';
const HISTORY_KEY = 'sveltereader-spectate-history';

// Load persisted state on init
function loadPersistedState(): void {
	if (!browser) return;
	
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			isSpectating = parsed.isSpectating ?? false;
			target = parsed.target ?? null;
		}
		
		const storedHistory = localStorage.getItem(HISTORY_KEY);
		if (storedHistory) {
			history = JSON.parse(storedHistory) ?? [];
		}
	} catch (e) {
		console.warn('[Spectate] Failed to load persisted state:', e);
	}
}

// Persist state to localStorage
function persistState(): void {
	if (!browser) return;
	
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({
			isSpectating,
			target
		}));
	} catch (e) {
		console.warn('[Spectate] Failed to persist state:', e);
	}
}

// Persist history to localStorage
function persistHistory(): void {
	if (!browser) return;
	
	try {
		localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
	} catch (e) {
		console.warn('[Spectate] Failed to persist history:', e);
	}
}

// Start spectating a user
function startSpectating(pubkey: string, npub: string, relays: string[]): void {
	console.log(`[Spectate] Starting to spectate ${npub.slice(0, 12)}...`);
	target = {
		pubkey,
		npub,
		relays,
		lastSynced: undefined
	};
	isSpectating = true;
	persistState();
	
	// Add to history (or update existing entry)
	addToHistory({ pubkey, npub, relays });
}

// Add or update an entry in history
function addToHistory(entry: Omit<SpectateHistoryEntry, 'lastSynced'>): void {
	const existingIndex = history.findIndex(h => h.pubkey === entry.pubkey);
	if (existingIndex >= 0) {
		// Update existing entry, move to front
		const existing = history[existingIndex];
		history = [
			{ ...existing, ...entry },
			...history.slice(0, existingIndex),
			...history.slice(existingIndex + 1)
		];
	} else {
		// Add new entry at front, limit to 10 entries
		history = [{ ...entry }, ...history].slice(0, 10);
	}
	persistHistory();
}

// Helper: Update a history entry by pubkey
function updateHistoryEntry(pubkey: string, updates: Partial<SpectateHistoryEntry>): void {
	const index = history.findIndex(h => h.pubkey === pubkey);
	if (index >= 0) {
		history = [
			...history.slice(0, index),
			{ ...history[index], ...updates },
			...history.slice(index + 1)
		];
		persistHistory();
		
		// Also update current target if it matches
		if (target?.pubkey === pubkey) {
			target = { ...target, ...updates };
			persistState();
		}
	}
}

// Update relays for a history entry
function updateHistoryRelays(pubkey: string, relays: string[]): void {
	updateHistoryEntry(pubkey, { relays });
}

// Remove an entry from history
function removeFromHistory(pubkey: string): void {
	history = history.filter(h => h.pubkey !== pubkey);
	persistHistory();
}

// Stop spectating and return to own library
function stopSpectating(): void {
	console.log('[Spectate] Stopping spectate mode');
	isSpectating = false;
	target = null;
	persistState();
}

// Update profile information for current target
function setProfile(profile: NostrProfile): void {
	if (target) {
		target = { ...target, profile };
		persistState();
	}
}

// Update last synced timestamp
function setLastSynced(timestamp: number): void {
	if (target) {
		target = { ...target, lastSynced: timestamp };
		persistState();
	}
}

// Get the pubkey to use for data queries (spectate target or null)
function getActivePubkey(): string | null {
	return isSpectating && target ? target.pubkey : null;
}

// Initialize on module load
if (browser) {
	loadPersistedState();
}

// Update profile in history
function updateHistoryProfile(pubkey: string, profile: NostrProfile): void {
	updateHistoryEntry(pubkey, { profile });
}

// Update lastSynced in history
function updateHistoryLastSynced(pubkey: string, lastSynced: number): void {
	updateHistoryEntry(pubkey, { lastSynced });
}

// Export reactive getters and actions
export const spectateStore = {
	get isSpectating() { return isSpectating; },
	get target() { return target; },
	get history() { return history; },
	
	startSpectating,
	stopSpectating,
	setProfile,
	setLastSynced,
	addToHistory,
	updateHistoryRelays,
	updateHistoryProfile,
	updateHistoryLastSynced,
	removeFromHistory,
	getActivePubkey
};
