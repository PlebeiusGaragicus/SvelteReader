// Agent store for Synthesize mode - LangGraph streaming with tool interrupt handling
// Simplified version focused on deepresearch agent

import type {
	ToolCall,
	ToolCallWithStatus,
	ToolResult,
	Message as LocalMessage,
	HITLInterrupt,
	HITLDecision,
	HITLResumeResponse,
	ClientToolInterrupt,
	ClarificationInterrupt,
	ClarificationResponse,
	TodoItem
} from './types';
import { isClientToolInterrupt, isClarificationInterrupt } from './types';
import { synthThreadStore } from './threads.svelte';
import { synthArtifactStore } from './artifacts.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';

// =============================================================================
// TYPES
// =============================================================================

interface LangGraphMessage {
	id?: string;
	type: 'human' | 'ai' | 'tool';
	content: string | unknown;
	tool_calls?: ToolCall[];
	tool_call_id?: string;
}

interface ThreadRunState {
	isStreaming: boolean;
	isInterrupted: boolean;
	langGraphThreadId: string | null;
	error: string | null;
	pendingToolCalls: ToolCallWithStatus[];
	streamingContent: string;
	langGraphMessages: LangGraphMessage[];
	hitlInterrupt: HITLInterrupt | null;
	hitlInterruptId: string | null;
	awaitingHumanResponse: boolean;
	clientToolInterrupt: ClientToolInterrupt | null;
	clarificationInterrupt: ClarificationInterrupt | null;
	todos: TodoItem[];
}

// =============================================================================
// REACTIVE STATE
// =============================================================================

const runStates = $state<Record<string, ThreadRunState>>({});

function getThreadState(localThreadId: string): ThreadRunState {
	if (!runStates[localThreadId]) {
		runStates[localThreadId] = {
			isStreaming: false,
			isInterrupted: false,
			langGraphThreadId: null,
			error: null,
			pendingToolCalls: [],
			streamingContent: '',
			langGraphMessages: [],
			hitlInterrupt: null,
			hitlInterruptId: null,
			awaitingHumanResponse: false,
			clientToolInterrupt: null,
			clarificationInterrupt: null,
			todos: []
		};
	}
	return runStates[localThreadId];
}

// Reactive helpers
const currentLocalThreadId = $derived(synthThreadStore.currentThreadId);
const currentState = $derived(currentLocalThreadId ? getThreadState(currentLocalThreadId) : null);

function getRunState(threadId: string): ThreadRunState {
	return getThreadState(threadId);
}

// =============================================================================
// MESSAGE CONVERSION
// =============================================================================

function convertLangGraphMessages(
	lgMessages: LangGraphMessage[],
	threadId: string
): Omit<LocalMessage, 'createdAt'>[] {
	const localMessages: Array<Omit<LocalMessage, 'createdAt'> & { toolCalls?: ToolCallWithStatus[] }> =
		[];

	for (let i = 0; i < lgMessages.length; i++) {
		const msg = lgMessages[i];

		if (msg.type === 'human') {
			localMessages.push({
				id: msg.id || `human-${i}`,
				threadId,
				role: 'user',
				content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
			});
		} else if (msg.type === 'ai') {
			const content = typeof msg.content === 'string' ? msg.content : '';
			const toolCalls = msg.tool_calls;

			if (content || (toolCalls && toolCalls.length > 0)) {
				const localAiMsg = {
					id: msg.id || `ai-${i}`,
					threadId,
					role: 'assistant' as const,
					content,
					toolCalls:
						toolCalls?.map((tc) => ({
							...tc,
							status: 'completed' as const
						})) || []
				};
				localMessages.push(localAiMsg);
			}
		} else if (msg.type === 'tool') {
			const toolCallId = msg.tool_call_id;
			if (!toolCallId) continue;

			const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

			for (const aiMsg of localMessages) {
				if (aiMsg.role === 'assistant' && aiMsg.toolCalls) {
					const toolCall = aiMsg.toolCalls.find((tc) => tc.id === toolCallId);
					if (toolCall) {
						toolCall.result = {
							tool_call_id: toolCallId,
							name: toolCall.name,
							content: content
						};
						toolCall.status = 'completed';
						break;
					}
				}
			}
		}
	}

	return localMessages;
}

// =============================================================================
// STATUS UPDATES
// =============================================================================

function updateThreadStatus(localThreadId: string) {
	const state = getThreadState(localThreadId);
	let status: 'idle' | 'busy' | 'interrupted' | 'error' = 'idle';

	if (state.error) {
		status = 'error';
	} else if (state.awaitingHumanResponse) {
		status = 'interrupted';
	} else if (state.isStreaming || state.isInterrupted || state.pendingToolCalls.length > 0) {
		status = 'busy';
	}

	synthThreadStore.updateThread(localThreadId, { status });
}

// =============================================================================
// PROJECT FILES BUILDER
// =============================================================================

interface ProjectFile {
	id: string;
	title: string;
	file_type: 'artifact' | 'document' | 'code';
	content?: string;
}

function buildProjectFiles(): ProjectFile[] {
	const artifacts = synthArtifactStore.artifacts;
	return artifacts.map((artifact) => {
		const content = synthArtifactStore.getLiveContent(artifact.id);
		const currentVersion = artifact.versions[artifact.currentVersionIndex];
		return {
			id: artifact.id,
			title: currentVersion?.title || 'Untitled',
			file_type: 'artifact' as const,
			content: content || ''
		};
	});
}

// =============================================================================
// MAIN SEND MESSAGE FUNCTION
// =============================================================================

async function sendMessage(
	message: string,
	langGraphThreadId: string | null,
	localThreadId: string
): Promise<{ langGraphThreadId: string }> {
	const state = getThreadState(localThreadId);
	const thread = synthThreadStore.threads.find((t) => t.id === localThreadId);
	const assistantId = thread?.assistantId || 'deepresearch';
	const projectId = thread?.projectId || '';

	if (langGraphThreadId !== state.langGraphThreadId) {
		state.langGraphMessages = [];
	}

	state.isStreaming = true;
	state.isInterrupted = false;
	state.langGraphThreadId = langGraphThreadId;
	state.error = null;
	state.hitlInterrupt = null;
	state.hitlInterruptId = null;
	state.awaitingHumanResponse = false;
	state.clarificationInterrupt = null;
	state.pendingToolCalls = [];
	state.streamingContent = '';

	updateThreadStatus(localThreadId);

	// Add optimistic user message
	state.langGraphMessages = [
		...state.langGraphMessages,
		{
			type: 'human',
			content: message,
			id: `optimistic-user-${Date.now()}`
		} as LangGraphMessage
	];

	try {
		synthThreadStore.addMessage(localThreadId, {
			role: 'user',
			content: message
		});

		synthThreadStore.updateThread(localThreadId, { description: message });

		const agentUrl = settingsStore.agentUrl;

		// Build input for LangGraph
		const input: Record<string, unknown> = {
			messages: state.langGraphMessages.map((m) => ({
				type: m.type,
				content: m.content
			})),
			current_project_id: projectId,
			project_files: buildProjectFiles()
		};

		// Prepare thread config
		const config: Record<string, unknown> = {
			configurable: {
				thread_id: langGraphThreadId || crypto.randomUUID()
			}
		};

		const response = await fetch(`${agentUrl}/runs/stream`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				assistant_id: assistantId,
				input,
				config,
				stream_mode: ['messages', 'values', 'updates']
			})
		});

		if (!response.ok) {
			throw new Error(`Agent request failed: ${response.status}`);
		}

		if (!response.body) {
			throw new Error('No response body');
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let newThreadId = langGraphThreadId;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (!line.startsWith('event:') && !line.startsWith('data:')) continue;

				if (line.startsWith('data:')) {
					const data = line.slice(5).trim();
					if (!data || data === '[DONE]') continue;

					try {
						const parsed = JSON.parse(data);

						// Handle thread ID
						if (parsed.thread_id && !newThreadId) {
							newThreadId = parsed.thread_id;
							state.langGraphThreadId = newThreadId;
						}

						// Handle messages/partial events (streaming tokens)
						if (Array.isArray(parsed) && parsed.length > 0) {
							const lastChunk = parsed[parsed.length - 1];
							if (lastChunk?.type === 'ai' && lastChunk.content) {
								const newContent = lastChunk.content;
								if (newContent.length > state.streamingContent.length) {
									state.streamingContent = newContent;
								}
							}
						}

						// Handle values events (full state snapshots)
						if (parsed.messages && Array.isArray(parsed.messages)) {
							state.langGraphMessages = parsed.messages;

							const lastMessage = parsed.messages[parsed.messages.length - 1];
							if (lastMessage?.type === 'ai') {
								const content =
									typeof lastMessage.content === 'string' ? lastMessage.content : '';
								if (content.length > state.streamingContent.length) {
									state.streamingContent = content;
								}
							}
						}

						// Handle todos
						if (parsed.todos && Array.isArray(parsed.todos)) {
							state.todos = parsed.todos;
						}

						// Handle interrupts
						if (parsed.interrupt) {
							const interrupt = parsed.interrupt;
							if (isClarificationInterrupt(interrupt)) {
								state.clarificationInterrupt = interrupt;
								state.hitlInterruptId = parsed.interrupt_id;
								state.awaitingHumanResponse = true;
								state.isInterrupted = true;
								state.isStreaming = false;
							} else if (isClientToolInterrupt(interrupt)) {
								state.clientToolInterrupt = interrupt;
								state.hitlInterruptId = parsed.interrupt_id;
								state.awaitingHumanResponse = true;
								state.isInterrupted = true;
								state.isStreaming = false;
							} else if (interrupt.action_requests) {
								state.hitlInterrupt = interrupt;
								state.hitlInterruptId = parsed.interrupt_id;
								state.awaitingHumanResponse = true;
								state.isInterrupted = true;
								state.isStreaming = false;
							}
							updateThreadStatus(localThreadId);
						}
					} catch {
						// Skip malformed JSON
					}
				}
			}
		}

		// Stream complete - sync messages
		const convertedMessages = convertLangGraphMessages(state.langGraphMessages, localThreadId);
		synthThreadStore.syncMessages(localThreadId, convertedMessages);

		state.isStreaming = false;
		state.isInterrupted = false;
		state.pendingToolCalls = [];
		state.streamingContent = '';

		// Update thread with final AI response preview
		const lastAi = [...state.langGraphMessages]
			.reverse()
			.find((m) => m.type === 'ai' && typeof m.content === 'string');
		if (lastAi && typeof lastAi.content === 'string') {
			synthThreadStore.updateThread(localThreadId, { description: lastAi.content });
		}

		// Update thread with LangGraph thread ID
		if (newThreadId) {
			synthThreadStore.updateThread(localThreadId, { langGraphThreadId: newThreadId });
		}

		updateThreadStatus(localThreadId);

		return { langGraphThreadId: newThreadId || '' };
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		state.error = errorMessage;
		state.isStreaming = false;
		state.isInterrupted = false;
		state.streamingContent = '';
		state.pendingToolCalls = [];
		updateThreadStatus(localThreadId);
		throw err;
	}
}

// =============================================================================
// HITL RESPONSE FUNCTIONS
// =============================================================================

async function resumeWithDecisions(
	decisions: HITLDecision[],
	threadId?: string
): Promise<void> {
	const localThreadId = threadId || currentLocalThreadId;
	if (!localThreadId) return;

	const state = getThreadState(localThreadId);
	if (!state.langGraphThreadId || !state.awaitingHumanResponse || !state.hitlInterruptId) {
		console.error('[SynthAgent] Cannot resume: no active HITL interrupt');
		return;
	}

	const thread = synthThreadStore.threads.find((t) => t.id === localThreadId);
	const assistantId = thread?.assistantId || 'deepresearch';
	const interruptId = state.hitlInterruptId;

	state.hitlInterrupt = null;
	state.hitlInterruptId = null;
	state.awaitingHumanResponse = false;
	state.isStreaming = true;
	state.isInterrupted = false;
	state.streamingContent = '';

	updateThreadStatus(localThreadId);

	const response: HITLResumeResponse = { decisions };

	try {
		const agentUrl = settingsStore.agentUrl;

		const resumeResponse = await fetch(`${agentUrl}/threads/${state.langGraphThreadId}/runs/stream`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				assistant_id: assistantId,
				interrupt_id: interruptId,
				resume: response,
				stream_mode: ['messages', 'values']
			})
		});

		if (!resumeResponse.ok) {
			throw new Error(`Resume failed: ${resumeResponse.status}`);
		}

		// Process streaming response similar to sendMessage
		if (resumeResponse.body) {
			const reader = resumeResponse.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.startsWith('data:')) {
						const data = line.slice(5).trim();
						if (!data || data === '[DONE]') continue;

						try {
							const parsed = JSON.parse(data);

							if (Array.isArray(parsed) && parsed.length > 0) {
								const lastChunk = parsed[parsed.length - 1];
								if (lastChunk?.type === 'ai' && lastChunk.content) {
									state.streamingContent = lastChunk.content;
								}
							}

							if (parsed.messages && Array.isArray(parsed.messages)) {
								state.langGraphMessages = parsed.messages;
							}
						} catch {
							// Skip malformed JSON
						}
					}
				}
			}
		}

		const convertedMessages = convertLangGraphMessages(state.langGraphMessages, localThreadId);
		synthThreadStore.syncMessages(localThreadId, convertedMessages);

		state.isStreaming = false;
		state.isInterrupted = false;
		state.pendingToolCalls = [];
		state.streamingContent = '';
		updateThreadStatus(localThreadId);
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		state.error = errorMessage;
		state.isStreaming = false;
		state.isInterrupted = false;
		state.awaitingHumanResponse = false;
		state.pendingToolCalls = [];
		state.streamingContent = '';
		updateThreadStatus(localThreadId);
		throw err;
	}
}

async function approveAllActions(threadId?: string): Promise<void> {
	const localThreadId = threadId || currentLocalThreadId;
	if (!localThreadId) return;
	const state = getThreadState(localThreadId);
	if (!state.hitlInterrupt) return;
	const decisions: HITLDecision[] = state.hitlInterrupt.action_requests.map(() => ({
		type: 'approve' as const
	}));
	await resumeWithDecisions(decisions, localThreadId);
}

async function rejectAllActions(threadId?: string): Promise<void> {
	const localThreadId = threadId || currentLocalThreadId;
	if (!localThreadId) return;
	const state = getThreadState(localThreadId);
	if (!state.hitlInterrupt) return;
	const decisions: HITLDecision[] = state.hitlInterrupt.action_requests.map(() => ({
		type: 'reject' as const
	}));
	await resumeWithDecisions(decisions, localThreadId);
}

function dismissHITLInterrupt(): void {
	if (currentState && currentLocalThreadId) {
		currentState.hitlInterrupt = null;
		currentState.hitlInterruptId = null;
		currentState.awaitingHumanResponse = false;
		updateThreadStatus(currentLocalThreadId);
	}
}

// =============================================================================
// CLARIFICATION RESPONSE
// =============================================================================

async function resumeWithClarificationResponse(
	response: ClarificationResponse,
	threadId?: string
): Promise<void> {
	const localThreadId = threadId || currentLocalThreadId;
	if (!localThreadId) return;
	const state = getThreadState(localThreadId);

	if (!state.clarificationInterrupt || !state.langGraphThreadId || !state.hitlInterruptId) {
		console.error('[SynthAgent] No pending clarification interrupt to respond to');
		return;
	}

	const interrupt = state.clarificationInterrupt;
	const thread = synthThreadStore.threads.find((t) => t.id === localThreadId);
	const assistantId = thread?.assistantId || 'deepresearch';

	state.clarificationInterrupt = null;
	state.hitlInterrupt = null;
	state.hitlInterruptId = null;
	state.awaitingHumanResponse = false;
	state.isStreaming = true;
	state.isInterrupted = false;
	updateThreadStatus(localThreadId);

	let responseContent: string;
	if (interrupt.tool === 'ask_user') {
		responseContent = response.response || '';
	} else {
		responseContent = JSON.stringify({
			selected: response.selected || [],
			freeform: response.freeform
		});
	}

	const toolResult = [
		{
			tool_call_id: interrupt.tool_call_id,
			content: responseContent
		}
	];

	try {
		const agentUrl = settingsStore.agentUrl;

		const resumeResponse = await fetch(`${agentUrl}/threads/${state.langGraphThreadId}/runs/stream`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				assistant_id: assistantId,
				interrupt_id: state.hitlInterruptId,
				resume: { tool_results: toolResult },
				stream_mode: ['messages', 'values']
			})
		});

		if (!resumeResponse.ok) {
			throw new Error(`Resume failed: ${resumeResponse.status}`);
		}

		// Process streaming response
		if (resumeResponse.body) {
			const reader = resumeResponse.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.startsWith('data:')) {
						const data = line.slice(5).trim();
						if (!data || data === '[DONE]') continue;

						try {
							const parsed = JSON.parse(data);
							if (parsed.messages && Array.isArray(parsed.messages)) {
								state.langGraphMessages = parsed.messages;
							}
						} catch {
							// Skip
						}
					}
				}
			}
		}

		const convertedMessages = convertLangGraphMessages(state.langGraphMessages, localThreadId);
		synthThreadStore.syncMessages(localThreadId, convertedMessages);

		state.isStreaming = false;
		state.isInterrupted = false;
		state.pendingToolCalls = [];
		state.streamingContent = '';
		updateThreadStatus(localThreadId);
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		state.error = errorMessage;
		state.isStreaming = false;
		state.isInterrupted = false;
		state.awaitingHumanResponse = false;
		updateThreadStatus(localThreadId);
	}
}

// =============================================================================
// STREAM CONTROL
// =============================================================================

async function stopStreaming(threadId?: string): Promise<void> {
	const localThreadId = threadId || currentLocalThreadId;
	if (!localThreadId) return;
	const state = getThreadState(localThreadId);

	// TODO: Implement cancel via LangGraph API

	state.isStreaming = false;
	state.isInterrupted = false;
	updateThreadStatus(localThreadId);
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function clearError(): void {
	if (currentState) currentState.error = null;
}

function resetStream(): void {
	if (currentLocalThreadId) {
		const state = getThreadState(currentLocalThreadId);
		state.isStreaming = false;
		state.isInterrupted = false;
		state.langGraphThreadId = null;
		state.error = null;
		state.hitlInterrupt = null;
		state.hitlInterruptId = null;
		state.awaitingHumanResponse = false;
		state.clientToolInterrupt = null;
		state.clarificationInterrupt = null;
		state.todos = [];
		state.pendingToolCalls = [];
		state.streamingContent = '';
		state.langGraphMessages = [];
		updateThreadStatus(currentLocalThreadId);
	}
}

function clearProjectState(): void {
	for (const tid in runStates) {
		delete runStates[tid];
	}
}

// =============================================================================
// EXPORTS
// =============================================================================

export const synthAgentStore = {
	// Reactive getters
	get streamingContent() {
		return currentState?.streamingContent || '';
	},
	get isStreaming() {
		return currentState?.isStreaming || false;
	},
	get isInterrupted() {
		return currentState?.isInterrupted || false;
	},
	get pendingToolCalls() {
		return currentState?.pendingToolCalls || [];
	},
	get error() {
		return currentState?.error || null;
	},
	get threadId() {
		return currentState?.langGraphThreadId || null;
	},
	get localThreadId() {
		return currentLocalThreadId;
	},
	get langGraphMessages() {
		return currentState?.langGraphMessages || [];
	},

	// Human-in-the-loop getters
	get hitlInterrupt() {
		return currentState?.hitlInterrupt || null;
	},
	get awaitingHumanResponse() {
		return currentState?.awaitingHumanResponse || false;
	},
	get clientToolInterrupt() {
		return currentState?.clientToolInterrupt || null;
	},
	get clarificationInterrupt() {
		return currentState?.clarificationInterrupt || null;
	},

	// Todos
	get todos() {
		return currentState?.todos || [];
	},

	// Get reactive state for any thread
	getRunState,

	// Actions
	sendMessage,
	stopStreaming,
	clearError,
	resetStream,

	// Human-in-the-loop actions
	resumeWithDecisions,
	approveAllActions,
	rejectAllActions,
	dismissHITLInterrupt,

	// Clarification actions
	resumeWithClarificationResponse,

	// Project state
	clearProjectState
};

