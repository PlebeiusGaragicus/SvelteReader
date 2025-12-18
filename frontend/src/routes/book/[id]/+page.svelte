<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { books, type Annotation } from '$lib/stores/books';
	import {
		ChevronLeft,
		ChevronRight,
		List,
		X,
		Settings,
		Highlighter,
		MessageSquare,
		Trash2,
		ArrowLeft
	} from '@lucide/svelte';

	const bookId = $derived($page.params.id);
	const book = $derived($books.find((b) => b.id === bookId));

	let showTOC = $state(false);
	let showAnnotations = $state(false);
	let showSettings = $state(false);

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

	function closeAllOverlays() {
		showTOC = false;
		showAnnotations = false;
		showSettings = false;
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
			<!-- EPUB Content Area (placeholder) -->
			<div class="flex flex-1 items-center justify-center bg-background">
				<div class="text-center text-muted-foreground">
					<p class="text-lg">EPUB content will render here</p>
					<p class="mt-2 text-sm">Integration with epub.js pending</p>
				</div>
			</div>

			<!-- Navigation Buttons -->
			<button
				class="absolute left-4 top-1/2 -translate-y-1/2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-background/80 shadow-lg backdrop-blur hover:bg-background"
				aria-label="Previous page"
			>
				<ChevronLeft class="h-6 w-6" />
			</button>
			<button
				class="absolute right-4 top-1/2 -translate-y-1/2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-background/80 shadow-lg backdrop-blur hover:bg-background"
				aria-label="Next page"
			>
				<ChevronRight class="h-6 w-6" />
			</button>
		</div>

		<!-- Progress Bar -->
		<div class="border-t border-border px-4 py-2">
			<div class="flex items-center justify-between text-xs text-muted-foreground">
				<span>{book.progress}%</span>
				<span>Page {book.currentPage} of {book.totalPages}</span>
			</div>
			<div class="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
				<div
					class="h-full bg-primary transition-all"
					style="width: {book.progress}%"
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
				<nav class="overflow-y-auto p-2">
					<p class="p-4 text-sm text-muted-foreground">Table of contents will load from EPUB</p>
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
