<script lang="ts">
	import type { DiscoveryItem } from '$lib/services/discoveryService';

	interface Props {
		item: DiscoveryItem;
		imagePosition?: 'left' | 'right';
	}

	let { item, imagePosition = 'left' }: Props = $props();

	function handleClick() {
		// TODO: Open in new tab or trigger a search/summary for this URL
		window.open(item.url, '_blank');
	}
</script>

<button
	onclick={handleClick}
	class="group w-full flex {imagePosition === 'right' ? 'flex-row-reverse' : 'flex-row'} items-stretch gap-6 h-56 py-3 text-left"
>
	<div class="relative w-72 h-full overflow-hidden rounded-2xl flex-shrink-0">
		<img
			src={item.thumbnail}
			alt={item.title}
			class="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
			loading="lazy"
		/>
	</div>
	
	<div class="flex flex-col justify-center flex-1 py-4">
		<h2 class="text-2xl font-light mb-3 leading-tight line-clamp-3 group-hover:text-cyan-500 dark:group-hover:text-cyan-400 transition-colors duration-200">
			{item.title}
		</h2>
		<p class="text-muted-foreground text-sm leading-relaxed line-clamp-4">
			{item.content}
		</p>
	</div>
</button>

