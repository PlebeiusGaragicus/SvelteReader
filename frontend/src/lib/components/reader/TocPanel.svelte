<script lang="ts">
	import { onMount } from 'svelte';
	import { X } from '@lucide/svelte';
	import type { TocItem } from '$lib/types';

	interface Props {
		toc: TocItem[];
		onClose: () => void;
		onItemClick: (item: TocItem) => void;
	}

	let { toc, onClose, onItemClick }: Props = $props();
	let panelElement: HTMLDivElement;

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
</script>

<div bind:this={panelElement} class="toc-panel absolute inset-y-0 left-0 top-[53px] z-10 w-72 border-r border-border bg-card text-card-foreground shadow-lg" style="background-color: var(--card); color: var(--card-foreground);">
	<div class="flex items-center justify-between border-b border-border p-4">
		<h2 class="font-semibold">Contents</h2>
		<button
			onclick={onClose}
			class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
			aria-label="Close table of contents"
		>
			<X class="h-4 w-4" />
		</button>
	</div>
	<nav class="h-[calc(100%-4rem)] overflow-y-auto p-2">
		{#if toc.length === 0}
			<p class="p-4 text-sm text-muted-foreground">No table of contents available</p>
		{:else}
			{#each toc as item (item.id)}
				<button
					onclick={() => onItemClick(item)}
					class="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
				>
					{item.label}
				</button>
				{#if item.subitems}
					{#each item.subitems as subitem (subitem.id)}
						<button
							onclick={() => onItemClick(subitem)}
							class="w-full rounded-md px-6 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
						>
							{subitem.label}
						</button>
					{/each}
				{/if}
			{/each}
		{/if}
	</nav>
</div>
