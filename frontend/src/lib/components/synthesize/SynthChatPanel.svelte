<script lang="ts">
	import { Send, Bot, Loader2, AlertCircle, Check, X, HelpCircle, ArrowUp, Square } from '@lucide/svelte';
	import { tick } from 'svelte';
	import { cyphertap } from 'cyphertap';
	import {
		synthThreadStore,
		synthAgentStore,
		synthProjectStore,
		type ClarificationResponse
	} from '$lib/stores/synthesize';
	import { MarkdownRenderer } from '$lib/components/chat';

	interface Props {
		threadId?: string | null;
	}

	let { threadId = null }: Props = $props();

	// =============================================================================
	// LOCAL STATE
	// =============================================================================

	let messageInput = $state('');
	let messagesContainer = $state<HTMLDivElement | undefined>(undefined);
	let isSubmitting = $state(false);
	let selectedChoices = $state<string[]>([]);

	// =============================================================================
	// REACTIVE DERIVATIONS
	// =============================================================================

	const effectiveThreadId = $derived(threadId ?? synthThreadStore.currentThreadId);
	const currentThread = $derived(
		effectiveThreadId ? synthThreadStore.threads.find((t) => t.id === effectiveThreadId) : null
	);
	const currentProjectId = $derived(synthProjectStore.currentProjectId);
	const isWalletReady = $derived(cyphertap.isReady);
	const persistedMessages = $derived(
		effectiveThreadId ? synthThreadStore.getMessages(effectiveThreadId) : []
	);

	// Agent store derivations
	const runState = $derived(effectiveThreadId ? synthAgentStore.getRunState(effectiveThreadId) : null);
	const isStreaming = $derived(runState?.isStreaming || false);
	const isInterrupted = $derived(runState?.isInterrupted || false);
	const streamingContent = $derived(runState?.streamingContent || '');
	const awaitingHumanResponse = $derived(runState?.awaitingHumanResponse || false);
	const langGraphMessages = $derived(runState?.langGraphMessages || []);

	// Interrupt state
	const hitlInterrupt = $derived(runState?.hitlInterrupt || null);
	const clarificationInterrupt = $derived(runState?.clarificationInterrupt || null);

	type InputMode = 'normal' | 'hitl' | 'clarification' | 'choices';

	const inputMode = $derived.by((): InputMode => {
		if (!awaitingHumanResponse) return 'normal';

		if (clarificationInterrupt) {
			if (
				clarificationInterrupt.tool === 'ask_choices' &&
				Array.isArray(clarificationInterrupt.options) &&
				clarificationInterrupt.options.length > 0
			) {
				return 'choices';
			}
			return 'clarification';
		}

		if (hitlInterrupt) {
			return 'hitl';
		}

		return 'normal';
	});

	const inputPlaceholder = $derived.by(() => {
		switch (inputMode) {
			case 'hitl':
				return 'Optional: Provide feedback or edits for the agent...';
			case 'clarification':
				return 'Type your response...';
			case 'choices':
				return 'Select an option above or type your own response...';
			default:
				return 'What would you like to research?';
		}
	});

	const canSubmit = $derived.by(() => {
		if (isStreaming) return false;

		switch (inputMode) {
			case 'hitl':
				return true;
			case 'clarification':
				return messageInput.trim().length > 0;
			case 'choices':
				return selectedChoices.length > 0 || messageInput.trim().length > 0;
			default:
				return messageInput.trim().length > 0 && (currentThread !== null || currentProjectId !== null);
		}
	});

	// Show streaming bubble only when there's new content
	const showStreamingBubble = $derived.by(() => {
		if (!isStreaming || !streamingContent) return false;

		const lastHumanIdx = persistedMessages.findLastIndex((m) => m.role === 'user');
		const lastAiAfterHuman = persistedMessages.findLast(
			(m, i) => m.role === 'assistant' && i > lastHumanIdx
		);

		if (lastAiAfterHuman && lastAiAfterHuman.content) {
			if (
				lastAiAfterHuman.content.length > 0 &&
				streamingContent.startsWith(lastAiAfterHuman.content.slice(0, 20))
			) {
				return false;
			}
		}

		return true;
	});

	const showThinkingIndicator = $derived.by(() => {
		return isStreaming && !isInterrupted && persistedMessages.length === 0 && !streamingContent;
	});

	// =============================================================================
	// EFFECTS
	// =============================================================================

	// Reset input state when interrupt changes
	$effect(() => {
		if (clarificationInterrupt || hitlInterrupt) {
			selectedChoices = [];
		}
	});

	// Auto-scroll
	$effect(() => {
		const _msgs = persistedMessages.length;
		const _streaming = streamingContent;

		tick().then(() => {
			if (messagesContainer) {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			}
		});
	});

	// =============================================================================
	// HANDLERS
	// =============================================================================

	function toggleChoice(optionId: string) {
		if (!clarificationInterrupt) return;

		if (clarificationInterrupt.allow_multiple) {
			if (selectedChoices.includes(optionId)) {
				selectedChoices = selectedChoices.filter((id) => id !== optionId);
			} else {
				selectedChoices = [...selectedChoices, optionId];
			}
		} else {
			if (selectedChoices.includes(optionId)) {
				selectedChoices = [];
			} else {
				selectedChoices = [optionId];
			}
		}
	}

	async function handleSendMessage() {
		if (!messageInput.trim() || isStreaming) return;

		const message = messageInput.trim();
		messageInput = '';

		let targetThreadId = effectiveThreadId;
		if (!targetThreadId && currentProjectId) {
			const initialTitle = message.length > 25 ? message.slice(0, 25) + '...' : message;
			const thread = synthThreadStore.createThread(currentProjectId, initialTitle);
			targetThreadId = thread.id;
		}

		if (!targetThreadId) return;

		const thread = synthThreadStore.threads.find((t) => t.id === targetThreadId);
		const langGraphThreadId = thread?.langGraphThreadId ?? null;

		// Update thread title if generic
		if (thread?.title === 'New Chat' || thread?.title === 'New Thread') {
			const titlePreview = message.length > 25 ? message.slice(0, 25) + '...' : message;
			synthThreadStore.updateThread(targetThreadId, { title: titlePreview });
		}

		try {
			const result = await synthAgentStore.sendMessage(message, langGraphThreadId, targetThreadId);
			if (!langGraphThreadId && result.langGraphThreadId) {
				synthThreadStore.updateThread(targetThreadId, { langGraphThreadId: result.langGraphThreadId });
			}
		} catch (error) {
			console.error('Failed to send message:', error);
		}
	}

	async function handleClarificationSubmit() {
		if (!clarificationInterrupt || !effectiveThreadId) return;
		isSubmitting = true;

		try {
			if (clarificationInterrupt.tool === 'ask_user') {
				const response: ClarificationResponse = { response: messageInput.trim() };
				await synthAgentStore.resumeWithClarificationResponse(response, effectiveThreadId);
			} else {
				const response: ClarificationResponse = {
					selected: selectedChoices.length > 0 ? selectedChoices : undefined,
					freeform: messageInput.trim() || undefined
				};
				await synthAgentStore.resumeWithClarificationResponse(response, effectiveThreadId);
			}
			messageInput = '';
			selectedChoices = [];
		} finally {
			isSubmitting = false;
		}
	}

	async function handleApprove() {
		if (!effectiveThreadId) return;
		isSubmitting = true;
		try {
			await synthAgentStore.approveAllActions(effectiveThreadId);
			messageInput = '';
		} finally {
			isSubmitting = false;
		}
	}

	async function handleReject() {
		if (!effectiveThreadId) return;
		isSubmitting = true;
		try {
			await synthAgentStore.rejectAllActions(effectiveThreadId);
			messageInput = '';
		} finally {
			isSubmitting = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	}

	function handleSubmit() {
		switch (inputMode) {
			case 'clarification':
			case 'choices':
				handleClarificationSubmit();
				break;
			case 'hitl':
				handleApprove();
				break;
			default:
				handleSendMessage();
		}
	}
</script>

<div class="flex h-full flex-col bg-zinc-900/30">
	<!-- Messages -->
	<div bind:this={messagesContainer} class="flex-1 space-y-4 overflow-y-auto p-4">
		{#if !currentThread}
			<div class="flex h-full items-center justify-center text-zinc-600">
				<div class="text-center">
					<Bot class="mx-auto mb-3 h-12 w-12 opacity-30" />
					<p class="text-sm">Send a message to start researching</p>
					<p class="mt-1 text-xs text-zinc-700">Or select an existing thread from the sidebar</p>
				</div>
			</div>
		{:else if persistedMessages.length === 0 && !isStreaming}
			<div class="flex h-full items-center justify-center text-zinc-600">
				<div class="text-center">
					<Bot class="mx-auto mb-3 h-12 w-12 opacity-30" />
					<p class="text-sm">What would you like to research?</p>
				</div>
			</div>
		{:else}
			{#each persistedMessages as message (message.id)}
				{@const isUser = message.role === 'user'}
				<div class="flex {isUser ? 'justify-end' : 'justify-start'}">
					<div
						class="max-w-[85%] rounded-xl px-4 py-2 {isUser
							? 'bg-violet-600 text-white'
							: 'bg-zinc-800 text-zinc-200'}"
					>
						{#if isUser}
							<p class="whitespace-pre-wrap text-sm">{message.content}</p>
						{:else}
							<MarkdownRenderer content={message.content} />
						{/if}
					</div>
				</div>
			{/each}

			{#if showStreamingBubble}
				<div class="flex justify-start">
					<div class="max-w-[85%] rounded-xl bg-zinc-800 px-4 py-2 text-zinc-200">
						<MarkdownRenderer content={streamingContent} />
					</div>
				</div>
			{/if}

			{#if showThinkingIndicator}
				<div class="flex justify-start">
					<div class="max-w-[85%] rounded-xl bg-zinc-800 px-4 py-2 text-zinc-400">
						<span class="animate-pulse text-sm">Researching...</span>
					</div>
				</div>
			{/if}
		{/if}
	</div>

	<!-- Input Area -->
	<div class="flex-shrink-0 bg-background p-4">
		<div class="mx-auto max-w-3xl">
			<!-- HITL Interrupt Card -->
			{#if inputMode === 'hitl' && hitlInterrupt}
				<div class="mb-4 rounded-lg border border-violet-500/30 bg-violet-500/10 p-4">
					<div class="flex items-center gap-2 text-sm font-medium text-violet-300">
						<AlertCircle class="h-4 w-4" />
						Agent needs approval for {hitlInterrupt.action_requests.length} action(s)
					</div>
					<div class="mt-2 space-y-1">
						{#each hitlInterrupt.action_requests as action}
							<p class="text-xs text-zinc-400">
								{action.name}: {action.description || JSON.stringify(action.args)}
							</p>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Clarification Card -->
			{#if (inputMode === 'clarification' || inputMode === 'choices') && clarificationInterrupt}
				<div class="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
					<div class="flex items-center gap-2 text-sm font-medium text-blue-300">
						<HelpCircle class="h-4 w-4" />
						Agent needs clarification
					</div>
					<p class="mt-2 text-sm text-zinc-300">{clarificationInterrupt.question}</p>

					{#if inputMode === 'choices' && Array.isArray(clarificationInterrupt.options)}
						<div class="mt-3 flex flex-wrap gap-2">
							{#each clarificationInterrupt.options as option}
								<button
									type="button"
									onclick={() => toggleChoice(option.id)}
									disabled={isSubmitting}
									class="rounded-full border px-3 py-1.5 text-xs transition-colors
                    {selectedChoices.includes(option.id)
										? 'border-blue-500 bg-blue-500/20 text-blue-200'
										: 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-blue-400'}"
								>
									{#if selectedChoices.includes(option.id)}
										<Check class="mr-1 inline h-3 w-3" />
									{/if}
									{option.label || option.id}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Input Form -->
			<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="flex gap-3">
				<textarea
					bind:value={messageInput}
					onkeydown={handleKeydown}
					placeholder={inputPlaceholder}
					disabled={isStreaming || (!currentThread && !currentProjectId)}
					class="flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
					rows="1"
				></textarea>

				<div class="flex shrink-0 gap-2">
					{#if inputMode === 'hitl'}
						<button
							onclick={handleReject}
							disabled={isSubmitting || isStreaming}
							type="button"
							class="rounded-xl bg-red-600/20 p-3 text-red-400 transition-colors hover:bg-red-600/30 disabled:opacity-50"
						>
							<X class="h-5 w-5" />
						</button>
						<button
							onclick={handleApprove}
							disabled={isSubmitting || isStreaming}
							type="button"
							class="rounded-xl bg-emerald-600 p-3 text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
						>
							<Check class="h-5 w-5" />
						</button>
					{:else if isStreaming}
						<button
							onclick={() => synthAgentStore.stopStreaming(effectiveThreadId)}
							disabled={!effectiveThreadId}
							type="button"
							class="rounded-xl bg-red-600 p-3 text-white transition-colors hover:bg-red-500 disabled:opacity-50"
						>
							<Square class="h-5 w-5 fill-current" />
						</button>
					{:else}
						<button
							type="submit"
							disabled={!canSubmit || isSubmitting}
							class="rounded-xl bg-violet-600 p-3 text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
						>
							<ArrowUp class="h-5 w-5" />
						</button>
					{/if}
				</div>
			</form>
		</div>
	</div>
</div>

