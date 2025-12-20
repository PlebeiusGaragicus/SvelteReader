/**
 * LangGraph Service - SDK wrapper for Svelte
 * 
 * Provides a clean interface to the LangGraph SDK for use in Svelte components.
 * Handles streaming, thread management, and payment token injection.
 */

import { Client } from '@langchain/langgraph-sdk';
import type { Message, Thread } from '@langchain/langgraph-sdk';
import type { PaymentInfo, PassageContext } from '$lib/types/chat';

let clientInstance: Client | null = null;

export function getClient(apiUrl?: string): Client {
	const url = apiUrl || import.meta.env.VITE_LANGGRAPH_API_URL || 'http://localhost:2024';
	
	if (!clientInstance || (apiUrl && clientInstance)) {
		clientInstance = new Client({ apiUrl: url });
	}
	
	return clientInstance;
}

export interface StreamCallbacks {
	onToken?: (token: string) => void;
	onMessage?: (message: Message) => void;
	onComplete?: (messages: Message[], refund?: boolean) => void;
	onError?: (error: Error) => void;
	onThreadId?: (threadId: string) => void;
	onRefund?: () => void;  // Called when agent signals refund is needed
}

export interface SubmitOptions {
	threadId?: string | null;
	assistantId?: string;
	context?: PassageContext;
	payment?: PaymentInfo;
	streamMode?: ('values' | 'messages' | 'updates')[];
}

/**
 * Submit a message to the LangGraph agent with streaming support.
 */
export async function submitMessage(
	content: string,
	options: SubmitOptions,
	callbacks: StreamCallbacks
): Promise<{ threadId: string; messages: Message[] }> {
	const client = getClient();
	const assistantId = options.assistantId || import.meta.env.VITE_LANGGRAPH_ASSISTANT_ID || 'agent';
	
	let threadId = options.threadId;
	
	// Create thread if needed
	if (!threadId) {
		const thread = await client.threads.create();
		threadId = thread.thread_id;
		callbacks.onThreadId?.(threadId);
	}
	
	// Build the human message
	const humanMessage: Message = {
		type: 'human',
		content: content,
	};
	
	// Build input with optional context and payment
	const input: Record<string, unknown> = {
		messages: [humanMessage],
	};
	
	if (options.context) {
		// Agent expects passage_context with snake_case keys
		input.passage_context = {
			text: options.context.text,
			note: options.context.note,
			book_title: options.context.bookTitle,
			chapter: options.context.chapter,
		};
	}
	
	if (options.payment) {
		input.payment = options.payment;
	}
	
	const messages: Message[] = [];
	let currentContent = '';
	let shouldRefund = false;
	
	try {
		// Stream the response
		const stream = client.runs.stream(threadId, assistantId, {
			input,
			streamMode: options.streamMode || ['values'],
		});
		
		for await (const event of stream) {
			console.log('[LangGraph] Stream event:', event.event, 'data keys:', Object.keys(event.data || {}));
			
			if (event.event === 'values') {
				const data = event.data as { messages?: Message[]; refund?: boolean };
				
				// Debug: log the refund value
				console.log('[LangGraph] Values event - refund:', data.refund, 'type:', typeof data.refund);
				
				// Check for refund flag from agent
				if (data.refund === true) {
					console.log('[LangGraph] Agent signaled refund needed');
					shouldRefund = true;
				}
				
				if (data.messages) {
					messages.length = 0;
					messages.push(...data.messages);
					
					// Get the latest AI message for streaming
					const lastMessage = messages[messages.length - 1];
					if (lastMessage?.type === 'ai') {
						const newContent = typeof lastMessage.content === 'string' 
							? lastMessage.content 
							: '';
						
						// Emit new tokens
						if (newContent.length > currentContent.length) {
							const newTokens = newContent.slice(currentContent.length);
							callbacks.onToken?.(newTokens);
							currentContent = newContent;
						}
						
						callbacks.onMessage?.(lastMessage);
					}
				}
			}
		}
		
		// Signal refund if needed
		console.log('[LangGraph] Stream complete - shouldRefund:', shouldRefund);
		if (shouldRefund) {
			callbacks.onRefund?.();
		}
		
		callbacks.onComplete?.(messages, shouldRefund);
		
		return { threadId, messages, refund: shouldRefund };
	} catch (error) {
		callbacks.onError?.(error as Error);
		throw error;
	}
}

/**
 * Get all threads for the current user.
 */
export async function getThreads(): Promise<Thread[]> {
	const client = getClient();
	// SDK uses search() not list()
	const threads = await client.threads.search(); // TODO: add filtering
	return threads;
}

/**
 * Get a specific thread by ID.
 */
export async function getThread(threadId: string): Promise<Thread> {
	const client = getClient();
	return await client.threads.get(threadId);
}

/**
 * Get the message history for a thread.
 */
export async function getThreadMessages(threadId: string): Promise<Message[]> {
	const client = getClient();
	const state = await client.threads.getState(threadId);
	return (state.values as { messages?: Message[] })?.messages || [];
}

/**
 * Delete a thread.
 */
export async function deleteThread(threadId: string): Promise<void> {
	const client = getClient();
	await client.threads.delete(threadId);
}

/**
 * Create a new thread.
 */
export async function createThread(metadata?: Record<string, unknown>): Promise<Thread> {
	const client = getClient();
	return await client.threads.create({ metadata });
}

/**
 * Check if the LangGraph server is available.
 */
export async function checkHealth(): Promise<boolean> {
	try {
		const url = import.meta.env.VITE_LANGGRAPH_API_URL || 'http://localhost:2024';
		// Use a simple fetch to /ok endpoint which is the standard LangGraph health check
		const response = await fetch(`${url}/ok`, {
			method: 'GET',
			headers: { 'Accept': 'application/json' },
		});
		return response.ok;
	} catch (error) {
		console.warn('LangGraph health check failed:', error);
		return false;
	}
}
