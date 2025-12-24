<script lang="ts">
	import type { Message } from '@langchain/langgraph-sdk';
	import { Bot, RefreshCw, Copy, Check, BookOpen, Search, FileText } from '@lucide/svelte';
	import MarkdownRenderer from '../MarkdownRenderer.svelte';
	import { epubService } from '$lib/services/epubService';

	interface Props {
		message: Message;
		isLoading?: boolean;
		isStreaming?: boolean;
		onRegenerate?: () => void;
		hideToolCalls?: boolean;
	}

	let { message, isLoading = false, isStreaming = false, onRegenerate, hideToolCalls = false }: Props = $props();

	let copied = $state(false);
	
	// Cache for chapter ID to title lookups (non-reactive, just for memoization)
	const chapterTitleCache: Record<string, string> = {};

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
	
	/**
	 * Look up chapter title from TOC by ID
	 */
	function getChapterTitle(chapterId: string): string {
		// Check cache first
		if (chapterTitleCache[chapterId]) {
			return chapterTitleCache[chapterId];
		}
		
		// Try to look up in TOC (synchronously from cached TOC)
		const title = epubService.getChapterTitleById(chapterId);
		if (title) {
			chapterTitleCache[chapterId] = title;
			return title;
		}
		
		// Fallback: make the ID more readable
		return chapterId
			.replace(/[-_]/g, ' ')
			.replace(/\.(x?html?|xml)$/i, '')
			.replace(/^\d+\s*/, '');
	}

	/**
	 * Format tool call for display with user-friendly text
	 */
	function formatToolCall(toolCall: any): { icon: typeof BookOpen; text: string } {
		switch (toolCall.name) {
			case 'get_chapter': {
				const chapterId = toolCall.args?.chapter_id || 'content';
				const chapterTitle = getChapterTitle(chapterId);
				return { icon: BookOpen, text: `Reading "${chapterTitle}"...` };
			}
			case 'search_book': {
				const queries = toolCall.args?.queries || [toolCall.args?.query] || ['content'];
				const queryText = Array.isArray(queries) 
					? queries.slice(0, 2).map((q: string) => `"${q}"`).join(', ') + (queries.length > 2 ? '...' : '')
					: `"${queries}"`;
				return { icon: Search, text: `Searching for ${queryText}` };
			}
			case 'get_current_page':
				return { icon: FileText, text: 'Reading the current page...' };
			default:
				return { icon: BookOpen, text: `Using ${toolCall.name}...` };
		}
	}

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
			<div class="flex flex-col gap-1.5">
				{#each toolCalls as toolCall}
					{@const formatted = formatToolCall(toolCall)}
					<div class="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
						<svelte:component this={formatted.icon} class="h-4 w-4 shrink-0" />
						<span>{formatted.text}</span>
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
