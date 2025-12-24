<script lang="ts">
	import type { Message } from '@langchain/langgraph-sdk';
	import { Bot, RefreshCw, Copy, Check } from '@lucide/svelte';
	import MarkdownRenderer from '../MarkdownRenderer.svelte';

	interface Props {
		message: Message;
		isLoading?: boolean;
		isStreaming?: boolean;
		onRegenerate?: () => void;
		hideToolCalls?: boolean;
	}

	let { message, isLoading = false, isStreaming = false, onRegenerate, hideToolCalls = false }: Props = $props();

	let copied = $state(false);

	const content = $derived(
		typeof message.content === 'string'
			? message.content
			: Array.isArray(message.content)
				? message.content
					.filter((c): c is { type: 'text'; text: string } => c.type === 'text')
					.map(c => c.text)
					.join('\n')
				: ''
	);

	const toolCalls = $derived(
		(message as any).tool_calls || []
	);

	const hasToolCalls = $derived(toolCalls.length > 0);

	async function copyToClipboard() {
		try {
			await navigator.clipboard.writeText(content);
			copied = true;
			setTimeout(() => { copied = false; }, 2000);
		} catch (e) {
			console.error('Failed to copy:', e);
		}
	}
</script>

<div class="flex justify-start gap-3">
	<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
		<Bot class="h-4 w-4 text-muted-foreground" />
	</div>
	
	<div class="flex max-w-[85%] flex-col gap-2">
		<!-- Content (agent's response/plan) comes FIRST -->
		{#if content || isStreaming}
			<div class="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
				{#if content}
					<MarkdownRenderer {content} />
				{:else if isStreaming}
					<div class="flex gap-1">
						<span class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style="animation-delay: 0ms"></span>
						<span class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style="animation-delay: 150ms"></span>
						<span class="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style="animation-delay: 300ms"></span>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Tool calls come AFTER the content (showing what tools were used) -->
		{#if hasToolCalls && !hideToolCalls}
			<div class="flex flex-col gap-1">
				{#each toolCalls as toolCall}
					<div class="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs">
						<span class="font-medium text-muted-foreground">Tool: </span>
						<span class="font-mono">{toolCall.name}</span>
					</div>
				{/each}
			</div>
		{/if}

		{#if !isLoading && !isStreaming && content}
			<div class="flex items-center gap-1">
				<button
					onclick={copyToClipboard}
					class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
					title="Copy message"
				>
					{#if copied}
						<Check class="h-3.5 w-3.5" />
					{:else}
						<Copy class="h-3.5 w-3.5" />
					{/if}
				</button>
				
				{#if onRegenerate}
					<button
						onclick={onRegenerate}
						class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
						title="Regenerate response"
					>
						<RefreshCw class="h-3.5 w-3.5" />
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>
