/**
 * Deep Research History Store - Persists research threads with messages and findings
 * 
 * Stores threads with their messages, sources, research brief, and metadata to localStorage.
 * Supports CRUD operations and provides reactive state for the UI.
 * 
 * Renamed from webSearchHistory to deepResearchHistory.
 */

import { browser } from '$app/environment';

const STORAGE_KEY = 'sveltereader-deepresearch-history';
const LEGACY_STORAGE_KEY = 'sveltereader-websearch-history';
const MAX_THREADS = 100;

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

export interface ResearchThread {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	messages: LangGraphMessage[];
	sources: SearchSource[];
	suggestions?: string[];
	// New fields for deep research
	researchBrief?: string;
	researchPhase?: 'clarifying' | 'planning' | 'researching' | 'synthesizing' | 'complete';
	finalReport?: string;
}

// Legacy alias
export type ChatThread = ResearchThread;

interface DeepResearchHistory {
	threads: ResearchThread[];
}

// =============================================================================
// HELPERS
// =============================================================================

function loadHistory(): DeepResearchHistory {
	if (!browser) return { threads: [] };
	
	try {
		// Try new storage key first
		let stored = localStorage.getItem(STORAGE_KEY);
		
		// If not found, migrate from legacy key
		if (!stored) {
			stored = localStorage.getItem(LEGACY_STORAGE_KEY);
			if (stored) {
				// Migrate to new key
				localStorage.setItem(STORAGE_KEY, stored);
				localStorage.removeItem(LEGACY_STORAGE_KEY);
				console.log('[DeepResearchHistory] Migrated from legacy storage key');
			}
		}
		
		if (stored) {
			const parsed = JSON.parse(stored);
			return { threads: parsed.threads || [] };
		}
	} catch (e) {
		console.error('[DeepResearchHistory] Failed to load history:', e);
	}
	return { threads: [] };
}

function saveHistory(history: DeepResearchHistory): void {
	if (!browser) return;
	
	try {
		const trimmedHistory = {
			threads: history.threads.slice(0, MAX_THREADS)
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedHistory));
	} catch (e) {
		console.error('[DeepResearchHistory] Failed to save history:', e);
	}
}

function generateTitle(messages: LangGraphMessage[]): string {
	const firstHuman = messages.find(m => m.type === 'human');
	if (!firstHuman) return 'New Research';
	
	const content = typeof firstHuman.content === 'string' 
		? firstHuman.content 
		: (firstHuman.content as Array<{ text?: string }>)
			.filter(c => c && typeof c === 'object' && 'text' in c)
			.map(c => c.text)
			.join(' ');
	
	const maxLength = 60;
	if (content.length <= maxLength) return content;
	return content.slice(0, maxLength).trim() + '...';
}

// =============================================================================
// STORE
// =============================================================================

function createDeepResearchHistoryStore() {
	let initialized = false;
	let history = $state<DeepResearchHistory>({ threads: [] });

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
		suggestions?: string[],
		researchBrief?: string,
		researchPhase?: ResearchThread['researchPhase'],
	): ResearchThread {
		const now = new Date().toISOString();
		
		const existingIndex = history.threads.findIndex(t => t.id === threadId);
		
		const thread: ResearchThread = {
			id: threadId,
			title: generateTitle(messages),
			createdAt: existingIndex >= 0 ? history.threads[existingIndex].createdAt : now,
			updatedAt: now,
			messages: [...messages],
			sources: sources ? [...sources] : (existingIndex >= 0 ? history.threads[existingIndex].sources : []),
			suggestions: suggestions ? [...suggestions] : (existingIndex >= 0 ? history.threads[existingIndex].suggestions : undefined),
			researchBrief: researchBrief ?? (existingIndex >= 0 ? history.threads[existingIndex].researchBrief : undefined),
			researchPhase: researchPhase ?? (existingIndex >= 0 ? history.threads[existingIndex].researchPhase : undefined),
		};
		
		if (existingIndex >= 0) {
			const newThreads = [...history.threads];
			newThreads[existingIndex] = thread;
			history.threads = newThreads;
		} else {
			history.threads = [thread, ...history.threads];
		}
		
		saveHistory(history);
		return thread;
	}

	/**
	 * Get a thread by ID
	 */
	function getThread(threadId: string): ResearchThread | undefined {
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
	 * Update research phase
	 */
	function updateResearchPhase(threadId: string, phase: ResearchThread['researchPhase']): void {
		const thread = history.threads.find(t => t.id === threadId);
		if (thread) {
			thread.researchPhase = phase;
			thread.updatedAt = new Date().toISOString();
			saveHistory(history);
		}
	}

	/**
	 * Update research brief
	 */
	function updateResearchBrief(threadId: string, brief: string): void {
		const thread = history.threads.find(t => t.id === threadId);
		if (thread) {
			thread.researchBrief = brief;
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
		updateResearchPhase,
		updateResearchBrief,
		clearAll,
	};
}

export const deepResearchHistoryStore = createDeepResearchHistoryStore();

// Legacy alias for backward compatibility
export const webSearchHistoryStore = deepResearchHistoryStore;

export function useDeepResearchHistoryStore() {
	return deepResearchHistoryStore;
}

// Legacy alias
export function useWebSearchHistoryStore() {
	return deepResearchHistoryStore;
}
