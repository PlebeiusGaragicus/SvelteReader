<script lang="ts">
	import { onMount } from 'svelte';
	import { Globe, Loader2 } from '@lucide/svelte';
	import { createDiscoveryStore, TOPICS, type DiscoveryTopic } from '$lib/services/discoveryService.svelte';
	import DiscoveryCard from './DiscoveryCard.svelte';
	import MajorDiscoveryCard from './MajorDiscoveryCard.svelte';

	const discovery = createDiscoveryStore();

	let sentinelRef = $state<HTMLDivElement | null>(null);
	let observer: IntersectionObserver | null = null;

	function handleTopicClick(topic: DiscoveryTopic | undefined) {
		discovery.setTopic(topic === discovery.activeTopic ? undefined : topic);
	}

	onMount(() => {
		// Initial load
		discovery.loadMore();

		// Set up intersection observer for infinite scroll
		observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && discovery.hasMore && !discovery.loading) {
					discovery.loadMore();
				}
			},
			{ rootMargin: '200px' }
		);

		if (sentinelRef) {
			observer.observe(sentinelRef);
		}

		return () => {
			observer?.disconnect();
		};
	});

	$effect(() => {
		if (sentinelRef && observer) {
			observer.disconnect();
			observer.observe(sentinelRef);
		}
	});

	// Helper to chunk items for alternating layout pattern
	function chunkItems(items: typeof discovery.items) {
		const chunks: { type: 'major' | 'small-grid'; items: typeof items; startIndex: number }[] = [];
		let index = 0;
		let isLeft = false;

		while (index < items.length) {
			// Add major card
			if (index < items.length) {
				chunks.push({ 
					type: 'major', 
					items: [{ ...items[index], _isLeft: isLeft }] as any, 
					startIndex: index 
				});
				index++;
				isLeft = !isLeft;
			}

			// Add 3 small cards
			if (index < items.length) {
				const smallCards = items.slice(index, index + 3);
				if (smallCards.length > 0) {
					chunks.push({ type: 'small-grid', items: smallCards, startIndex: index });
					index += smallCards.length;
				}
			}
		}

		return chunks;
	}

	const layoutChunks = $derived(chunkItems(discovery.items));
</script>

<div class="w-full">
	<!-- Header -->
	<div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-6 border-b border-border mb-6">
		<div class="flex items-center gap-3">
			<Globe class="h-10 w-10 text-cyan-500" />
			<h2 class="text-3xl font-light">Explore Recent Events</h2>
		</div>
		
		<!-- Topic filters -->
		<div class="flex flex-row items-center gap-2 overflow-x-auto pb-2 lg:pb-0">
			{#each TOPICS as topic}
				{@const isActive = discovery.activeTopic === topic.key}
				<button
					onclick={() => handleTopicClick(topic.key)}
					class="px-3 py-1.5 text-sm rounded-full border whitespace-nowrap transition-all duration-200 {isActive 
						? 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/40' 
						: 'text-muted-foreground border-border hover:text-foreground hover:border-foreground/30 hover:bg-muted'}"
				>
					{topic.display}
				</button>
			{/each}
		</div>
	</div>

	<!-- Error state -->
	{#if discovery.error}
		<div class="flex flex-col items-center justify-center py-12 text-center">
			<p class="text-destructive mb-4">{discovery.error}</p>
			<button
				onclick={() => discovery.reset()}
				class="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
			>
				Try Again
			</button>
		</div>
	{:else if discovery.items.length === 0 && !discovery.loading}
		<!-- Empty state -->
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<Globe class="h-16 w-16 text-muted-foreground mb-4" />
			<p class="text-muted-foreground">No articles found for this topic</p>
		</div>
	{:else}
		<!-- Mobile layout -->
		<div class="block lg:hidden">
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				{#each discovery.items as item (item.id)}
					<DiscoveryCard {item} />
				{/each}
			</div>
		</div>

		<!-- Desktop layout with alternating pattern -->
		<div class="hidden lg:block">
			<div class="flex flex-col gap-6">
				{#each layoutChunks as chunk, chunkIndex}
					{#if chunkIndex > 0}
						<hr class="border-t border-border" />
					{/if}
					
					{#if chunk.type === 'major'}
						<MajorDiscoveryCard 
							item={chunk.items[0]} 
							imagePosition={chunk.startIndex % 2 === 0 ? 'left' : 'right'} 
						/>
					{:else}
						<div class="grid grid-cols-3 gap-4">
							{#each chunk.items as item (item.id)}
								<DiscoveryCard {item} />
							{/each}
						</div>
					{/if}
				{/each}
			</div>
		</div>
	{/if}

	<!-- Loading indicator -->
	{#if discovery.loading}
		<div class="flex items-center justify-center py-8">
			<Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
		</div>
	{/if}

	<!-- Infinite scroll sentinel -->
	<div bind:this={sentinelRef} class="h-4"></div>
</div>

