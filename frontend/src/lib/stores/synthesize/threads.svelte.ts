// Thread store using Svelte 5 runes
// Manages chat threads within projects with IndexedDB persistence

import { nanoid } from 'nanoid';
import { untrack } from 'svelte';
import type { Thread, Message } from './types';
import { synthesizeDb } from '$lib/services/synthesizeDb';

// Reactive state
let threads = $state<Thread[]>([]);
let messagesByThread = $state<Record<string, Message[]>>({});
let currentThreadId = $state<string | null>(null);
let openThreadIds = $state<string[]>([]);
let isLoaded = $state(false);

// Version counter to force reactivity updates
let messagesVersion = $state(0);

// Derived state
const currentThread = $derived(threads.find((t) => t.id === currentThreadId) ?? null);

const openThreads = $derived(
	openThreadIds.map((id) => threads.find((t) => t.id === id)).filter(Boolean) as Thread[]
);

const currentMessages = $derived.by(() => {
	const _v = messagesVersion;
	if (!currentThreadId) return [];
	return messagesByThread[currentThreadId] ?? [];
});

// Get threads for a specific project
function getProjectThreads(projectId: string): Thread[] {
	return threads.filter((t) => t.projectId === projectId).sort((a, b) => b.updatedAt - a.updatedAt);
}

// =============================================================================
// PERSISTENCE HELPERS
// =============================================================================

async function persistThread(thread: Thread): Promise<void> {
	try {
		// Use $state.snapshot to convert reactive proxy to plain object for IndexedDB
		const plainThread = $state.snapshot(thread);
		await synthesizeDb.threads.save(plainThread);
	} catch (e) {
		console.error('[ThreadStore] Failed to persist thread:', e);
	}
}

async function persistMessages(threadId: string, messages: Message[]): Promise<void> {
	try {
		await synthesizeDb.messages.deleteByThread(threadId);
		if (messages.length > 0) {
			// Use $state.snapshot to convert reactive proxies to plain objects for IndexedDB
			const plainMessages = $state.snapshot(messages);
			await synthesizeDb.messages.saveMany(plainMessages);
		}
	} catch (e) {
		console.error('[ThreadStore] Failed to persist messages:', e);
	}
}

async function deletePersistedThread(threadId: string): Promise<void> {
	try {
		await synthesizeDb.threads.delete(threadId);
	} catch (e) {
		console.error('[ThreadStore] Failed to delete persisted thread:', e);
	}
}

// =============================================================================
// ACTIONS
// =============================================================================

function createThread(projectId: string, title?: string): Thread {
	const now = Date.now();
	const thread: Thread = {
		id: nanoid(),
		projectId,
		title: title ?? 'New Thread',
		status: 'idle',
		createdAt: now,
		updatedAt: now,
		viewed: false
	};

	threads = [...threads, thread];
	messagesByThread = { ...messagesByThread, [thread.id]: [] };
	messagesVersion++;
	currentThreadId = thread.id;

	if (!openThreadIds.includes(thread.id)) {
		openThreadIds = [...openThreadIds, thread.id];
	}

	persistThread(thread);

	return thread;
}

function updateThread(
	id: string,
	updates: Partial<
		Pick<Thread, 'title' | 'description' | 'status' | 'metadata' | 'langGraphThreadId' | 'assistantId'>
	>
): void {
	let updatedThread: Thread | null = null;
	let didChange = false;

	threads = threads.map((t) => {
		if (t.id === id) {
			const hasChanges = Object.entries(updates).some(([key, value]) => {
				return t[key as keyof Thread] !== value;
			});

			if (!hasChanges) return t;

			didChange = true;
			updatedThread = { ...t, ...updates, updatedAt: Date.now() };
			return updatedThread;
		}
		return t;
	});

	if (didChange && updatedThread) {
		persistThread(updatedThread);
	}
}

function deleteThread(id: string): void {
	threads = threads.filter((t) => t.id !== id);
	const { [id]: removed, ...rest } = messagesByThread;
	messagesByThread = rest;
	messagesVersion++;

	if (currentThreadId === id) {
		currentThreadId = null;
	}

	deletePersistedThread(id);
}

function selectThread(id: string | null): void {
	currentThreadId = id;
	if (id) {
		const thread = threads.find((t) => t.id === id);
		if (thread && !thread.viewed) {
			threads = threads.map((t) => (t.id === id ? { ...t, viewed: true } : t));
			persistThread(threads.find((t) => t.id === id)!);
		}

		if (!openThreadIds.includes(id)) {
			openThreadIds = [...openThreadIds, id];
		}
	}
}

function closeThread(id: string): void {
	openThreadIds = openThreadIds.filter((openId) => openId !== id);
	if (currentThreadId === id) {
		currentThreadId = openThreadIds[openThreadIds.length - 1] ?? null;
	}
}

function addMessage(
	threadId: string,
	message: Omit<Message, 'id' | 'threadId' | 'createdAt'>
): Message {
	const newMessage: Message = {
		...message,
		id: nanoid(),
		threadId,
		createdAt: Date.now()
	};

	const threadMessages = messagesByThread[threadId] ?? [];
	const updatedMessages = [...threadMessages, newMessage];

	messagesByThread = {
		...messagesByThread,
		[threadId]: updatedMessages
	};
	messagesVersion++;

	console.log('[ThreadStore] Added message to thread', threadId, 'Total messages:', updatedMessages.length);

	let updatedThread: Thread | null = null;
	threads = threads.map((t) => {
		if (t.id === threadId) {
			updatedThread = { ...t, updatedAt: Date.now() };
			return updatedThread;
		}
		return t;
	});

	if (updatedThread) {
		persistThread(updatedThread);
	}
	persistMessages(threadId, updatedMessages);

	return newMessage;
}

function updateMessage(threadId: string, messageId: string, updates: Partial<Message>): void {
	const threadMessages = messagesByThread[threadId];
	if (!threadMessages) return;

	const updatedMessages = threadMessages.map((m) => (m.id === messageId ? { ...m, ...updates } : m));

	messagesByThread = {
		...messagesByThread,
		[threadId]: updatedMessages
	};
	messagesVersion++;

	persistMessages(threadId, updatedMessages);
}

function clearMessages(threadId: string): void {
	messagesByThread = { ...messagesByThread, [threadId]: [] };
	messagesVersion++;

	persistMessages(threadId, []);
}

function syncMessages(threadId: string, messages: Omit<Message, 'createdAt'>[]): void {
	const currentMsgs = messagesByThread[threadId] || [];

	const isDifferent =
		messages.length !== currentMsgs.length ||
		messages.some(
			(msg, i) => msg.content !== currentMsgs[i]?.content || msg.role !== currentMsgs[i]?.role
		);

	if (!isDifferent) return;

	const now = Date.now();
	const newMessages: Message[] = messages.map((msg, index) => ({
		...msg,
		id: msg.id || `synced-${threadId}-${index}-${now}`,
		threadId,
		createdAt: now - (messages.length - index) * 1000
	}));

	messagesByThread = { ...messagesByThread, [threadId]: newMessages };
	messagesVersion++;

	console.log('[ThreadStore] Synced messages for thread', threadId, 'Total:', newMessages.length);

	let updatedThread: Thread | null = null;
	threads = threads.map((t) => {
		if (t.id === threadId) {
			updatedThread = { ...t, updatedAt: Date.now() };
			return updatedThread;
		}
		return t;
	});

	if (updatedThread) {
		persistThread(updatedThread);
	}
	persistMessages(threadId, newMessages);
}

function getMessages(threadId: string): Message[] {
	return messagesByThread[threadId] ?? [];
}

function getThreadMessageCount(threadId: string): number {
	return messagesByThread[threadId]?.length ?? 0;
}

function loadThreads(loadedThreads: Thread[], loadedMessages?: Record<string, Message[]>): void {
	threads = loadedThreads;
	if (loadedMessages) {
		messagesByThread = loadedMessages;
		messagesVersion++;
	}
}

async function loadFromStorage(): Promise<void> {
	if (isLoaded) return;

	try {
		console.log('[ThreadStore] Loading from IndexedDB...');

		const storedThreads = await synthesizeDb.threads.getAll();
		threads = storedThreads;

		const messagesMap: Record<string, Message[]> = {};
		for (const thread of storedThreads) {
			const threadMessages = await synthesizeDb.messages.getByThread(thread.id);
			if (threadMessages.length > 0) {
				messagesMap[thread.id] = threadMessages;
			}
		}
		messagesByThread = messagesMap;
		messagesVersion++;
		isLoaded = true;

		console.log('[ThreadStore] Loaded', storedThreads.length, 'threads from IndexedDB');
	} catch (e) {
		console.error('[ThreadStore] Failed to load from IndexedDB:', e);
		isLoaded = true;
	}
}

async function loadProjectThreads(projectId: string): Promise<void> {
	const loaded = untrack(() => isLoaded);
	if (!loaded) {
		await loadFromStorage();
	}

	const projectThreads = untrack(() => getProjectThreads(projectId));
	const currId = untrack(() => currentThreadId);
	if (currId) {
		const isCurrentValid = projectThreads.some((t) => t.id === currId);
		if (!isCurrentValid) {
			currentThreadId = null;
		}
	}
}

function reset(): void {
	threads = [];
	messagesByThread = {};
	messagesVersion++;
	currentThreadId = null;
	openThreadIds = [];
	isLoaded = false;
}

function clearProjectState(): void {
	currentThreadId = null;
	openThreadIds = [];
}

// Export reactive getters and actions
export const synthThreadStore = {
	get threads() {
		return threads;
	},
	get currentThread() {
		return currentThread;
	},
	get currentThreadId() {
		return currentThreadId;
	},
	get currentMessages() {
		return currentMessages;
	},
	get openThreads() {
		return openThreads;
	},
	get openThreadIds() {
		return openThreadIds;
	},
	get isLoaded() {
		return isLoaded;
	},

	getProjectThreads,
	getMessages,
	getThreadMessageCount,
	loadProjectThreads,
	loadFromStorage,
	createThread,
	updateThread,
	deleteThread,
	selectThread,
	closeThread,
	addMessage,
	updateMessage,
	clearMessages,
	syncMessages,
	loadThreads,
	reset,
	clearProjectState
};

