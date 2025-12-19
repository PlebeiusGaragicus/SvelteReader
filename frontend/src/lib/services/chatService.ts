/**
 * Chat Service - Handles communication with the FastAPI backend for AI chat.
 *
 * This service provides:
 * - Streaming chat responses via Server-Sent Events
 * - Thread management for conversation history
 * - Non-streaming fallback
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface PassageContext {
	text: string;
	note?: string;
	bookTitle?: string;
	chapter?: string;
}

export interface ChatMessage {
	content: string;
	threadId?: string;
	passageContext?: PassageContext;
}

export interface ChatResponse {
	content: string;
	threadId: string;
	messageId: string;
}

export interface StreamEvent {
	type: 'thread_id' | 'token' | 'message' | 'state' | 'done' | 'error';
	content?: string;
	threadId?: string;
	messageId?: string;
	error?: string;
	data?: unknown;
}

/**
 * Send a message and get a complete response (non-streaming).
 */
export async function sendMessage(message: ChatMessage): Promise<ChatResponse> {
	const response = await fetch(`${API_BASE_URL}/api/chat/message`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			content: message.content,
			thread_id: message.threadId,
			passage_context: message.passageContext
				? {
						text: message.passageContext.text,
						note: message.passageContext.note,
						book_title: message.passageContext.bookTitle,
						chapter: message.passageContext.chapter,
					}
				: undefined,
		}),
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
		throw new Error(error.detail || 'Failed to send message');
	}

	const data = await response.json();
	return {
		content: data.content,
		threadId: data.thread_id,
		messageId: data.message_id,
	};
}

/**
 * Send a message and stream the response.
 *
 * @param message - The message to send
 * @param onToken - Callback for each token received
 * @param onComplete - Callback when streaming is complete
 * @param onError - Callback for errors
 * @returns Object with threadId and abort function
 */
export async function sendMessageStream(
	message: ChatMessage,
	onToken: (token: string) => void,
	onComplete: (fullContent: string, messageId: string) => void,
	onError: (error: string) => void
): Promise<{ threadId: string | null; abort: () => void }> {
	const abortController = new AbortController();
	let threadId: string | null = message.threadId || null;
	let fullContent = '';
	let messageId = '';

	try {
		const response = await fetch(`${API_BASE_URL}/api/chat/message/stream`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				content: message.content,
				thread_id: message.threadId,
				passage_context: message.passageContext
					? {
							text: message.passageContext.text,
							note: message.passageContext.note,
							book_title: message.passageContext.bookTitle,
							chapter: message.passageContext.chapter,
						}
					: undefined,
			}),
			signal: abortController.signal,
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
			throw new Error(error.detail || 'Failed to send message');
		}

		const reader = response.body?.getReader();
		if (!reader) {
			throw new Error('No response body');
		}

		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			// Process complete SSE events
			const lines = buffer.split('\n');
			buffer = lines.pop() || ''; // Keep incomplete line in buffer

			for (const line of lines) {
				if (line.startsWith('data: ')) {
					try {
						const event: StreamEvent = JSON.parse(line.slice(6));

						switch (event.type) {
							case 'thread_id':
								threadId = event.threadId || null;
								break;

							case 'token':
								if (event.content) {
									fullContent += event.content;
									onToken(event.content);
								}
								break;

							case 'message':
								if (event.content) {
									fullContent = event.content;
									messageId = event.messageId || '';
								}
								break;

							case 'done':
								onComplete(fullContent, messageId);
								break;

							case 'error':
								onError(event.error || 'Unknown error');
								break;
						}
					} catch {
						// Ignore JSON parse errors for incomplete data
					}
				}
			}
		}
	} catch (error) {
		if ((error as Error).name === 'AbortError') {
			// Request was aborted, don't call onError
			return { threadId, abort: () => {} };
		}
		onError((error as Error).message);
	}

	return {
		threadId,
		abort: () => abortController.abort(),
	};
}

/**
 * Create a new conversation thread.
 */
export async function createThread(): Promise<string> {
	const response = await fetch(`${API_BASE_URL}/api/chat/thread`, {
		method: 'POST',
	});

	if (!response.ok) {
		throw new Error('Failed to create thread');
	}

	const data = await response.json();
	return data.thread_id;
}

/**
 * Delete a conversation thread.
 */
export async function deleteThread(threadId: string): Promise<void> {
	const response = await fetch(`${API_BASE_URL}/api/chat/thread/${threadId}`, {
		method: 'DELETE',
	});

	if (!response.ok) {
		throw new Error('Failed to delete thread');
	}
}

/**
 * Check if the backend is available.
 */
export async function checkBackendHealth(): Promise<boolean> {
	try {
		const response = await fetch(`${API_BASE_URL}/health`, {
			method: 'GET',
		});
		return response.ok;
	} catch {
		return false;
	}
}
