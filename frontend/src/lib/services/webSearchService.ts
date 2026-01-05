/**
 * Web Search Service - Handles web search and URL scraping
 * 
 * Calls the FastAPI backend which proxies to SearXNG and Firecrawl.
 * All requests go through the backend to avoid CORS issues.
 */

import { settingsStore } from '$lib/stores/settings.svelte';

// =============================================================================
// TYPES
// =============================================================================

export interface SearchResult {
	title: string;
	url: string;
	content?: string;
	thumbnail?: string;
	author?: string;
}

export interface SearchResponse {
	results: SearchResult[];
	suggestions: string[];
}

export interface SearchOptions {
	engines?: string[];
	categories?: string[];
	language?: string;
	page?: number;
}

export interface ScrapeResult {
	url: string;
	title: string;
	content: string;
	metadata: {
		author?: string;
		publishedAt?: string;
		description?: string;
		siteName?: string;
	};
}

// =============================================================================
// SEARCH API
// =============================================================================

/**
 * Perform a web search via the backend
 */
export async function search(
	query: string,
	options: SearchOptions = {}
): Promise<SearchResponse> {
	const backendUrl = settingsStore.backendUrl;
	
	const response = await fetch(`${backendUrl}/api/search`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			query,
			engines: options.engines,
			categories: options.categories,
			language: options.language || 'en',
			page: options.page || 1,
		}),
	});
	
	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Search failed: ${error}`);
	}
	
	return response.json();
}

// =============================================================================
// SCRAPE API
// =============================================================================

/**
 * Scrape a URL via the backend (uses Firecrawl)
 */
export async function scrapeUrl(url: string): Promise<ScrapeResult> {
	const backendUrl = settingsStore.backendUrl;
	
	const response = await fetch(`${backendUrl}/api/scrape`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ url }),
	});
	
	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Scrape failed: ${error}`);
	}
	
	return response.json();
}

// =============================================================================
// AGENT CHAT
// =============================================================================

export interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
}

export interface ChatStreamEvent {
	type: 'token' | 'tool_call' | 'tool_result' | 'done' | 'error';
	content?: string;
	toolName?: string;
	toolArgs?: Record<string, any>;
	toolResult?: string;
	error?: string;
}

/**
 * Send a message to the Web Agent and stream the response
 */
export async function* streamAgentChat(
	messages: ChatMessage[],
	threadId?: string
): AsyncGenerator<ChatStreamEvent> {
	const agentUrl = settingsStore.agentUrl;
	
	// Format messages for LangGraph
	const formattedMessages = messages.map(m => ({
		type: m.role === 'user' ? 'human' : 'ai',
		content: m.content,
	}));
	
	const response = await fetch(`${agentUrl}/runs/stream`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			assistant_id: 'web_agent',
			input: {
				messages: formattedMessages,
				tool_call_count: 0,
			},
			config: {
				configurable: {
					thread_id: threadId || crypto.randomUUID(),
				},
			},
			stream_mode: 'messages',
		}),
	});
	
	if (!response.ok) {
		yield { type: 'error', error: `Agent request failed: ${response.status}` };
		return;
	}
	
	if (!response.body) {
		yield { type: 'error', error: 'No response body' };
		return;
	}
	
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			
			buffer += decoder.decode(value, { stream: true });
			
			// Process complete SSE events
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';
			
			for (const line of lines) {
				if (line.startsWith('data: ')) {
					const data = line.slice(6);
					if (data === '[DONE]') {
						yield { type: 'done' };
						continue;
					}
					
					try {
						const parsed = JSON.parse(data);
						
						// Handle different event types from LangGraph
						if (parsed.type === 'ai' && parsed.content) {
							yield { type: 'token', content: parsed.content };
						} else if (parsed.tool_calls) {
							for (const tc of parsed.tool_calls) {
								yield {
									type: 'tool_call',
									toolName: tc.name,
									toolArgs: tc.args,
								};
							}
						}
					} catch {
						// Skip malformed JSON
					}
				}
			}
		}
		
		yield { type: 'done' };
	} finally {
		reader.releaseLock();
	}
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * Check if the backend is available
 */
export async function checkBackendHealth(): Promise<boolean> {
	try {
		const backendUrl = settingsStore.backendUrl;
		const response = await fetch(`${backendUrl}/health`, {
			method: 'GET',
			signal: AbortSignal.timeout(5000),
		});
		return response.ok;
	} catch {
		return false;
	}
}

/**
 * Check if the agent is available
 */
export async function checkAgentHealth(): Promise<boolean> {
	try {
		const agentUrl = settingsStore.agentUrl;
		const response = await fetch(`${agentUrl}/ok`, {
			method: 'GET',
			signal: AbortSignal.timeout(5000),
		});
		return response.ok;
	} catch {
		return false;
	}
}

