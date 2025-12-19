<script lang="ts">
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';

	interface Props {
		onPrevPage: () => void;
		onNextPage: () => void;
	}

	let { onPrevPage, onNextPage }: Props = $props();
</script>

<button
	onclick={onPrevPage}
	class="absolute left-4 top-1/2 -translate-y-1/2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-background/80 shadow-lg backdrop-blur hover:bg-background"
	aria-label="Previous page"
>
	<ChevronLeft class="h-6 w-6" />
</button>
<button
	onclick={onNextPage}
	class="absolute right-4 top-1/2 -translate-y-1/2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-background/80 shadow-lg backdrop-blur hover:bg-background"
	aria-label="Next page"
>
	<ChevronRight class="h-6 w-6" />
</button>
