<script lang="ts">
	import { ArrowRight, Loader2 } from '@lucide/svelte';

	interface Props {
		onSubmit: (query: string) => void;
		isLoading?: boolean;
		disabled?: boolean;
		placeholder?: string;
	}

	let {
		onSubmit,
		isLoading = false,
		disabled = false,
		placeholder = 'Ask anything about the web...'
	}: Props = $props();

	let query = $state('');
	let textareaRef = $state<HTMLTextAreaElement | null>(null);

	const canSubmit = $derived(query.trim().length > 0 && !isLoading && !disabled);

	function handleSubmit(e?: Event) {
		e?.preventDefault();
		if (!canSubmit) return;

		onSubmit(query.trim());
		query = '';
		
		if (textareaRef) {
			textareaRef.style.height = 'auto';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.isComposing) {
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
		if (textareaRef) {
			textareaRef.focus();
		}
	});
</script>

<form onsubmit={handleSubmit} class="w-full max-w-2xl mx-auto">
	<div class="flex flex-col bg-secondary rounded-2xl border border-border shadow-lg shadow-black/5 dark:shadow-black/20 transition-all duration-200 focus-within:border-cyan-500/50 focus-within:shadow-cyan-500/10 px-4 pt-5 pb-4">
		<textarea
			bind:this={textareaRef}
			bind:value={query}
			onkeydown={handleKeydown}
			oninput={handleInput}
			{placeholder}
			disabled={disabled || isLoading}
			rows={2}
			class="bg-transparent placeholder:text-muted-foreground/60 text-base resize-none focus:outline-none w-full max-h-36 leading-relaxed"
		></textarea>
		
		<div class="flex flex-row items-center justify-between mt-4">
			<div class="flex items-center gap-2">
				<span class="text-xs text-muted-foreground">
					Press <kbd class="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-xs font-mono">Enter</kbd> to search
				</span>
			</div>
			
			<button
				type="submit"
				disabled={!canSubmit}
				class="inline-flex items-center justify-center rounded-full bg-cyan-500 text-white p-2.5 transition-all duration-200 hover:bg-cyan-400 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
			>
				{#if isLoading}
					<Loader2 class="h-5 w-5 animate-spin" />
				{:else}
					<ArrowRight class="h-5 w-5" />
				{/if}
			</button>
		</div>
	</div>
</form>

