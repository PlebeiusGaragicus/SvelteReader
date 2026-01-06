<script lang="ts">
	import { HelpCircle, ArrowRight, Loader2, Check } from '@lucide/svelte';
	import type { ClarificationInterrupt, ClarificationResponse } from '$lib/services/deepresearch-langgraph';

	interface Props {
		interrupt: ClarificationInterrupt;
		onSubmit: (response: ClarificationResponse) => void;
		isSubmitting?: boolean;
		disabled?: boolean;
	}

	let {
		interrupt,
		onSubmit,
		isSubmitting = false,
		disabled = false,
	}: Props = $props();

	let textResponse = $state('');
	let selectedChoices = $state<string[]>([]);
	let textareaRef = $state<HTMLTextAreaElement | null>(null);

	const isChoicesMode = $derived(
		interrupt.tool === 'ask_choices' && 
		Array.isArray(interrupt.options) && 
		interrupt.options.length > 0
	);

	const canSubmit = $derived.by(() => {
		if (isSubmitting || disabled) return false;
		
		if (isChoicesMode) {
			// For choices: need at least one selection OR freeform text if allowed
			return selectedChoices.length > 0 || (interrupt.allow_freeform && textResponse.trim().length > 0);
		} else {
			// For ask_user: need text response
			return textResponse.trim().length > 0;
		}
	});

	function toggleChoice(optionId: string) {
		if (interrupt.allow_multiple) {
			if (selectedChoices.includes(optionId)) {
				selectedChoices = selectedChoices.filter(id => id !== optionId);
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

	function handleSubmit(e?: Event) {
		e?.preventDefault();
		if (!canSubmit) return;

		if (isChoicesMode) {
			onSubmit({
				selected: selectedChoices.length > 0 ? selectedChoices : undefined,
				freeform: textResponse.trim() || undefined,
			});
		} else {
			onSubmit({
				response: textResponse.trim(),
			});
		}

		textResponse = '';
		selectedChoices = [];
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			handleSubmit();
		}
	}

	function handleInput() {
		if (textareaRef) {
			textareaRef.style.height = 'auto';
			textareaRef.style.height = `${Math.min(textareaRef.scrollHeight, 150)}px`;
		}
	}

	// Focus input on mount
	$effect(() => {
		if (textareaRef && !isChoicesMode) {
			textareaRef.focus();
		}
	});
</script>

<div class="w-full max-w-2xl mx-auto">
	<div class="flex flex-col rounded-2xl border border-cyan-500/30 bg-cyan-500/5 shadow-lg shadow-cyan-500/5 overflow-hidden">
		<!-- Question Header -->
		<div class="flex items-start gap-3 px-5 py-4 border-b border-cyan-500/20 bg-cyan-500/10">
			<div class="flex-shrink-0 mt-0.5">
				<div class="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center">
					<HelpCircle class="w-4 h-4 text-cyan-400" />
				</div>
			</div>
			<div class="flex-1 min-w-0">
				<p class="text-sm font-medium text-cyan-300 mb-1">Agent needs clarification</p>
				<p class="text-base text-foreground leading-relaxed">{interrupt.question}</p>
			</div>
		</div>

		<!-- Choices (if ask_choices) -->
		{#if isChoicesMode && interrupt.options}
			<div class="px-5 py-4 border-b border-cyan-500/10">
				<div class="flex flex-wrap gap-2">
					{#each interrupt.options as option}
						<button
							type="button"
							onclick={() => toggleChoice(option.id)}
							disabled={isSubmitting || disabled}
							class="px-4 py-2 text-sm rounded-full border-2 transition-all duration-200 font-medium
								{selectedChoices.includes(option.id)
									? 'border-cyan-500 bg-cyan-500/20 text-cyan-200 shadow-sm shadow-cyan-500/20'
									: 'border-border/50 bg-secondary/50 hover:border-cyan-500/50 hover:bg-cyan-500/10 text-foreground/80'}"
						>
							{#if selectedChoices.includes(option.id)}
								<Check class="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
							{/if}
							{option.label || option.id}
						</button>
					{/each}
				</div>
				{#if interrupt.allow_multiple}
					<p class="text-xs text-muted-foreground mt-2">You can select multiple options</p>
				{/if}
			</div>
		{/if}

		<!-- Input Area -->
		<form onsubmit={handleSubmit} class="flex flex-col">
			<div class="px-5 pt-4 pb-2">
				<textarea
					bind:this={textareaRef}
					bind:value={textResponse}
					onkeydown={handleKeydown}
					oninput={handleInput}
					placeholder={isChoicesMode 
						? (interrupt.allow_freeform ? 'Or type your own answer...' : 'Optional: add additional context...')
						: 'Type your response...'}
					disabled={isSubmitting || disabled}
					rows={2}
					class="w-full bg-transparent placeholder:text-muted-foreground/50 text-base resize-none focus:outline-none leading-relaxed"
				></textarea>
			</div>

			<div class="flex items-center justify-between px-5 pb-4 pt-2">
				<span class="text-xs text-muted-foreground">
					Press <kbd class="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-xs font-mono">Enter</kbd> to send
				</span>
				
				<button
					type="submit"
					disabled={!canSubmit}
					class="inline-flex items-center justify-center gap-2 rounded-full bg-cyan-500 text-white px-4 py-2 text-sm font-medium transition-all duration-200 hover:bg-cyan-400 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
				>
					{#if isSubmitting}
						<Loader2 class="w-4 h-4 animate-spin" />
						<span>Sending...</span>
					{:else}
						<span>Send</span>
						<ArrowRight class="w-4 h-4" />
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>

