<script lang="ts">
	import { Send, Loader2, Square, Paperclip } from '@lucide/svelte';

	interface Props {
		onSubmit: (content: string) => void;
		onStop?: () => void;
		isLoading?: boolean;
		disabled?: boolean;
		placeholder?: string;
		balance?: number;
		messageCost?: number;
	}

	let {
		onSubmit,
		onStop,
		isLoading = false,
		disabled = false,
		placeholder = 'Type your message...',
		balance,
		messageCost = 1,
	}: Props = $props();

	let inputValue = $state('');
	let textareaRef = $state<HTMLTextAreaElement | null>(null);

	const canSubmit = $derived(
		inputValue.trim().length > 0 && 
		!isLoading && 
		!disabled &&
		(balance === undefined || balance >= messageCost)
	);

	const insufficientBalance = $derived(
		balance !== undefined && balance < messageCost
	);

	function handleSubmit(e?: Event) {
		e?.preventDefault();
		if (!canSubmit) return;

		onSubmit(inputValue.trim());
		inputValue = '';
		
		// Reset textarea height
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
		// Auto-resize textarea
		if (textareaRef) {
			textareaRef.style.height = 'auto';
			textareaRef.style.height = `${Math.min(textareaRef.scrollHeight, 200)}px`;
		}
	}
</script>

<form onsubmit={handleSubmit} class="flex flex-col gap-2">
	<div class="relative flex items-end gap-2 rounded-2xl border border-border bg-muted p-2">
		<textarea
			bind:this={textareaRef}
			bind:value={inputValue}
			onkeydown={handleKeydown}
			oninput={handleInput}
			{placeholder}
			disabled={disabled || isLoading}
			rows={1}
			class="max-h-[200px] min-h-[40px] flex-1 resize-none border-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-0"
		></textarea>

		<div class="flex items-center gap-1">
			{#if isLoading}
				<button
					type="button"
					onclick={onStop}
					class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
					title="Stop generating"
				>
					<Square class="h-4 w-4" />
				</button>
			{:else}
				<button
					type="submit"
					disabled={!canSubmit}
					class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
					title={insufficientBalance ? 'Insufficient balance' : 'Send message'}
				>
					<Send class="h-4 w-4" />
				</button>
			{/if}
		</div>
	</div>

	{#if insufficientBalance}
		<p class="text-center text-xs text-destructive">
			Insufficient balance. Add sats to send messages.
		</p>
	{/if}

	{#if balance !== undefined}
		<p class="text-center text-xs text-muted-foreground">
			{messageCost} sat per message • Balance: {balance} sats
		</p>
	{/if}
</form>
