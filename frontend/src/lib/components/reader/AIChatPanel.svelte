<script lang="ts">
	import { onMount } from 'svelte';
	import { ArrowLeft, Bot, Send, X } from '@lucide/svelte';
	import type { Annotation } from '$lib/types';

	interface ChatMessage {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		timestamp: Date;
	}

	interface Props {
		annotations: Annotation[];
		onClose: () => void;
		onNavigate: (annotation: Annotation) => void;
		initialAnnotation?: Annotation; // Open directly to chat with this annotation
	}

	let { annotations, onClose, onNavigate, initialAnnotation }: Props = $props();
	let panelElement: HTMLDivElement;

	// Filter annotations that have notes (used as AI context)
	const aiContextAnnotations = $derived(
		annotations.filter(a => a.note)
	);

	// View state: 'list' shows annotation contexts, 'chat' shows conversation
	let currentView = $state<'list' | 'chat'>(initialAnnotation ? 'chat' : 'list');
	let selectedAnnotation = $state<Annotation | null>(initialAnnotation || null);
	let chatMessages = $state<ChatMessage[]>([]);
	let inputMessage = $state('');
	let isLoading = $state(false);

	// Initialize chat if opened with an annotation
	$effect(() => {
		if (initialAnnotation && chatMessages.length === 0) {
			chatMessages = [{
				id: crypto.randomUUID(),
				role: 'assistant',
				content: `I'm ready to discuss this passage:\n\n"${initialAnnotation.text}"\n\n${initialAnnotation.note ? `Your note: ${initialAnnotation.note}` : ''}\n\nWhat would you like to know?`,
				timestamp: new Date()
			}];
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
		// Initialize with context message
		chatMessages = [{
			id: crypto.randomUUID(),
			role: 'assistant',
			content: `I'm ready to discuss this passage:\n\n"${annotation.text}"\n\n${annotation.note ? `Your note: ${annotation.note}` : ''}\n\nWhat would you like to know?`,
			timestamp: new Date()
		}];
	}

	function goBackToList() {
		currentView = 'list';
		selectedAnnotation = null;
		chatMessages = [];
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
		inputMessage = '';
		isLoading = true;

		// Simulate AI response (placeholder - will be replaced with actual API call)
		setTimeout(() => {
			const aiResponse: ChatMessage = {
				id: crypto.randomUUID(),
				role: 'assistant',
				content: 'This is a placeholder response. AI integration coming soon! The actual implementation will use your preferred AI service to discuss the selected passage.',
				timestamp: new Date()
			};
			chatMessages = [...chatMessages, aiResponse];
			isLoading = false;
		}, 1000);
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
						<p class="text-sm line-clamp-2 mb-1">
							"{annotation.text.slice(0, 80)}{annotation.text.length > 80 ? '...' : ''}"
						</p>
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

		<!-- Chat messages -->
		<div class="flex-1 overflow-y-auto p-4 space-y-4">
			{#each chatMessages as message (message.id)}
				<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
					<div class="max-w-[85%] rounded-lg px-3 py-2 {message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}">
						<p class="text-sm whitespace-pre-wrap">{message.content}</p>
					</div>
				</div>
			{/each}
			{#if isLoading}
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
