/**
 * Web Search History Store - Persists chat threads for the web search feature
 * 
 * Stores threads with their messages, sources, and metadata to localStorage.
 * Supports CRUD operations and provides reactive state for the UI.
 */

import { browser } from '$app/environment';

const STORAGE_KEY = 'sveltereader-websearch-history';
const MAX_THREADS = 100; // Maximum number of threads to store

// =============================================================================
// TYPES
// =============================================================================

export interface LangGraphMessage {
	type: 'human' | 'ai' | 'tool';
	content: string | unknown[];
	id?: string;
	name?: string;
	tool_call_id?: string;
	tool_calls?: Array<{ id: string; name: string; args?: Record<string, unknown> }>;
}

export interface SearchSource {
	index: number;
	title: string;
	url: string;
	snippet?: string;
}

export interface ChatThread {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	messages: LangGraphMessage[];
	sources: SearchSource[];
	suggestions?: string[];
}

interface WebSearchHistory {
	threads: ChatThread[];
}

// =============================================================================
// HELPERS
// =============================================================================

function loadHistory(): WebSearchHistory {
	if (!browser) return { threads: [] };
	
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			return { threads: parsed.threads || [] };
		}
	} catch (e) {
		console.error('[WebSearchHistory] Failed to load history:', e);
	}
	return { threads: [] };
}

function saveHistory(history: WebSearchHistory): void {
	if (!browser) return;
	
	try {
		// Keep only the most recent threads
		const trimmedHistory = {
			threads: history.threads.slice(0, MAX_THREADS)
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedHistory));
	} catch (e) {
		console.error('[WebSearchHistory] Failed to save history:', e);
	}
}

function generateTitle(messages: LangGraphMessage[]): string {
	// Find the first human message for the title
	const firstHuman = messages.find(m => m.type === 'human');
	if (!firstHuman) return 'New Search';
	
	const content = typeof firstHuman.content === 'string' 
		? firstHuman.content 
		: (firstHuman.content as Array<{ text?: string }>)
			.filter(c => c && typeof c === 'object' && 'text' in c)
			.map(c => c.text)
			.join(' ');
	
	// Truncate to reasonable length
	const maxLength = 60;
	if (content.length <= maxLength) return content;
	return content.slice(0, maxLength).trim() + '...';
}

// =============================================================================
// STORE
// =============================================================================

function createWebSearchHistoryStore() {
	let initialized = false;
	let history = $state<WebSearchHistory>({ threads: [] });

	function initialize(): void {
		if (initialized || !browser) return;
		history = loadHistory();
		initialized = true;
	}

	/**
	 * Create or update a thread
	 */
	function saveThread(
		threadId: string,
		messages: LangGraphMessage[],
		sources?: SearchSource[],
		suggestions?: string[]
	): ChatThread {
		const now = new Date().toISOString();
		
		// Find existing thread or create new
		const existingIndex = history.threads.findIndex(t => t.id === threadId);
		
		const thread: ChatThread = {
			id: threadId,
			title: generateTitle(messages),
			createdAt: existingIndex >= 0 ? history.threads[existingIndex].createdAt : now,
			updatedAt: now,
			messages: [...messages], // Clone to avoid reference issues
			sources: sources ? [...sources] : (existingIndex >= 0 ? history.threads[existingIndex].sources : []),
			suggestions: suggestions ? [...suggestions] : (existingIndex >= 0 ? history.threads[existingIndex].suggestions : undefined),
		};
		
		if (existingIndex >= 0) {
			// Update existing thread - create new array to trigger reactivity
			const newThreads = [...history.threads];
			newThreads[existingIndex] = thread;
			history.threads = newThreads;
		} else {
			// Add new thread at the beginning
			history.threads = [thread, ...history.threads];
		}
		
		saveHistory(history);
		return thread;
	}

	/**
	 * Get a thread by ID
	 */
	function getThread(threadId: string): ChatThread | undefined {
		return history.threads.find(t => t.id === threadId);
	}

	/**
	 * Delete a thread
	 */
	function deleteThread(threadId: string): void {
		history.threads = history.threads.filter(t => t.id !== threadId);
		saveHistory(history);
	}

	/**
	 * Update thread suggestions
	 */
	function updateSuggestions(threadId: string, suggestions: string[]): void {
		const thread = history.threads.find(t => t.id === threadId);
		if (thread) {
			thread.suggestions = suggestions;
			thread.updatedAt = new Date().toISOString();
			saveHistory(history);
		}
	}

	/**
	 * Update thread sources
	 */
	function updateSources(threadId: string, sources: SearchSource[]): void {
		const thread = history.threads.find(t => t.id === threadId);
		if (thread) {
			thread.sources = sources;
			thread.updatedAt = new Date().toISOString();
			saveHistory(history);
		}
	}

	/**
	 * Clear all history
	 */
	function clearAll(): void {
		history.threads = [];
		saveHistory(history);
	}

	// Auto-initialize on first access in browser
	if (browser) {
		initialize();
	}

	return {
		// State
		get threads() { return history.threads; },
		get recentThreads() { return history.threads.slice(0, 10); },
		get hasHistory() { return history.threads.length > 0; },
		
		// Methods
		initialize,
		saveThread,
		getThread,
		deleteThread,
		updateSuggestions,
		updateSources,
		clearAll,
	};
}

export const webSearchHistoryStore = createWebSearchHistoryStore();

export function useWebSearchHistoryStore() {
	return webSearchHistoryStore;
}

