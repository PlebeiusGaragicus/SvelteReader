<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { mode } from 'mode-watcher';
	import { books, getEpubData, type Annotation } from '$lib/stores/books';
	import { epubService, type TocItem, type LocationInfo } from '$lib/services/epubService';
	import {
		ChevronLeft,
		ChevronRight,
		List,
		X,
		Settings,
		Highlighter,
		MessageSquare,
		Trash2,
		ArrowLeft,
		Loader2
	} from '@lucide/svelte';

	const bookId = $derived($page.params.id);
	const book = $derived($books.find((b) => b.id === bookId));

	let showTOC = $state(false);
	let showAnnotations = $state(false);
	let showSettings = $state(false);

	let readerContainer: HTMLDivElement;
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);
	let toc = $state<TocItem[]>([]);
	let currentLocation = $state<LocationInfo | null>(null);
	let isBookReady = $state(false);

	// Apply theme when mode changes
	$effect(() => {
		if (isBookReady && mode.current) {
			epubService.applyTheme(mode.current === 'dark' ? 'dark' : 'light');
		}
	});

	onMount(async () => {
		if (!book) return;

		try {
			const epubData = await getEpubData(book.id);
			if (!epubData) {
				loadError = 'EPUB data not found. Please re-import the book.';
				isLoading = false;
				return;
			}

			await epubService.loadBook(epubData);
			await epubService.renderBook(readerContainer, {
				startCfi: book.currentCfi
			});

			// Apply initial theme based on current mode
			const currentMode = mode.current || 'light';
			epubService.applyTheme(currentMode === 'dark' ? 'dark' : 'light');
			isBookReady = true;

			// Load table of contents
			toc = await epubService.getTableOfContents();

			// Track location changes
			epubService.onRelocated((location) => {
				currentLocation = location;
				// Save progress
				books.updateProgress(book.id, location.page, location.cfi);
			});

			// Get initial location
			currentLocation = epubService.getCurrentLocation();

			isLoading = false;
		} catch (error) {
			console.error('Failed to load book:', error);
			loadError = 'Failed to load book. Please try again.';
			isLoading = false;
		}
	});

	onDestroy(() => {
		epubService.destroy();
	});

	async function handlePrevPage() {
		await epubService.prevPage();
	}

	async function handleNextPage() {
		await epubService.nextPage();
	}

	async function handleTocClick(item: TocItem) {
		await epubService.goToHref(item.href);
		showTOC = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowLeft') {
			handlePrevPage();
		} else if (event.key === 'ArrowRight') {
			handleNextPage();
		}
	}

	function toggleOverlay(overlay: 'toc' | 'annotations' | 'settings') {
		if (overlay === 'toc') {
			showTOC = !showTOC;
			showAnnotations = false;
			showSettings = false;
		} else if (overlay === 'annotations') {
			showAnnotations = !showAnnotations;
			showTOC = false;
			showSettings = false;
		} else if (overlay === 'settings') {
			showSettings = !showSettings;
			showTOC = false;
			showAnnotations = false;
		}
	}

	function getColorClass(color: Annotation['color']) {
		const colors = {
			yellow: 'bg-yellow-200/50 border-yellow-400',
			green: 'bg-green-200/50 border-green-400',
			blue: 'bg-blue-200/50 border-blue-400',
			pink: 'bg-pink-200/50 border-pink-400'
		};
		return colors[color];
	}

	function deleteAnnotation(annotationId: string) {
		if (book) {
			books.removeAnnotation(book.id, annotationId);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if !book}
	<div class="flex h-[calc(100vh-3.5rem)] items-center justify-center">
		<p class="text-muted-foreground">Book not found</p>
	</div>
{:else}
	<div class="relative flex h-[calc(100vh-3.5rem)] flex-col">
		<!-- Reader Header -->
		<header class="flex items-center justify-between border-b border-border px-4 py-2">
			<div class="flex items-center gap-2">
				<button
					onclick={() => goto('/')}
					class="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
					aria-label="Back to library"
				>
					<ArrowLeft class="h-5 w-5" />
				</button>
				<button
					onclick={() => toggleOverlay('toc')}
					class="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent {showTOC ? 'bg-accent' : ''}"
					aria-label="Table of contents"
				>
					<List class="h-5 w-5" />
				</button>
			</div>

			<span class="text-sm font-medium">{book.title}</span>

			<div class="flex items-center gap-2">
				<button
					onclick={() => toggleOverlay('annotations')}
					class="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent {showAnnotations ? 'bg-accent' : ''}"
					aria-label="Annotations"
				>
					<Highlighter class="h-5 w-5" />
				</button>
				<button
					onclick={() => toggleOverlay('settings')}
					class="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent {showSettings ? 'bg-accent' : ''}"
					aria-label="Settings"
				>
					<Settings class="h-5 w-5" />
				</button>
			</div>
		</header>

		<!-- Main Reading Area -->
		<div class="relative flex flex-1 overflow-hidden">
			<!-- EPUB Content Area -->
			{#if isLoading}
				<div class="flex flex-1 items-center justify-center bg-background">
					<div class="flex flex-col items-center gap-3 text-muted-foreground">
						<Loader2 class="h-8 w-8 animate-spin" />
						<p>Loading book...</p>
					</div>
				</div>
			{:else if loadError}
				<div class="flex flex-1 items-center justify-center bg-background">
					<div class="text-center text-muted-foreground">
						<p class="text-lg text-destructive">{loadError}</p>
						<button
							onclick={() => goto('/')}
							class="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
						>
							Back to Library
						</button>
					</div>
				</div>
			{/if}
			<div
				bind:this={readerContainer}
				class="epub-container flex-1 {isLoading || loadError ? 'hidden' : ''}"
			></div>

			<!-- Navigation Buttons -->
			{#if !isLoading && !loadError}
				<button
					onclick={handlePrevPage}
					class="absolute left-4 top-1/2 -translate-y-1/2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-background/80 shadow-lg backdrop-blur hover:bg-background"
					aria-label="Previous page"
				>
					<ChevronLeft class="h-6 w-6" />
				</button>
				<button
					onclick={handleNextPage}
					class="absolute right-4 top-1/2 -translate-y-1/2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-background/80 shadow-lg backdrop-blur hover:bg-background"
					aria-label="Next page"
				>
					<ChevronRight class="h-6 w-6" />
				</button>
			{/if}
		</div>

		<!-- Progress Bar -->
		<div class="border-t border-border px-4 py-2">
			<div class="flex items-center justify-between text-xs text-muted-foreground">
				<span>{currentLocation?.percentage ?? book.progress}%</span>
				<span>
					{#if currentLocation}
						Location {currentLocation.page} of {currentLocation.totalPages}
					{:else}
						Page {book.currentPage} of {book.totalPages}
					{/if}
				</span>
			</div>
			<div class="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
				<div
					class="h-full bg-primary transition-all"
					style="width: {currentLocation?.percentage ?? book.progress}%"
				></div>
			</div>
		</div>

		<!-- Table of Contents Overlay -->
		{#if showTOC}
			<div class="absolute inset-y-0 left-0 top-[53px] z-10 w-72 border-r border-border bg-card shadow-lg">
				<div class="flex items-center justify-between border-b border-border p-4">
					<h2 class="font-semibold">Contents</h2>
					<button
						onclick={() => (showTOC = false)}
						class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
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
								onclick={() => handleTocClick(item)}
								class="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
							>
								{item.label}
							</button>
							{#if item.subitems}
								{#each item.subitems as subitem (subitem.id)}
									<button
										onclick={() => handleTocClick(subitem)}
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
		{/if}

		<!-- Annotations Overlay -->
		{#if showAnnotations}
			<div class="absolute inset-y-0 right-0 top-[53px] z-10 w-80 border-l border-border bg-card shadow-lg">
				<div class="flex items-center justify-between border-b border-border p-4">
					<div>
						<h2 class="font-semibold">Annotations</h2>
						<p class="text-sm text-muted-foreground">
							{book.annotations.length} {book.annotations.length === 1 ? 'note' : 'notes'}
						</p>
					</div>
					<button
						onclick={() => (showAnnotations = false)}
						class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
					>
						<X class="h-4 w-4" />
					</button>
				</div>

				<div class="h-[calc(100%-5rem)] overflow-y-auto p-4">
					{#if book.annotations.length === 0}
						<div class="flex flex-col items-center justify-center py-8 text-center">
							<div class="mb-3 rounded-full bg-muted p-3">
								<Highlighter class="h-5 w-5 text-muted-foreground" />
							</div>
							<p class="text-sm text-muted-foreground">Highlight text to add annotations</p>
						</div>
					{:else}
						<div class="space-y-3">
							{#each book.annotations as annotation (annotation.id)}
								<div class="rounded-lg border {getColorClass(annotation.color)} p-3">
									<p class="text-sm italic">"{annotation.text}"</p>
									{#if annotation.note}
										<div class="mt-2 flex items-start gap-2 border-t border-border/50 pt-2">
											<MessageSquare class="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
											<p class="text-sm text-muted-foreground">{annotation.note}</p>
										</div>
									{/if}
									<div class="mt-2 flex items-center justify-between text-xs text-muted-foreground">
										<span>Page {annotation.page}</span>
										<button
											onclick={() => deleteAnnotation(annotation.id)}
											class="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive"
										>
											<Trash2 class="h-3 w-3" />
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Settings Overlay -->
		{#if showSettings}
			<div class="absolute inset-y-0 right-0 top-[53px] z-10 w-72 border-l border-border bg-card shadow-lg">
				<div class="flex items-center justify-between border-b border-border p-4">
					<h2 class="font-semibold">Settings</h2>
					<button
						onclick={() => (showSettings = false)}
						class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
					>
						<X class="h-4 w-4" />
					</button>
				</div>
				<div class="p-4">
					<p class="text-sm text-muted-foreground">Reader settings (font size, theme, etc.) coming soon</p>
				</div>
			</div>
		{/if}
	</div>
{/if}
