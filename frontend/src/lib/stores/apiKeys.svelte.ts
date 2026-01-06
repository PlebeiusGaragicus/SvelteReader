/**
 * API Keys Store - User-provided API keys storage
 * 
 * Stores API keys in localStorage, scoped to the user's npub when logged in.
 * Keys are passed to agents at runtime for external service authentication.
 */

import { browser } from '$app/environment';

// =============================================================================
// TYPES
// =============================================================================

export interface ApiKeys {
	openai?: string;
	anthropic?: string;
	tavily?: string;
	langsmith?: string;
	google?: string;
	// Add more as needed
	[key: string]: string | undefined;
}

export interface ApiKeyConfig {
	key: keyof ApiKeys;
	label: string;
	description: string;
	placeholder: string;
	required?: boolean;
}

// =============================================================================
// AVAILABLE API KEYS
// =============================================================================

export const API_KEY_CONFIGS: ApiKeyConfig[] = [
	{
		key: 'openai',
		label: 'OpenAI API Key',
		description: 'Required for GPT models',
		placeholder: 'sk-...',
	},
	{
		key: 'anthropic',
		label: 'Anthropic API Key',
		description: 'Required for Claude models',
		placeholder: 'sk-ant-...',
	},
	{
		key: 'tavily',
		label: 'Tavily API Key',
		description: 'Required for Tavily web search',
		placeholder: 'tvly-...',
	},
	{
		key: 'google',
		label: 'Google API Key',
		description: 'Required for Google search and Gemini models',
		placeholder: 'AIza...',
	},
	{
		key: 'langsmith',
		label: 'LangSmith API Key',
		description: 'Optional for tracing and monitoring',
		placeholder: 'lsv2_...',
	},
];

// =============================================================================
// STORAGE
// =============================================================================

const STORAGE_KEY_PREFIX = 'sveltereader-apikeys';

function getStorageKey(npub?: string): string {
	if (npub) {
		return `${STORAGE_KEY_PREFIX}-${npub}`;
	}
	return `${STORAGE_KEY_PREFIX}-anonymous`;
}

function loadApiKeys(npub?: string): ApiKeys {
	if (!browser) return {};
	try {
		const stored = localStorage.getItem(getStorageKey(npub));
		return stored ? JSON.parse(stored) : {};
	} catch {
		return {};
	}
}

function saveApiKeys(keys: ApiKeys, npub?: string): void {
	if (!browser) return;
	try {
		localStorage.setItem(getStorageKey(npub), JSON.stringify(keys));
	} catch (e) {
		console.error('Failed to save API keys:', e);
	}
}

// =============================================================================
// STORE
// =============================================================================

function createApiKeysStore() {
	// State
	let apiKeys = $state<ApiKeys>({});
	let npub = $state<string | undefined>(undefined);
	let initialized = $state(false);

	// Derived - check if any keys are set
	const hasAnyKeys = $derived(
		Object.values(apiKeys).some(v => v && v.trim().length > 0)
	);

	// Check if a specific key is set
	function hasKey(key: keyof ApiKeys): boolean {
		const value = apiKeys[key];
		return !!value && value.trim().length > 0;
	}

	// Initialize with optional npub scope
	function initialize(userNpub?: string): void {
		if (!browser) return;
		
		npub = userNpub;
		apiKeys = loadApiKeys(userNpub);
		initialized = true;
	}

	// Update npub scope (when user logs in/out)
	function setNpub(userNpub?: string): void {
		if (npub === userNpub) return;
		
		npub = userNpub;
		apiKeys = loadApiKeys(userNpub);
	}

	// Set a single API key
	function setKey(key: keyof ApiKeys, value: string): void {
		apiKeys = {
			...apiKeys,
			[key]: value.trim() || undefined,
		};
		saveApiKeys(apiKeys, npub);
	}

	// Set multiple API keys
	function setKeys(keys: Partial<ApiKeys>): void {
		const cleanedKeys: ApiKeys = {};
		for (const [k, v] of Object.entries(keys)) {
			if (v && v.trim().length > 0) {
				cleanedKeys[k] = v.trim();
			}
		}
		
		apiKeys = {
			...apiKeys,
			...cleanedKeys,
		};
		saveApiKeys(apiKeys, npub);
	}

	// Remove a single API key
	function removeKey(key: keyof ApiKeys): void {
		const { [key]: _, ...rest } = apiKeys;
		apiKeys = rest;
		saveApiKeys(apiKeys, npub);
	}

	// Clear all API keys
	function clearAll(): void {
		apiKeys = {};
		saveApiKeys(apiKeys, npub);
	}

	// Get all keys as a plain object (for passing to agents)
	function getKeysForAgent(): Record<string, string> {
		const result: Record<string, string> = {};
		for (const [key, value] of Object.entries(apiKeys)) {
			if (value && value.trim().length > 0) {
				result[key] = value;
			}
		}
		return result;
	}

	// Auto-initialize in browser (anonymous mode)
	if (browser) {
		initialize();
	}

	return {
		// State getters
		get apiKeys() { return apiKeys; },
		get hasAnyKeys() { return hasAnyKeys; },
		get initialized() { return initialized; },
		get npub() { return npub; },
		
		// Methods
		initialize,
		setNpub,
		hasKey,
		setKey,
		setKeys,
		removeKey,
		clearAll,
		getKeysForAgent,
	};
}

export const apiKeysStore = createApiKeysStore();

