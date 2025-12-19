<script lang="ts">
	import type { LocationInfo } from '$lib/types';

	interface Props {
		currentLocation: LocationInfo | null;
		fallbackProgress: number;
		fallbackCurrentPage: number;
		fallbackTotalPages: number;
	}

	let {
		currentLocation,
		fallbackProgress,
		fallbackCurrentPage,
		fallbackTotalPages
	}: Props = $props();

	const percentage = $derived(currentLocation?.percentage ?? fallbackProgress);
	const displayPage = $derived(currentLocation?.page ?? fallbackCurrentPage);
	const displayTotal = $derived(currentLocation?.totalPages ?? fallbackTotalPages);
</script>

<div class="border-t border-border px-4 py-2">
	<div class="flex items-center justify-between text-xs text-muted-foreground">
		<span>{percentage}%</span>
		<span>Location {displayPage} of {displayTotal}</span>
	</div>
	<div class="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
		<div
			class="h-full bg-primary transition-all"
			style="width: {percentage}%"
		></div>
	</div>
</div>
