/**
 * LangGraph Service - SDK wrapper for Svelte
 * 
 * Provides a clean interface to the LangGraph SDK for use in Svelte components.
 * Handles streaming, thread management, payment token injection, and tool interrupts.
 * 
 * Architecture: Agent-Driven RAG with Client-Side Tool Execution
 * - Agent decides when to search/retrieve from the book
 * - Graph interrupts before tool execution
 * - Client executes tools locally (EPUB access, vector search)
 * - Client resumes graph with tool results
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

// =============================================================================
// TYPES
// =============================================================================

export interface ToolCall {
	id: string;
	name: string;
	args: Record<string, unknown>;
}

export interface ToolResult {
	id: string;
	result: unknown;
	error?: string;
}

export interface StreamCallbacks {
	onToken?: (token: string) => void;
	onMessage?: (message: Message) => void;
	onMessagesSync?: (messages: Message[]) => void;  // Sync full message state from server
	onComplete?: (messages: Message[], refund?: boolean) => void;
	onError?: (error: Error) => void;
	onThreadId?: (threadId: string) => void;
	onRefund?: () => void;
	// New callbacks for tool handling
	onToolCall?: (toolCalls: ToolCall[]) => void;
	onToolExecuting?: (toolCalls: ToolCall[]) => void;
	onToolComplete?: (results: ToolResult[]) => void;
}

export interface SubmitOptions {
	threadId?: string | null;
	assistantId?: string;
	context?: PassageContext;
	payment?: PaymentInfo;
	bookId?: string;  // Required for tool execution
	bookContext?: string;  // Pre-formatted book context (TOC, metadata) for agent
	streamMode?: ('values' | 'messages' | 'updates')[];
	maxToolIterations?: number;  // Prevent infinite loops (default: 10)
}

// Tool executor function type - injected by the caller
export type ToolExecutor = (toolCall: ToolCall, bookId: string) => Promise<ToolResult>;

// Default no-op executor (for when tools aren't needed)
const defaultToolExecutor: ToolExecutor = async (toolCall) => ({
	id: toolCall.id,
	result: null,
	error: `Tool executor not configured for: ${toolCall.name}`
});

// Global tool executor - set by the chat component
let globalToolExecutor: ToolExecutor = defaultToolExecutor;

export function setToolExecutor(executor: ToolExecutor): void {
	globalToolExecutor = executor;
}

// =============================================================================
// MAIN SUBMIT FUNCTION WITH INTERRUPT HANDLING
// =============================================================================

/**
 * Submit a message to the LangGraph agent with streaming and interrupt support.
 * 
 * Flow:
 * 1. Send message to agent
 * 2. Stream response tokens
 * 3. If agent calls tools -> interrupt
 * 4. Execute tools locally via toolExecutor
 * 5. Resume agent with tool results
 * 6. Repeat until no more tool calls
 */
export async function submitMessage(
	content: string,
	options: SubmitOptions,
	callbacks: StreamCallbacks
): Promise<{ threadId: string; messages: Message[] }> {
	const client = getClient();
	const assistantId = options.assistantId || import.meta.env.VITE_LANGGRAPH_ASSISTANT_ID || 'agent';
	// Lower max iterations to prevent runaway tool loops (was 10, now 5)
	// Agent prompt now instructs to limit to 3 tool calls for simple requests
	const maxIterations = options.maxToolIterations ?? 5;
	
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
	
	if (options.bookId) {
		input.book_id = options.bookId;
	}
	
	// Include book context (TOC, metadata) so agent knows how to use tools
	if (options.bookContext) {
		input.book_context = options.bookContext;
	}
	
	const messages: Message[] = [];
	let currentContent = '';
	let shouldRefund = false;
	let iteration = 0;
	
	// Input for the current iteration (null means resume from interrupt)
	let currentInput: Record<string, unknown> | null = input;
	
	try {
		// Loop to handle multiple tool call iterations
		while (iteration < maxIterations) {
			iteration++;
			console.log(`[LangGraph] ================================================`);
			console.log(`[LangGraph] Iteration ${iteration}/${maxIterations}`);
			console.log(`[LangGraph] Thread ID: ${threadId}`);
			console.log(`[LangGraph] ================================================`);
			
			let interrupted = false;
			let pendingToolCalls: ToolCall[] = [];
			
			console.log(`[LangGraph] Starting stream with input:`, currentInput === null ? 'null (resume)' : 'new message');
			
			// Stream the response with both messages (for streaming tokens) and values (for final state)
			const stream = client.runs.stream(threadId, assistantId, {
				input: currentInput,
				streamMode: options.streamMode || ['messages', 'values'],
			});
			
			for await (const event of stream) {
				// Don't log every event - too noisy. Log significant events only.
				
				// Handle streaming message chunks (incremental AI content)
				if (event.event === 'messages/partial') {
					// This gives us incremental content updates
					const chunks = event.data as Array<{ type: string; content?: string; tool_calls?: any[] }>;
					if (chunks && chunks.length > 0) {
						const lastChunk = chunks[chunks.length - 1];
						if (lastChunk?.type === 'ai' && lastChunk.content) {
							const newContent = lastChunk.content;
							if (newContent.length > currentContent.length) {
								const newTokens = newContent.slice(currentContent.length);
								callbacks.onToken?.(newTokens);
								currentContent = newContent;
							}
						}
						// Also detect tool calls early from streaming
						if (lastChunk?.type === 'ai' && lastChunk.tool_calls && lastChunk.tool_calls.length > 0) {
							const toolCalls = lastChunk.tool_calls.map((tc: any) => ({
								id: tc.id,
								name: tc.name,
								args: tc.args || {},
							}));
							callbacks.onToolCall?.(toolCalls);
						}
					}
				}
				
				// Handle complete message events  
				if (event.event === 'messages/complete') {
					const completeMessages = event.data as Message[];
					if (completeMessages && completeMessages.length > 0) {
						const lastMsg = completeMessages[completeMessages.length - 1];
						if (lastMsg) {
							callbacks.onMessage?.(lastMsg);
						}
					}
				}
				
				// Handle values events (full state snapshots)
				if (event.event === 'values') {
					const data = event.data as { 
						messages?: Message[]; 
						refund?: boolean;
					};
					
					// Check for refund flag from agent
					if (data.refund === true) {
						console.log('[LangGraph] Agent signaled refund needed');
						shouldRefund = true;
					}
					
					if (data.messages) {
						messages.length = 0;
						messages.push(...data.messages);
						
						// Sync full message state to UI - this ensures proper message separation
						callbacks.onMessagesSync?.(messages);
						
						// Get the latest message
						const lastMessage = messages[messages.length - 1];
						
						// Check for tool calls (indicates interrupt)
						if (lastMessage?.type === 'ai' && (lastMessage as any).tool_calls?.length > 0) {
							pendingToolCalls = (lastMessage as any).tool_calls.map((tc: any) => ({
								id: tc.id,
								name: tc.name,
								args: tc.args || {},
							}));
							interrupted = true;
							console.log('[LangGraph] Tool calls detected:', pendingToolCalls.map(tc => tc.name));
							callbacks.onToolCall?.(pendingToolCalls);
						}
						
						// Reset content tracker for next iteration when we get new messages
						if (lastMessage?.type === 'ai') {
							currentContent = typeof lastMessage.content === 'string' ? lastMessage.content : '';
						}
					}
				}
			}
			
			console.log(`[LangGraph] Stream ended. Interrupted: ${interrupted}, Pending tools: ${pendingToolCalls.length}`);
			console.log(`[LangGraph] Current messages count: ${messages.length}`);
			if (messages.length > 0) {
				const lastMsg = messages[messages.length - 1];
				console.log(`[LangGraph] Last message type: ${lastMsg.type}`);
				if ((lastMsg as any).tool_calls) {
					console.log(`[LangGraph] Last message tool_calls: ${JSON.stringify((lastMsg as any).tool_calls.map((tc: any) => tc.name))}`);
				}
			}
			
			// If no interrupt, we're done
			if (!interrupted) {
				console.log('[LangGraph] No more tool calls, completing');
				break;
			}
			
			// Execute tools locally
			if (!options.bookId) {
				console.error('[LangGraph] Tool calls require bookId but none provided');
				break;
			}
			
			callbacks.onToolExecuting?.(pendingToolCalls);
			console.log('[LangGraph] Executing tools locally...');
			
			const toolResults = await Promise.all(
				pendingToolCalls.map(tc => globalToolExecutor(tc, options.bookId!))
			);
			
			callbacks.onToolComplete?.(toolResults);
			console.log('[LangGraph] Tool results:', toolResults.map(r => ({
				id: r.id,
				hasResult: r.result !== null,
				error: r.error
			})));
			
			// Build tool messages to send back
			const toolMessages = toolResults.map(r => ({
				type: 'tool' as const,
				tool_call_id: r.id,
				name: pendingToolCalls.find(tc => tc.id === r.id)?.name || 'unknown',
				content: r.error 
					? JSON.stringify({ error: r.error })
					: (typeof r.result === 'string' ? r.result : JSON.stringify(r.result)),
			}));
			
			console.log('[LangGraph] Tool messages to send:', JSON.stringify(toolMessages, null, 2));
			
			// Update thread state with tool results
			// Use asNode to specify these are tool outputs
			try {
				console.log('[LangGraph] Updating thread state with tool results...');
				console.log('[LangGraph] asNode: "tools"');
				const updateResult = await client.threads.updateState(threadId, {
					values: {
						messages: toolMessages,
					},
					asNode: 'tools',  // Specify we're providing output from the tools node
				});
				console.log('[LangGraph] Thread state updated successfully');
				console.log('[LangGraph] Update result:', JSON.stringify(updateResult, null, 2));
			} catch (updateError) {
				console.error('[LangGraph] Failed to update thread state:', updateError);
				console.error('[LangGraph] Error details:', JSON.stringify(updateError, Object.getOwnPropertyNames(updateError), 2));
				throw updateError;
			}
			
			// Resume with null input (continue from where we left off)
			currentInput = null;
			console.log('[LangGraph] ================================================');
			console.log('[LangGraph] Resuming graph execution with null input...');
			console.log('[LangGraph] ================================================');
		}
		
		if (iteration >= maxIterations) {
			console.warn(`[LangGraph] Reached max tool iterations (${maxIterations})`);
		}
		
		// Signal refund if needed
		if (shouldRefund) {
			callbacks.onRefund?.();
		}
		
		callbacks.onComplete?.(messages, shouldRefund);
		
		return { threadId, messages };
		
	} catch (error) {
		callbacks.onError?.(error as Error);
		throw error;
	}
}

// =============================================================================
// THREAD MANAGEMENT
// =============================================================================

/**
 * Get all threads for the current user.
 */
export async function getThreads(): Promise<Thread[]> {
	const client = getClient();
	const threads = await client.threads.search();
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
