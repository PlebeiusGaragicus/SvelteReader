<script lang="ts">
	import { ExternalLink } from '@lucide/svelte';
	import { synthSourceStore } from '$lib/stores/synthesize';
	import { MarkdownRenderer } from '$lib/components/chat';

	interface Props {
		sourceId: string | null;
	}

	let { sourceId }: Props = $props();

	const source = $derived(
		sourceId ? synthSourceStore.sources.find((s) => s.id === sourceId) : null
	);
</script>

<div class="flex h-full flex-col bg-zinc-900">
	{#if !source}
		<div class="flex h-full items-center justify-center text-zinc-600">
			<p class="text-sm">Select a source to view</p>
		</div>
	{:else}
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
			<div class="min-w-0 flex-1">
				<h3 class="truncate text-sm font-medium text-zinc-200">{source.title}</h3>
				<a
					href={source.url}
					target="_blank"
					rel="noopener noreferrer"
					class="flex items-center gap-1 truncate text-xs text-zinc-500 hover:text-violet-400"
				>
					{source.url}
					<ExternalLink class="h-3 w-3 shrink-0" />
				</a>
			</div>
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-y-auto p-4">
			{#if source.content}
				<div class="prose prose-invert prose-sm max-w-none">
					<MarkdownRenderer content={source.content} />
				</div>
			{:else}
				<p class="text-sm text-zinc-500">No content available</p>
			{/if}
		</div>
	{/if}
</div>

