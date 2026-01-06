/**
 * Deep Research LangGraph Service
 * 
 * Wraps @langchain/langgraph-sdk for Deep Research mode with proper HITL interrupt handling.
 * Provides streaming, clarification interrupts, and thread management.
 */

import { Client } from '@langchain/langgraph-sdk';
import type { Thread } from '@langchain/langgraph-sdk';
import { settingsStore } from '$lib/stores/settings.svelte';

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

export interface TodoItem {
	id?: string;
	content: string;
	status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

/**
 * Clarification interrupt from the agent's clarify_with_user node.
 */
export interface ClarificationInterrupt {
	type: 'clarification_request';
	tool: 'ask_user' | 'ask_choices';
	tool_call_id: string;
	question: string;
	options?: Array<{ id: string; label: string }>;
	allow_multiple?: boolean;
	allow_freeform?: boolean;
}

/**
 * Response to a clarification request.
 */
export interface ClarificationResponse {
	response?: string;
	selected?: string[];
	freeform?: string;
}

export interface StreamCallbacks {
	onToken?: (token: string) => void;
	onMessage?: (message: LangGraphMessage) => void;
	onMessagesSync?: (messages: LangGraphMessage[]) => void;
	onComplete?: (messages: LangGraphMessage[]) => void;
	onError?: (error: Error) => void;
	onThreadId?: (threadId: string) => void;
	onPhaseChange?: (phase: string) => void;
	onResearchBrief?: (brief: string) => void;
	onResearchIterations?: (count: number) => void;
	onTodosSync?: (todos: TodoItem[]) => void;
	onClarificationInterrupt?: (interrupt: ClarificationInterrupt, interruptId: string) => void;
}

export interface SubmitOptions {
	threadId?: string | null;
	payment?: {
		ecash_token: string;
		amount_sats: number;
		mint: string;
	};
}

// =============================================================================
// CLIENT MANAGEMENT
// =============================================================================

let clientInstance: Client | null = null;

export function getClient(): Client {
	const url = settingsStore.agentUrl;
	
	if (!clientInstance) {
		clientInstance = new Client({ apiUrl: url });
	}
	
	return clientInstance;
}

export function resetClient(): void {
	clientInstance = null;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Check if an interrupt value is a clarification request.
 */
export function isClarificationInterrupt(value: unknown): value is ClarificationInterrupt {
	if (!value || typeof value !== 'object') return false;
	const obj = value as Record<string, unknown>;
	return obj.type === 'clarification_request' && typeof obj.tool === 'string';
}

// =============================================================================
// STREAM PROCESSING
// =============================================================================

interface StreamContext {
	messages: LangGraphMessage[];
	currentContent: string;
}

/**
 * Check thread state for pending interrupts.
 */
async function checkForInterrupts(
	client: Client,
	threadId: string
): Promise<{ type: 'clarification' | null; value: unknown; id: string } | null> {
	try {
		const threadState = await client.threads.getState(threadId);
		const tasks = (threadState as { tasks?: Array<{ id?: string; interrupts?: Array<{ value?: unknown; id?: string }> }> }).tasks;
		
		if (!tasks || tasks.length === 0) return null;
		
		const task = tasks[0];
		const interrupts = task.interrupts;
		if (!interrupts || interrupts.length === 0) return null;
		
		const interruptData = interrupts[0];
		const interruptValue = interruptData.value;
		const interruptId = (interruptData as { id?: string }).id || task.id || '';
		
		if (isClarificationInterrupt(interruptValue)) {
			return { type: 'clarification', value: interruptValue, id: interruptId };
		}
		
		return null;
	} catch (error) {
		console.warn('[DeepResearch] Could not check thread state for interrupts:', error);
		return null;
	}
}

// =============================================================================
// MAIN SUBMIT FUNCTION
// =============================================================================

/**
 * Submit a message to the Deep Research agent with streaming and interrupt support.
 */
export async function submitMessage(
	content: string,
	options: SubmitOptions,
	callbacks: StreamCallbacks
): Promise<{ threadId: string; messages: LangGraphMessage[] }> {
	const client = getClient();
	const assistantId = 'deepresearch';
	
	let threadId = options.threadId;
	
	// Create thread if needed
	if (!threadId) {
		const thread = await client.threads.create();
		threadId = thread.thread_id;
		callbacks.onThreadId?.(threadId);
	}
	
	// Build human message
	const humanMessage: LangGraphMessage = {
		type: 'human',
		content: content,
	};
	
	// Build input
	const input: Record<string, unknown> = {
		messages: [humanMessage],
	};
	
	// Include payment if provided
	if (options.payment) {
		input.payment = options.payment;
	}
	
	const messages: LangGraphMessage[] = [];
	let currentContent = '';
	
	try {
		console.log(`[DeepResearch] Starting stream for thread: ${threadId}`);
		
		const stream = client.runs.stream(threadId, assistantId, {
			input,
			streamMode: ['messages', 'values'],
		});
		
		for await (const event of stream) {
			const eventType = event.event;
			
			// Handle streaming message chunks
			if (eventType === 'messages/partial') {
				const chunks = event.data as Array<{ type: string; content?: string; tool_calls?: unknown[] }>;
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
				}
			}
			
			// Handle complete messages
			if (eventType === 'messages/complete') {
				const completeMessages = event.data as LangGraphMessage[];
				if (completeMessages && completeMessages.length > 0) {
					const lastMsg = completeMessages[completeMessages.length - 1];
					if (lastMsg) {
						callbacks.onMessage?.(lastMsg);
					}
				}
			}
			
			// Handle values events (full state snapshots)
			if (eventType === 'values') {
				const data = event.data as {
					messages?: LangGraphMessage[];
					todos?: TodoItem[];
					research_phase?: string;
					research_brief?: string;
					research_iterations?: number;
					[key: string]: unknown;
				};
				
				if (data.messages) {
					messages.length = 0;
					messages.push(...data.messages);
					callbacks.onMessagesSync?.(messages);
					
					// Reset content tracker
					const lastMessage = messages[messages.length - 1];
					if (lastMessage?.type === 'ai') {
						currentContent = typeof lastMessage.content === 'string' ? lastMessage.content : '';
					}
				}
				
				// Extract phase
				if (data.research_phase) {
					callbacks.onPhaseChange?.(data.research_phase);
				}
				
				// Extract research brief
				if (data.research_brief) {
					callbacks.onResearchBrief?.(data.research_brief);
				}
				
				// Extract iterations
				if (typeof data.research_iterations === 'number') {
					callbacks.onResearchIterations?.(data.research_iterations);
				}
				
				// Extract todos
				if (data.todos && Array.isArray(data.todos)) {
					callbacks.onTodosSync?.(data.todos);
				}
			}
		}
		
		console.log('[DeepResearch] Stream ended, checking for interrupts...');
		
		// Check for pending interrupts
		const interrupt = await checkForInterrupts(client, threadId);
		if (interrupt) {
			if (interrupt.type === 'clarification') {
				console.log('[DeepResearch] Clarification interrupt detected');
				callbacks.onClarificationInterrupt?.(
					interrupt.value as ClarificationInterrupt,
					interrupt.id
				);
				return { threadId, messages };
			}
		}
		
		callbacks.onComplete?.(messages);
		return { threadId, messages };
		
	} catch (error) {
		callbacks.onError?.(error as Error);
		throw error;
	}
}

// =============================================================================
// RESUME WITH CLARIFICATION RESPONSE
// =============================================================================

/**
 * Resume the graph after a clarification interrupt with the user's response.
 */
export async function resumeWithClarification(
	threadId: string,
	interruptId: string,
	response: ClarificationResponse,
	callbacks: StreamCallbacks
): Promise<{ threadId: string; messages: LangGraphMessage[] }> {
	const client = getClient();
	const assistantId = 'deepresearch';
	
	// Format response based on interrupt type
	let responseContent: string;
	if (response.response) {
		responseContent = response.response;
	} else {
		responseContent = JSON.stringify({
			selected: response.selected || [],
			freeform: response.freeform,
		});
	}
	
	// Build resume payload
	const resumePayload = {
		[interruptId]: {
			response: responseContent,
		},
	};
	
	console.log('[DeepResearch] Resuming with clarification response');
	
	const messages: LangGraphMessage[] = [];
	let currentContent = '';
	
	try {
		const stream = client.runs.stream(threadId, assistantId, {
			input: null,
			command: { resume: resumePayload },
			streamMode: ['messages', 'values'],
		});
		
		for await (const event of stream) {
			const eventType = event.event;
			
			// Handle streaming message chunks
			if (eventType === 'messages/partial') {
				const chunks = event.data as Array<{ type: string; content?: string }>;
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
				}
			}
			
			// Handle values events
			if (eventType === 'values') {
				const data = event.data as {
					messages?: LangGraphMessage[];
					todos?: TodoItem[];
					research_phase?: string;
					research_brief?: string;
					research_iterations?: number;
				};
				
				if (data.messages) {
					messages.length = 0;
					messages.push(...data.messages);
					callbacks.onMessagesSync?.(messages);
					
					const lastMessage = messages[messages.length - 1];
					if (lastMessage?.type === 'ai') {
						currentContent = typeof lastMessage.content === 'string' ? lastMessage.content : '';
					}
				}
				
				if (data.research_phase) {
					callbacks.onPhaseChange?.(data.research_phase);
				}
				
				if (data.research_brief) {
					callbacks.onResearchBrief?.(data.research_brief);
				}
				
				if (typeof data.research_iterations === 'number') {
					callbacks.onResearchIterations?.(data.research_iterations);
				}
				
				if (data.todos && Array.isArray(data.todos)) {
					callbacks.onTodosSync?.(data.todos);
				}
			}
		}
		
		// Check for more interrupts
		const interrupt = await checkForInterrupts(client, threadId);
		if (interrupt) {
			if (interrupt.type === 'clarification') {
				callbacks.onClarificationInterrupt?.(
					interrupt.value as ClarificationInterrupt,
					interrupt.id
				);
				return { threadId, messages };
			}
		}
		
		callbacks.onComplete?.(messages);
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
 * Get thread state including messages and any pending interrupts.
 */
export async function getThreadState(threadId: string): Promise<{
	messages: LangGraphMessage[];
	hasInterrupt: boolean;
	interruptType: 'clarification' | null;
	interruptId: string | null;
	interruptData: ClarificationInterrupt | null;
}> {
	const client = getClient();
	
	try {
		const threadState = await client.threads.getState(threadId);
		const values = threadState.values as { messages?: LangGraphMessage[] };
		const messages = values?.messages || [];
		
		// Check for interrupts
		const tasks = (threadState as { tasks?: Array<{ id?: string; interrupts?: Array<{ value?: unknown; id?: string }> }> }).tasks;
		
		if (tasks && tasks.length > 0) {
			const task = tasks[0];
			const interrupts = task.interrupts;
			
			if (interrupts && interrupts.length > 0) {
				const interruptData = interrupts[0];
				const interruptValue = interruptData.value;
				const interruptId = (interruptData as { id?: string }).id || task.id || '';
				
				if (isClarificationInterrupt(interruptValue)) {
					return {
						messages,
						hasInterrupt: true,
						interruptType: 'clarification',
						interruptId,
						interruptData: interruptValue,
					};
				}
			}
		}
		
		return {
			messages,
			hasInterrupt: false,
			interruptType: null,
			interruptId: null,
			interruptData: null,
		};
	} catch (error) {
		console.error('[DeepResearch] Error getting thread state:', error);
		throw error;
	}
}

/**
 * Cancel active runs for a thread.
 */
export async function cancelActiveRuns(threadId: string): Promise<void> {
	const client = getClient();
	try {
		const runs = await client.runs.list(threadId);
		const activeRuns = runs.filter(run => run.status === 'running' || run.status === 'pending');
		
		for (const run of activeRuns) {
			console.log(`[DeepResearch] Cancelling run ${run.run_id}`);
			await client.runs.cancel(threadId, run.run_id);
		}
	} catch (error) {
		console.error('[DeepResearch] Error cancelling runs:', error);
	}
}

/**
 * Check if the LangGraph server is available.
 */
export async function checkHealth(): Promise<boolean> {
	try {
		const url = settingsStore.agentUrl;
		const response = await fetch(`${url}/ok`, {
			method: 'GET',
			headers: { 'Accept': 'application/json' },
		});
		return response.ok;
	} catch (error) {
		console.warn('[DeepResearch] Health check failed:', error);
		return false;
	}
}

