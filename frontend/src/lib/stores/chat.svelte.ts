/**
 * Chat Store - Reactive state management for LangGraph chat using Svelte 5 runes
 * 
 * Provides:
 * - Message state with streaming support
 * - Thread management
 * - Tool execution status (agent-driven RAG)
 * - Payment integration with CypherTap
 * - Pending payment tracking for refund recovery
 * 
 * See docs/ecash-payment-flow.md for payment flow design.
 */

import type { Message } from '@langchain/langgraph-sdk';
import { v4 as uuidv4 } from 'uuid';
import { 
	submitMessage, 
	getThreadMessages, 
	getThreads, 
	deleteThread as deleteThreadApi,
	setToolExecutor,
	type ToolCall,
	type ToolResult
} from '$lib/services/langgraph';
import { executeToolCall } from '$lib/services/agentToolsService';
import type { PassageContext, PaymentInfo } from '$lib/types/chat';

const MESSAGE_COST_SATS = 1;
const PAYMENT_TIMEOUT_MS = 60000; // 1 minute timeout for payment recovery

interface PendingPayment {
	token: string;
	messageId: string;
	timestamp: number;
}

// Thread info with extracted title from first message
export interface ThreadInfo {
	thread_id: string;
	created_at?: string;
	metadata?: Record<string, unknown>;
	title?: string;  // Extracted from first message content
}

// Tool execution status for UI display
export interface ToolExecutionStatus {
	isExecuting: boolean;
	currentTools: ToolCall[];
	lastResults: ToolResult[];
}

interface ChatState {
	messages: Message[];
	threadId: string | null;
	isLoading: boolean;
	isStreaming: boolean;
	isThreadsLoading: boolean;  // Separate loading state for threads list
	error: string | null;
	threads: ThreadInfo[];
	pendingPayment: PendingPayment | null;
	toolStatus: ToolExecutionStatus;
}

// Extract title from message content (first ~50 chars of first human message)
function extractThreadTitle(messages: Message[]): string | undefined {
	const firstHuman = messages.find(m => m.type === 'human');
	if (!firstHuman) return undefined;
	
	let content = '';
	if (typeof firstHuman.content === 'string') {
		content = firstHuman.content;
	} else if (Array.isArray(firstHuman.content)) {
		// Handle content blocks (text, image_url, etc.)
		const textBlock = firstHuman.content.find(
			(block): block is { type: 'text'; text: string } => 
				typeof block === 'object' && block !== null && 'type' in block && block.type === 'text'
		);
		content = textBlock?.text || '';
	}
	
	if (!content) return undefined;
	
	// Truncate to ~50 chars at word boundary
	const maxLen = 50;
	if (content.length <= maxLen) return content;
	const truncated = content.slice(0, maxLen);
	const lastSpace = truncated.lastIndexOf(' ');
	return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

// Map tool names to user-friendly descriptions
function getToolDescription(toolName: string): string {
	const descriptions: Record<string, string> = {
		'get_table_of_contents': 'Reading book structure...',
		'get_book_metadata': 'Getting book info...',
		'get_chapter': 'Reading chapter...',
		'search_book': 'Searching book...',
	};
	return descriptions[toolName] || `Running ${toolName}...`;
}

function createChatStore() {
	let messages = $state<Message[]>([]);
	let threadId = $state<string | null>(null);
	let isLoading = $state(false);
	let isStreaming = $state(false);
	let isThreadsLoading = $state(false);
	let error = $state<string | null>(null);
	let threads = $state<ThreadInfo[]>([]);
	let streamingContent = $state('');
	let pendingPayment = $state<PendingPayment | null>(null);
	
	// Tool execution status
	let toolStatus = $state<ToolExecutionStatus>({
		isExecuting: false,
		currentTools: [],
		lastResults: [],
	});
	
	// Current book ID for tool execution
	let currentBookId = $state<string | null>(null);
	
	// Refund callback - set by component that has access to CypherTap
	let refundCallback: ((token: string) => Promise<boolean>) | null = null;

	// Initialize the tool executor in langgraph service
	setToolExecutor(executeToolCall);

	async function submit(
		content: string,
		options?: {
			context?: PassageContext;
			generatePayment?: () => Promise<PaymentInfo | null>;
			bookId?: string;
		}
	): Promise<boolean> {
		if (!content.trim() || isLoading) return false;

		error = null;
		isLoading = true;
		isStreaming = true;
		streamingContent = '';
		toolStatus = { isExecuting: false, currentTools: [], lastResults: [] };
		
		// Store book ID for tool execution
		if (options?.bookId) {
			currentBookId = options.bookId;
		}

		const messageId = uuidv4();

		// Generate payment if callback provided
		let payment: PaymentInfo | undefined;
		if (options?.generatePayment) {
			try {
				console.log('[Chat] Generating payment token...');
				const paymentResult = await options.generatePayment();
				if (!paymentResult) {
					error = 'Payment generation failed or insufficient balance';
					console.log('[Chat] Payment generation failed - no result');
					isLoading = false;
					isStreaming = false;
					return false;
				}
				payment = paymentResult;
				console.log(`[Chat] Payment token generated: ${paymentResult.amount_sats} sats`);
				
				// Store pending payment for potential refund recovery
				if (paymentResult.ecash_token) {
					pendingPayment = {
						token: paymentResult.ecash_token,
						messageId,
						timestamp: Date.now(),
					};
					// DEV: Log token for manual recovery
					console.log('[Chat] ========== PENDING PAYMENT TOKEN ==========');
					console.log(`[Chat] ${paymentResult.ecash_token}`);
					console.log('[Chat] =============================================');
				}
			} catch (e) {
				error = `Payment error: ${(e as Error).message}`;
				console.error('[Chat] Payment generation error:', e);
				isLoading = false;
				isStreaming = false;
				return false;
			}
		}

		// Add optimistic human message
		const humanMessage: Message = {
			id: messageId,
			type: 'human',
			content: content,
		};
		messages = [...messages, humanMessage];

		// Add placeholder for streaming AI response
		const aiMessageId = uuidv4();
		const aiPlaceholder: Message = {
			id: aiMessageId,
			type: 'ai',
			content: '',
		};
		messages = [...messages, aiPlaceholder];

		try {
			const result = await submitMessage(
				content,
				{
					threadId,
					context: options?.context,
					payment,
					bookId: options?.bookId || currentBookId || undefined,
				},
				{
					onToken: (token) => {
						streamingContent += token;
						// Update the AI message content
						messages = messages.map(m =>
							m.id === aiMessageId
								? { ...m, content: streamingContent }
								: m
						);
					},
					onMessage: (message) => {
						// Update with full message when available
						messages = messages.map(m =>
							m.id === aiMessageId
								? { ...m, ...message, id: aiMessageId }
								: m
						);
					},
					onComplete: (finalMessages, refund) => {
						// Replace with final state from server
						messages = finalMessages;
						isStreaming = false;
						toolStatus = { isExecuting: false, currentTools: [], lastResults: [] };
						
						if (refund) {
							// Agent signaled refund needed
							console.log('[Chat] Agent signaled refund, attempting recovery');
							attemptRefund('onComplete with refund flag');
						} else {
							// Success - clear pending payment (it was redeemed by agent)
							pendingPayment = null;
							console.log('[Chat] Message successful, pending payment cleared');
						}
					},
					onError: (err) => {
						error = err.message;
						// Remove the placeholder AI message on error
						messages = messages.filter(m => m.id !== aiMessageId);
						isStreaming = false;
						toolStatus = { isExecuting: false, currentTools: [], lastResults: [] };
						// Attempt refund on error
						attemptRefund('onError callback');
					},
					onRefund: () => {
						// Agent explicitly signaled refund
						console.log('[Chat] Received onRefund callback from agent');
						attemptRefund('onRefund callback');
					},
					onThreadId: (id) => {
						threadId = id;
						// Refresh threads list
						loadThreads();
					},
					// Tool execution callbacks
					onToolCall: (tools) => {
						console.log('[Chat] Tool calls received:', tools.map(t => t.name));
						toolStatus = {
							isExecuting: true,
							currentTools: tools,
							lastResults: [],
						};
					},
					onToolExecuting: (tools) => {
						console.log('[Chat] Executing tools:', tools.map(t => t.name));
						toolStatus = {
							...toolStatus,
							isExecuting: true,
							currentTools: tools,
						};
					},
					onToolComplete: (results) => {
						console.log('[Chat] Tools completed:', results.map(r => ({ id: r.id, hasError: !!r.error })));
						toolStatus = {
							isExecuting: false,
							currentTools: [],
							lastResults: results,
						};
					},
				}
			);

			threadId = result.threadId;
			isLoading = false;
			return true;
		} catch (e) {
			error = (e as Error).message;
			// Remove placeholder on error
			messages = messages.filter(m => m.id !== aiMessageId);
			isLoading = false;
			isStreaming = false;
			toolStatus = { isExecuting: false, currentTools: [], lastResults: [] };
			// Attempt refund on error
			await attemptRefund('catch block');
			return false;
		}
	}
	
	/**
	 * Attempt to refund a pending payment by calling the refund callback.
	 * The callback should use cyphertap.receiveEcashToken() to reclaim funds.
	 */
	async function attemptRefund(reason: string): Promise<boolean> {
		if (!pendingPayment) {
			console.log('[Chat] No pending payment to refund');
			return false;
		}
		
		const token = pendingPayment.token;
		console.log(`[Chat] Attempting refund (${reason})`);
		
		// DEV: Always log token for manual recovery in case auto-refund fails
		console.log('[Chat] ========== REFUND TOKEN (for manual recovery) ==========');
		console.log(`[Chat] ${token}`);
		console.log('[Chat] =========================================================');
		
		if (refundCallback) {
			try {
				console.log('[Chat] Calling refund callback...');
				const success = await refundCallback(token);
				if (success) {
					console.log('[Chat] Refund successful - funds returned to wallet');
					pendingPayment = null;
					return true;
				} else {
					console.warn('[Chat] Refund callback returned false - token may already be spent');
				}
			} catch (e) {
				console.error('[Chat] Refund callback threw error:', e);
			}
		} else {
			console.warn('[Chat] No refund callback set - cannot auto-refund');
			console.warn('[Chat] Copy the token above and manually redeem it in your wallet');
		}
		
		// Keep pending payment for manual recovery
		console.log('[Chat] Keeping pending payment for manual recovery');
		return false;
	}
	
	/**
	 * Set the refund callback. Should be called by component with CypherTap access.
	 */
	function setRefundCallback(callback: (token: string) => Promise<boolean>): void {
		refundCallback = callback;
	}
	
	/**
	 * Manually trigger refund recovery for any pending payments.
	 * Useful for recovering from timeouts or app restarts.
	 */
	async function recoverPendingPayment(): Promise<boolean> {
		if (!pendingPayment) return false;
		
		// Check if payment is old enough to consider timed out
		const age = Date.now() - pendingPayment.timestamp;
		if (age < PAYMENT_TIMEOUT_MS) {
			console.log(`[Chat] Pending payment is only ${age}ms old, not recovering yet`);
			return false;
		}
		
		return attemptRefund('timeout recovery');
	}

	async function loadThread(id: string): Promise<boolean> {
		// Don't set threadId until we confirm it exists
		isLoading = true;
		error = null;

		try {
			const threadMessages = await getThreadMessages(id);
			messages = threadMessages;
			threadId = id;  // Only set after successful load
			return true;
		} catch (e) {
			// Thread doesn't exist on server - it's orphaned
			console.warn(`Thread ${id} not found on server:`, e);
			error = `Thread not found. It may have been deleted.`;
			messages = [];
			threadId = null;  // Clear invalid thread
			return false;
		} finally {
			isLoading = false;
		}
	}

	async function loadThreads(): Promise<void> {
		isThreadsLoading = true;
		try {
			const threadList = await getThreads();
			
			// Extract titles from thread values if available
			threads = threadList.map(t => {
				let title: string | undefined;
				
				// Try to get title from thread values (messages)
				if (t.values && typeof t.values === 'object' && 'messages' in t.values) {
					const msgs = (t.values as { messages?: Message[] }).messages;
					if (msgs && Array.isArray(msgs)) {
						title = extractThreadTitle(msgs);
					}
				}
				
				// Fall back to metadata title if available
				if (!title && t.metadata?.title) {
					title = String(t.metadata.title);
				}
				
				return {
					thread_id: t.thread_id,
					created_at: t.created_at,
					metadata: t.metadata,
					title,
				};
			});
		} catch (e) {
			console.error('Failed to load threads:', e);
		} finally {
			isThreadsLoading = false;
		}
	}

	async function newThread(): Promise<void> {
		messages = [];
		threadId = null;
		error = null;
		streamingContent = '';
		toolStatus = { isExecuting: false, currentTools: [], lastResults: [] };
	}

	async function deleteThread(id: string): Promise<void> {
		try {
			await deleteThreadApi(id);
			threads = threads.filter(t => t.thread_id !== id);
			
			// If we deleted the current thread, clear it
			if (id === threadId) {
				await newThread();
			}
		} catch (e) {
			error = `Failed to delete thread: ${(e as Error).message}`;
		}
	}

	function clearError(): void {
		error = null;
	}

	function stop(): void {
		// TODO: Implement abort controller for streaming
		isLoading = false;
		isStreaming = false;
		toolStatus = { isExecuting: false, currentTools: [], lastResults: [] };
	}
	
	function setBookId(bookId: string): void {
		currentBookId = bookId;
	}

	return {
		get messages() { return messages; },
		get threadId() { return threadId; },
		get isLoading() { return isLoading; },
		get isStreaming() { return isStreaming; },
		get isThreadsLoading() { return isThreadsLoading; },
		get error() { return error; },
		get threads() { return threads; },
		get streamingContent() { return streamingContent; },
		get pendingPayment() { return pendingPayment; },
		get toolStatus() { return toolStatus; },
		get currentBookId() { return currentBookId; },
		
		submit,
		loadThread,
		loadThreads,
		newThread,
		deleteThread,
		clearError,
		stop,
		setRefundCallback,
		recoverPendingPayment,
		extractThreadTitle,
		setBookId,
		getToolDescription,
		
		setThreadId: (id: string | null) => { threadId = id; },
	};
}

export const chatStore = createChatStore();

export function useChatStore() {
	return chatStore;
}
