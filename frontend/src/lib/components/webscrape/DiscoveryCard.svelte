<script lang="ts">
	import type { DiscoveryItem } from '$lib/services/discoveryService';

	interface Props {
		item: DiscoveryItem;
	}

	let { item }: Props = $props();

	function handleClick() {
		// TODO: Open in new tab or trigger a search/summary for this URL
		window.open(item.url, '_blank');
	}
</script>

<button
	onclick={handleClick}
	class="group flex flex-col rounded-2xl overflow-hidden bg-secondary border border-border shadow-sm shadow-black/5 dark:shadow-black/20 transition-all duration-200 hover:shadow-lg hover:border-border/80 text-left w-full"
>
	<div class="relative aspect-video overflow-hidden">
		<img
			src={item.thumbnail}
			alt={item.title}
			class="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
			loading="lazy"
		/>
	</div>
	<div class="p-4 flex flex-col gap-2">
		<h3 class="font-semibold text-sm leading-tight line-clamp-2 group-hover:text-cyan-500 dark:group-hover:text-cyan-400 transition-colors duration-200">
			{item.title}
		</h3>
		<p class="text-muted-foreground text-xs leading-relaxed line-clamp-2">
			{item.content}
		</p>
	</div>
</button>

