<script lang="ts">
	import type { LocationInfo } from '$lib/types';
	import type { ChapterPosition } from '$lib/services/epubService';

	interface Props {
		currentLocation: LocationInfo | null;
		fallbackProgress: number;
		fallbackCurrentPage: number;
		fallbackTotalPages: number;
		chapters?: ChapterPosition[];
		onChapterClick?: (href: string) => void;
		lastLocationCfi?: string | null;
		onReturnToLastLocation?: () => void;
	}

	let {
		currentLocation,
		fallbackProgress,
		fallbackCurrentPage,
		fallbackTotalPages,
		chapters = [],
		onChapterClick,
		lastLocationCfi = null,
		onReturnToLastLocation
	}: Props = $props();

	const percentage = $derived(currentLocation?.percentage ?? fallbackProgress);
	const displayPage = $derived(currentLocation?.page ?? fallbackCurrentPage);
	const displayTotal = $derived(currentLocation?.totalPages ?? fallbackTotalPages);

	let hoveredChapter = $state<ChapterPosition | null>(null);
	let tooltipX = $state(0);

	function handleChapterClick(chapter: ChapterPosition) {
		onChapterClick?.(chapter.href);
	}

	function handleDotHover(event: MouseEvent, chapter: ChapterPosition | null) {
		hoveredChapter = chapter;
		if (chapter) {
			const rect = (event.target as HTMLElement).getBoundingClientRect();
			tooltipX = rect.left + rect.width / 2;
		}
	}
</script>

<div class="border-t border-border px-4 py-2">
	<div class="flex items-center justify-between text-xs text-muted-foreground">
		<div class="flex items-center gap-2">
			<span>{percentage}%</span>
			{#if lastLocationCfi && onReturnToLastLocation}
				<button
					onclick={onReturnToLastLocation}
					class="text-primary hover:text-primary/80 hover:underline"
				>
					Return to last page
				</button>
			{/if}
		</div>
		<span>Location {displayPage} of {displayTotal}</span>
	</div>
	<div class="relative mt-1 h-2 w-full">
		{#if chapters.length > 0}
			<!-- Chapter segments (background track) -->
			<div class="absolute inset-0 flex overflow-hidden rounded-full">
				{#each chapters as chapter, i (`${i}-${chapter.href}`)}
					{@const width = chapter.endPercent - chapter.startPercent}
					<button
						class="h-full transition-all {hoveredChapter === chapter ? 'bg-muted-foreground/40' : 'bg-muted'}"
						style="width: {width}%; {i > 0 ? 'border-left: 1px solid rgba(255,255,255,0.15);' : ''}"
						onclick={() => handleChapterClick(chapter)}
						onmouseenter={(e) => handleDotHover(e, chapter)}
						onmouseleave={() => handleDotHover(null as any, null)}
						aria-label="Go to {chapter.label}"
					></button>
				{/each}
			</div>
		{:else}
			<!-- Simple progress bar while chapters are loading -->
			<div class="absolute inset-0 overflow-hidden rounded-full bg-muted"></div>
		{/if}

		<!-- Progress fill overlay -->
		<div 
			class="pointer-events-none absolute inset-y-0 left-0 overflow-hidden rounded-full"
			style="width: {percentage}%"
		>
			<div class="h-full w-full bg-primary"></div>
		</div>

		<!-- Tooltip -->
		{#if hoveredChapter}
			{@const tooltipLeft = (hoveredChapter.startPercent + hoveredChapter.endPercent) / 2}
			<div
				class="pointer-events-none absolute bottom-full z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
				style="left: {tooltipLeft}%"
			>
				{hoveredChapter.label}
			</div>
		{/if}
	</div>
</div>
