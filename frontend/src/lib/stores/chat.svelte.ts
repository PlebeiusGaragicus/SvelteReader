/**
 * Chat Store - Reactive state management for LangGraph chat using Svelte 5 runes
 * 
 * Provides:
 * - Message state with streaming support
 * - Thread management
 * - Payment integration with CypherTap
 */

import type { Message } from '@langchain/langgraph-sdk';
import { v4 as uuidv4 } from 'uuid';
import { submitMessage, getThreadMessages, getThreads, deleteThread as deleteThreadApi } from '$lib/services/langgraph';
import type { PassageContext, PaymentInfo } from '$lib/types/chat';

const MESSAGE_COST_SATS = 1;

interface ChatState {
	messages: Message[];
	threadId: string | null;
	isLoading: boolean;
	isStreaming: boolean;
	error: string | null;
	threads: Array<{ thread_id: string; created_at?: string; metadata?: Record<string, unknown> }>;
}

function createChatStore() {
	let messages = $state<Message[]>([]);
	let threadId = $state<string | null>(null);
	let isLoading = $state(false);
	let isStreaming = $state(false);
	let error = $state<string | null>(null);
	let threads = $state<Array<{ thread_id: string; created_at?: string; metadata?: Record<string, unknown> }>>([]);
	let streamingContent = $state('');

	async function submit(
		content: string,
		options?: {
			context?: PassageContext;
			generatePayment?: () => Promise<PaymentInfo | null>;
		}
	): Promise<boolean> {
		if (!content.trim() || isLoading) return false;

		error = null;
		isLoading = true;
		isStreaming = true;
		streamingContent = '';

		// Generate payment if callback provided
		let payment: PaymentInfo | undefined;
		if (options?.generatePayment) {
			try {
				const paymentResult = await options.generatePayment();
				if (!paymentResult) {
					error = 'Payment generation failed or insufficient balance';
					isLoading = false;
					isStreaming = false;
					return false;
				}
				payment = paymentResult;
			} catch (e) {
				error = `Payment error: ${(e as Error).message}`;
				isLoading = false;
				isStreaming = false;
				return false;
			}
		}

		// Add optimistic human message
		const humanMessage: Message = {
			id: uuidv4(),
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
					onComplete: (finalMessages) => {
						// Replace with final state from server
						messages = finalMessages;
						isStreaming = false;
					},
					onError: (err) => {
						error = err.message;
						// Remove the placeholder AI message on error
						messages = messages.filter(m => m.id !== aiMessageId);
						isStreaming = false;
					},
					onThreadId: (id) => {
						threadId = id;
						// Refresh threads list
						loadThreads();
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
			return false;
		}
	}

	async function loadThread(id: string): Promise<void> {
		if (id === threadId) return;

		isLoading = true;
		error = null;

		try {
			const threadMessages = await getThreadMessages(id);
			messages = threadMessages;
			threadId = id;
		} catch (e) {
			error = `Failed to load thread: ${(e as Error).message}`;
		} finally {
			isLoading = false;
		}
	}

	async function loadThreads(): Promise<void> {
		try {
			const threadList = await getThreads();
			threads = threadList.map(t => ({
				thread_id: t.thread_id,
				created_at: t.created_at,
				metadata: t.metadata,
			}));
		} catch (e) {
			console.error('Failed to load threads:', e);
		}
	}

	async function newThread(): Promise<void> {
		messages = [];
		threadId = null;
		error = null;
		streamingContent = '';
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
	}

	return {
		get messages() { return messages; },
		get threadId() { return threadId; },
		get isLoading() { return isLoading; },
		get isStreaming() { return isStreaming; },
		get error() { return error; },
		get threads() { return threads; },
		get streamingContent() { return streamingContent; },
		
		submit,
		loadThread,
		loadThreads,
		newThread,
		deleteThread,
		clearError,
		stop,
		
		setThreadId: (id: string | null) => { threadId = id; },
	};
}

export const chatStore = createChatStore();

export function useChatStore() {
	return chatStore;
}
