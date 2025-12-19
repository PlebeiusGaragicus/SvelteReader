<script lang="ts">
	import { onMount } from 'svelte';
	import { ArrowLeft, Bot, Send, X, AlertCircle, MessageSquare } from '@lucide/svelte';
	import type { Annotation } from '$lib/types';
	import { sendMessageStream, checkBackendHealth, getThreadHistory, type PassageContext } from '$lib/services/chatService';

	interface ChatMessage {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		timestamp: Date;
		isStreaming?: boolean;
	}

	interface Props {
		annotations: Annotation[];
		onClose: () => void;
		onNavigate: (annotation: Annotation) => void;
		onUpdateAnnotation?: (annotationId: string, updates: Partial<Annotation>) => void;
		initialAnnotation?: Annotation; // Open directly to chat with this annotation
		bookTitle?: string;
	}

	let { annotations, onClose, onNavigate, onUpdateAnnotation, initialAnnotation, bookTitle }: Props = $props();
	let panelElement: HTMLDivElement;
	let messagesContainer = $state<HTMLDivElement | null>(null);

	// Filter annotations that have notes (used as AI context)
	const aiContextAnnotations = $derived(
		annotations.filter(a => a.note)
	);

	// Derive initial view and annotation from props
	const initialView = $derived(initialAnnotation ? 'chat' : 'list');
	const initialSelected = $derived(initialAnnotation || null);

	// View state: 'list' shows annotation contexts, 'chat' shows conversation
	let currentView = $state<'list' | 'chat'>('list');
	let selectedAnnotation = $state<Annotation | null>(null);

	// Sync with initial values when they change
	$effect(() => {
		currentView = initialView;
		selectedAnnotation = initialSelected;
	});
	let chatMessages = $state<ChatMessage[]>([]);
	let inputMessage = $state('');
	let isLoading = $state(false);
	let threadId = $state<string | null>(null);
	let backendAvailable = $state<boolean | null>(null);
	let streamingContent = $state('');
	let isLoadingHistory = $state(false);

	// Check backend availability on mount
	onMount(() => {
		checkBackendHealth().then(available => {
			backendAvailable = available;
		});
	});

	// Initialize chat if opened with an annotation
	$effect(() => {
		if (initialAnnotation && chatMessages.length === 0 && !isLoadingHistory) {
			// Look up the latest version of the annotation from the store
			// to get any updated chatThreadId
			const latestAnnotation = annotations.find(a => a.id === initialAnnotation.id) || initialAnnotation;
			loadChatForAnnotation(latestAnnotation);
		}
	});

	// Load chat history for an annotation (if it has an existing thread)
	async function loadChatForAnnotation(annotation: Annotation) {
		threadId = annotation.chatThreadId || null;

		if (annotation.chatThreadId) {
			// Load existing chat history
			isLoadingHistory = true;
			try {
				const history = await getThreadHistory(annotation.chatThreadId);
				if (history.length > 0) {
					chatMessages = history.map(msg => ({
						id: msg.id || crypto.randomUUID(),
						role: msg.role as 'user' | 'assistant',
						content: msg.content,
						timestamp: new Date()
					}));
					isLoadingHistory = false;
					return;
				}
			} catch (error) {
				console.error('Failed to load chat history:', error);
				// Thread may have been deleted, clear the reference
				threadId = null;
			}
			isLoadingHistory = false;
		}

		// No existing history, show welcome message
		chatMessages = [{
			id: crypto.randomUUID(),
			role: 'assistant',
			content: `I'm ready to discuss this passage:\n\n"${annotation.text}"\n\n${annotation.note ? `Your note: ${annotation.note}` : ''}\n\nWhat would you like to know?`,
			timestamp: new Date()
		}];
	}

	// Auto-scroll to bottom when messages change
	$effect(() => {
		if (messagesContainer && chatMessages.length > 0) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	});

	// Click outside to close
	function handleClickOutside(event: MouseEvent) {
		if (panelElement && !panelElement.contains(event.target as Node)) {
			onClose();
		}
	}

	onMount(() => {
		const timeout = setTimeout(() => {
			document.addEventListener('click', handleClickOutside);
		}, 100);
		
		return () => {
			clearTimeout(timeout);
			document.removeEventListener('click', handleClickOutside);
		};
	});

	function openChat(annotation: Annotation) {
		selectedAnnotation = annotation;
		currentView = 'chat';
		chatMessages = [];
		loadChatForAnnotation(annotation);
	}

	function goBackToList() {
		currentView = 'list';
		selectedAnnotation = null;
		chatMessages = [];
		threadId = null;
		streamingContent = '';
	}

	async function sendMessage() {
		if (!inputMessage.trim() || isLoading) return;

		const userMessage: ChatMessage = {
			id: crypto.randomUUID(),
			role: 'user',
			content: inputMessage.trim(),
			timestamp: new Date()
		};

		chatMessages = [...chatMessages, userMessage];
		const messageContent = inputMessage.trim();
		inputMessage = '';
		isLoading = true;
		streamingContent = '';

		// Build passage context from selected annotation
		const passageContext: PassageContext | undefined = selectedAnnotation
			? {
					text: selectedAnnotation.text,
					note: selectedAnnotation.note,
					bookTitle: bookTitle,
					chapter: selectedAnnotation.chapter,
				}
			: undefined;

		// Add placeholder for streaming response
		const streamingMessageId = crypto.randomUUID();
		chatMessages = [...chatMessages, {
			id: streamingMessageId,
			role: 'assistant',
			content: '',
			timestamp: new Date(),
			isStreaming: true
		}];

		try {
			const result = await sendMessageStream(
				{
					content: messageContent,
					threadId: threadId || undefined,
					passageContext,
				},
				// onToken - update streaming content
				(token) => {
					streamingContent += token;
					// Update the streaming message
					chatMessages = chatMessages.map(msg =>
						msg.id === streamingMessageId
							? { ...msg, content: streamingContent }
							: msg
					);
				},
				// onComplete
				(fullContent, messageId) => {
					// Finalize the message
					chatMessages = chatMessages.map(msg =>
						msg.id === streamingMessageId
							? { ...msg, content: fullContent || streamingContent, isStreaming: false }
							: msg
					);
					isLoading = false;
					streamingContent = '';
				},
				// onError
				(error) => {
					// Remove streaming message and show error
					chatMessages = chatMessages.filter(msg => msg.id !== streamingMessageId);
					chatMessages = [...chatMessages, {
						id: crypto.randomUUID(),
						role: 'assistant',
						content: `Sorry, I encountered an error: ${error}. Please try again.`,
						timestamp: new Date()
					}];
					isLoading = false;
					streamingContent = '';
				}
			);

			// Store thread ID for conversation continuity
			if (result.threadId && result.threadId !== threadId) {
				threadId = result.threadId;
				// Persist thread ID to the annotation for future sessions
				if (selectedAnnotation && onUpdateAnnotation) {
					onUpdateAnnotation(selectedAnnotation.id, { chatThreadId: result.threadId });
				}
			}
		} catch (error) {
			// Fallback error handling
			chatMessages = chatMessages.filter(msg => msg.id !== streamingMessageId);
			chatMessages = [...chatMessages, {
				id: crypto.randomUUID(),
				role: 'assistant',
				content: `Sorry, I couldn't connect to the AI service. Please make sure the backend is running.`,
				timestamp: new Date()
			}];
			isLoading = false;
			streamingContent = '';
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}
</script>

<div 
	bind:this={panelElement}
	class="ai-chat-panel absolute inset-y-0 right-0 top-[53px] z-10 w-96 border-l border-border bg-card shadow-lg flex flex-col"
>
	{#if currentView === 'list'}
		<!-- Annotation Context List View -->
		<div class="flex items-center justify-between border-b border-border p-4">
			<div class="flex items-center gap-2">
				<Bot class="h-5 w-5 text-blue-500" />
				<h2 class="font-semibold">AI Chat Contexts</h2>
			</div>
			<button
				onclick={onClose}
				class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
				aria-label="Close AI chat panel"
			>
				<X class="h-4 w-4" />
			</button>
		</div>
		
		<div class="flex-1 overflow-y-auto p-2">
			{#if aiContextAnnotations.length === 0}
				<div class="flex flex-col items-center justify-center h-full text-center p-4">
					<Bot class="h-12 w-12 text-muted-foreground/50 mb-4" />
					<p class="text-sm text-muted-foreground">
						No annotations with notes yet.
					</p>
					<p class="text-xs text-muted-foreground mt-2">
						Add notes to your highlights to use them as AI chat context.
					</p>
				</div>
			{:else}
				<p class="text-xs text-muted-foreground px-2 pb-2">
					{aiContextAnnotations.length} annotation{aiContextAnnotations.length === 1 ? '' : 's'} with notes
				</p>
				{#each aiContextAnnotations as annotation (annotation.id)}
					<button
						onclick={(e) => { e.stopPropagation(); openChat(annotation); }}
						class="w-full rounded-lg border border-border p-3 mb-2 text-left hover:bg-accent transition-colors"
					>
						<div class="flex items-start justify-between gap-2">
							<p class="text-sm line-clamp-2 mb-1 flex-1">
								"{annotation.text.slice(0, 80)}{annotation.text.length > 80 ? '...' : ''}"
							</p>
							{#if annotation.chatThreadId}
								<span title="Has chat history">
									<MessageSquare class="h-4 w-4 text-blue-500 flex-shrink-0" />
								</span>
							{/if}
						</div>
						{#if annotation.note}
							<p class="text-xs text-muted-foreground line-clamp-1">
								Note: {annotation.note}
							</p>
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	{:else}
		<!-- Chat View -->
		<div class="flex items-center gap-2 border-b border-border p-4">
			<button
				onclick={goBackToList}
				class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
				aria-label="Back to list"
			>
				<ArrowLeft class="h-4 w-4" />
			</button>
			<div class="flex-1 min-w-0">
				<h2 class="font-semibold text-sm truncate">AI Chat</h2>
				{#if selectedAnnotation}
					<button
						onclick={() => selectedAnnotation && onNavigate(selectedAnnotation)}
						class="text-xs text-muted-foreground hover:text-foreground truncate block"
					>
						"{selectedAnnotation.text.slice(0, 30)}..."
					</button>
				{/if}
			</div>
			<button
				onclick={onClose}
				class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
				aria-label="Close"
			>
				<X class="h-4 w-4" />
			</button>
		</div>

		<!-- Backend status warning -->
		{#if backendAvailable === false}
			<div class="mx-4 mt-2 flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-amber-600 dark:text-amber-400">
				<AlertCircle class="h-4 w-4 flex-shrink-0" />
				<p class="text-xs">Backend unavailable. Start the server to enable AI chat.</p>
			</div>
		{/if}

		<!-- Chat messages -->
		<div bind:this={messagesContainer} class="flex-1 overflow-y-auto p-4 space-y-4">
			{#each chatMessages as message (message.id)}
				<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
					<div class="max-w-[85%] rounded-lg px-3 py-2 {message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}">
						<p class="text-sm whitespace-pre-wrap">{message.content || (message.isStreaming ? '...' : '')}</p>
					</div>
				</div>
			{/each}
			{#if isLoading && !chatMessages.some(m => m.isStreaming)}
				<div class="flex justify-start">
					<div class="bg-muted rounded-lg px-3 py-2">
						<div class="flex gap-1">
							<span class="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
							<span class="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
							<span class="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Input area -->
		<div class="border-t border-border p-4">
			<div class="flex gap-2">
				<textarea
					bind:value={inputMessage}
					onkeydown={handleKeydown}
					placeholder="Ask about this passage..."
					class="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
					rows="2"
					disabled={isLoading}
				></textarea>
				<button
					onclick={sendMessage}
					disabled={!inputMessage.trim() || isLoading}
					class="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
					aria-label="Send message"
				>
					<Send class="h-4 w-4" />
				</button>
			</div>
		</div>
	{/if}
</div>
