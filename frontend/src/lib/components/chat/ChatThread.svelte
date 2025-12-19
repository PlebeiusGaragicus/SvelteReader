<script lang="ts">
	import { onMount } from 'svelte';
	import type { Message } from '@langchain/langgraph-sdk';
	import { Bot, X, ChevronLeft, SquarePen, AlertCircle } from '@lucide/svelte';
	import { cyphertap } from 'cyphertap';
	import { useChatStore } from '$lib/stores/chat.svelte';
	import { useWalletStore } from '$lib/stores/wallet.svelte';
	import { checkHealth } from '$lib/services/langgraph';
	import { DO_NOT_RENDER_ID_PREFIX } from '$lib/types/chat';
	import type { PassageContext, PaymentInfo } from '$lib/types/chat';
	import ChatInput from './ChatInput.svelte';
	import HumanMessage from './messages/HumanMessage.svelte';
	import AssistantMessage from './messages/AssistantMessage.svelte';
	import ChatHistory from './ChatHistory.svelte';

	type ViewMode = 'chat' | 'history';

	interface Props {
		onClose?: () => void;
		passageContext?: PassageContext;
		showHistory?: boolean;
		initialThreadId?: string;
		onThreadChange?: (threadId: string | null) => void;
		onThreadDelete?: (threadId: string) => void;
		generatePayment?: () => Promise<PaymentInfo | null>;
	}

	let { onClose, passageContext, showHistory = true, initialThreadId, onThreadChange, onThreadDelete, generatePayment }: Props = $props();

	const chat = useChatStore();
	const wallet = useWalletStore();

	let messagesContainer = $state<HTMLDivElement | null>(null);
	let currentView = $state<ViewMode>('chat');
	let hideToolCalls = $state(false);
	let backendAvailable = $state<boolean | null>(null);

	// Filter messages that should be rendered
	const visibleMessages = $derived(
		chat.messages.filter(m => !m.id?.startsWith(DO_NOT_RENDER_ID_PREFIX))
	);

	// Check backend health on mount and set up refund callback
	onMount(() => {
		checkHealth().then(available => {
			backendAvailable = available;
		});

		// Load threads list
		chat.loadThreads();

		// Load initial thread if provided
		if (initialThreadId) {
			chat.loadThread(initialThreadId);
		}
		
		// Set up refund callback for payment recovery
		// This allows the chat store to refund tokens via CypherTap on errors
		chat.setRefundCallback(async (token: string) => {
			try {
				console.log('[ChatThread] Attempting to refund token via CypherTap');
				const result = await cyphertap.receiveEcashToken(token);
				console.log(`[ChatThread] Refund successful: ${result.amount} sats returned`);
				return result.success;
			} catch (e) {
				console.error('[ChatThread] Refund failed:', e);
				return false;
			}
		});
		
		// Check for any pending payments that need recovery (e.g., from previous session)
		chat.recoverPendingPayment();
	});

	// Notify parent when thread changes
	$effect(() => {
		if (onThreadChange && chat.threadId !== undefined) {
			onThreadChange(chat.threadId);
		}
	});

	// Auto-scroll to bottom when messages change
	$effect(() => {
		if (messagesContainer && chat.messages.length > 0) {
			// Small delay to ensure DOM is updated
			requestAnimationFrame(() => {
				if (messagesContainer) {
					messagesContainer.scrollTop = messagesContainer.scrollHeight;
				}
			});
		}
	});

	async function handleSubmit(content: string) {
		await chat.submit(content, {
			context: passageContext,
			generatePayment,
		});
	}

	function handleRegenerate() {
		// TODO: Implement regeneration with checkpoint
		console.log('Regenerate not yet implemented');
	}

	function handleNewThread() {
		chat.newThread();
		currentView = 'chat';
		onThreadChange?.(null);
	}

	function handleSelectThread(threadId: string) {
		chat.loadThread(threadId);
		currentView = 'chat';
	}

	function handleDeleteThread(threadId: string) {
		chat.deleteThread(threadId);
		// Notify parent to clean up any annotations linked to this thread
		onThreadDelete?.(threadId);
	}

	function goToHistory() {
		currentView = 'history';
	}

	function goToChat() {
		currentView = 'chat';
	}
</script>

<div class="flex h-full flex-col bg-background">
	{#if currentView === 'history'}
		<!-- History View -->
		<div class="flex items-center justify-between border-b border-border px-4 py-3">
			<div class="flex items-center gap-2">
				<h2 class="font-semibold">Chat History</h2>
			</div>

			<div class="flex items-center gap-2">
				<button
					onclick={handleNewThread}
					class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
					title="New conversation"
				>
					<SquarePen class="h-4 w-4" />
				</button>
				
				{#if onClose}
					<button
						onclick={onClose}
						class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
						title="Close"
					>
						<X class="h-4 w-4" />
					</button>
				{/if}
			</div>
		</div>

		<div class="flex-1 overflow-hidden">
			<ChatHistory
				threads={chat.threads}
				currentThreadId={chat.threadId}
				onSelectThread={handleSelectThread}
				onDeleteThread={handleDeleteThread}
				onNewThread={handleNewThread}
			/>
		</div>
	{:else}
		<!-- Chat View -->
		<div class="flex items-center justify-between border-b border-border px-4 py-3">
			<div class="flex items-center gap-2">
				{#if showHistory}
					<button
						onclick={goToHistory}
						class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
						title="View chat history"
					>
						<ChevronLeft class="h-4 w-4" />
					</button>
				{/if}
				
				<div class="flex items-center gap-2">
					<Bot class="h-5 w-5 text-primary" />
					<h2 class="font-semibold">AI Chat</h2>
				</div>
			</div>

			<div class="flex items-center gap-2">
				<button
					onclick={handleNewThread}
					class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
					title="New conversation"
				>
					<SquarePen class="h-4 w-4" />
				</button>
				
				{#if onClose}
					<button
						onclick={onClose}
						class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
						title="Close"
					>
						<X class="h-4 w-4" />
					</button>
				{/if}
			</div>
		</div>

		<div class="flex flex-1 flex-col overflow-hidden">
			<!-- Backend status warning -->
			{#if backendAvailable === false}
				<div class="mx-4 mt-2 flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-amber-600 dark:text-amber-400">
					<AlertCircle class="h-4 w-4 flex-shrink-0" />
					<p class="text-xs">LangGraph server unavailable. Start the server to enable AI chat.</p>
				</div>
			{/if}

			<!-- Passage Context Display -->
			{#if passageContext}
				<div class="mx-4 mt-2 rounded-lg border border-border bg-muted/50 p-3">
					<p class="mb-1 text-xs font-medium text-muted-foreground">Context:</p>
					<p class="line-clamp-2 text-sm">"{passageContext.text}"</p>
					{#if passageContext.note}
						<p class="mt-1 text-xs text-muted-foreground">Note: {passageContext.note}</p>
					{/if}
				</div>
			{/if}

			<!-- Messages -->
			<div
				bind:this={messagesContainer}
				class="flex-1 overflow-y-auto px-4 py-4"
			>
				{#if visibleMessages.length === 0}
					<div class="flex h-full flex-col items-center justify-center text-center">
						<Bot class="mb-4 h-12 w-12 text-muted-foreground/50" />
						<p class="text-sm text-muted-foreground">
							{passageContext 
								? 'Ask a question about this passage...'
								: 'Start a conversation...'}
						</p>
					</div>
				{:else}
					<div class="mx-auto flex max-w-3xl flex-col gap-4">
						{#each visibleMessages as message, index (message.id || index)}
							{#if message.type === 'human'}
								<HumanMessage {message} />
							{:else if message.type === 'ai'}
								<AssistantMessage
									{message}
									isLoading={chat.isLoading}
									isStreaming={chat.isStreaming && index === visibleMessages.length - 1}
									onRegenerate={index === visibleMessages.length - 1 ? handleRegenerate : undefined}
									{hideToolCalls}
								/>
							{/if}
						{/each}

						{#if chat.isLoading && !chat.isStreaming}
							<div class="flex justify-start gap-3">
								<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
									<Bot class="h-4 w-4 text-muted-foreground" />
								</div>
								<div class="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
									<div class="flex gap-1">
										<span class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style="animation-delay: 0ms"></span>
										<span class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style="animation-delay: 150ms"></span>
										<span class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style="animation-delay: 300ms"></span>
									</div>
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Error Display -->
			{#if chat.error}
				<div class="mx-4 mb-2 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-destructive">
					<AlertCircle class="h-4 w-4 flex-shrink-0" />
					<p class="flex-1 text-xs">{chat.error}</p>
					<button
						onclick={() => chat.clearError()}
						class="text-xs underline hover:no-underline"
					>
						Dismiss
					</button>
				</div>
			{/if}

			<!-- Input -->
			<div class="border-t border-border p-4">
				<ChatInput
					onSubmit={handleSubmit}
					onStop={() => chat.stop()}
					isLoading={chat.isLoading}
					disabled={backendAvailable === false}
					placeholder={passageContext ? 'Ask about this passage...' : 'Type your message...'}
					balance={wallet.isLoggedIn ? wallet.balance : undefined}
					messageCost={wallet.messageCostSats}
				/>
			</div>
		</div>
	{/if}
</div>
