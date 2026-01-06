<script lang="ts">
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';

	interface Props {
		onPrevPage: () => void;
		onNextPage: () => void;
	}

	let { onPrevPage, onNextPage }: Props = $props();
</script>

<!-- Previous Page - Left Edge -->
<button
	onclick={onPrevPage}
	class="group absolute left-0 top-0 bottom-0 z-10 flex w-16 items-center justify-start pl-2 transition-opacity duration-200 opacity-0 hover:opacity-100 focus:opacity-100"
	aria-label="Previous page"
>
	<div class="flex h-20 w-10 items-center justify-center rounded-r-lg bg-background/60 backdrop-blur-sm shadow-md transition-all duration-200 group-hover:bg-background/90 group-hover:shadow-lg">
		<ChevronLeft class="h-6 w-6 text-muted-foreground transition-colors group-hover:text-foreground" />
	</div>
</button>

<!-- Next Page - Right Edge -->
<button
	onclick={onNextPage}
	class="group absolute right-0 top-0 bottom-0 z-10 flex w-16 items-center justify-end pr-2 transition-opacity duration-200 opacity-0 hover:opacity-100 focus:opacity-100"
	aria-label="Next page"
>
	<div class="flex h-20 w-10 items-center justify-center rounded-l-lg bg-background/60 backdrop-blur-sm shadow-md transition-all duration-200 group-hover:bg-background/90 group-hover:shadow-lg">
		<ChevronRight class="h-6 w-6 text-muted-foreground transition-colors group-hover:text-foreground" />
	</div>
</button>
