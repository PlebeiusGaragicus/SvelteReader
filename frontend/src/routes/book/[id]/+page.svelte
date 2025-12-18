<script lang="ts">
	import { page } from '$app/stores';
	import { books, type Annotation } from '$lib/stores/books';
	import { PanelLeftClose, PanelLeft, List, MessageSquare, Highlighter, Trash2 } from '@lucide/svelte';

	const bookId = $derived($page.params.id);
	const book = $derived($books.find((b) => b.id === bookId));

	let sidebarOpen = $state(true);
	let tocOpen = $state(false);

	const sampleContent = `
		<h2>Chapter 1</h2>
		<p>In my younger and more vulnerable years my father gave me some advice that I've been turning over in my mind ever since.</p>
		<p>"Whenever you feel like criticizing anyone," he told me, "just remember that all the people in this world haven't had the advantages that you've had."</p>
		<p>He didn't say any more, but we've always been unusually communicative in a reserved way, and I understood that he meant a great deal more than that. In consequence, I'm inclined to reserve all judgments, a habit that has opened up many curious natures to me and also made me the victim of not a few veteran bores.</p>
		<p>The abnormal mind is quick to detect and attach itself to this quality when it appears in a normal person, and so it came about that in college I was unjustly accused of being a politician, because I was privy to the secret griefs of wild, unknown men.</p>
		<p>Most of the confidences were unsought — frequently I have feigned sleep, preoccupation, or a hostile levity when I realized by some unmistakable sign that an intimate revelation was quivering on the horizon; for the intimate revelations of young men, or at least the terms in which they express them, are usually plagiaristic and marred by obvious suppressions.</p>
		<p>Reserving judgments is a matter of infinite hope. I am still a little afraid of missing something if I forget that, as my father snobbishly suggested, and I snobbishly repeat, a sense of the fundamental decencies is parcelled out unequally at birth.</p>
	`;

	const tableOfContents = [
		{ id: '1', title: 'Chapter 1: The Beginning', page: 1 },
		{ id: '2', title: 'Chapter 2: The Journey', page: 25 },
		{ id: '3', title: 'Chapter 3: The Discovery', page: 48 },
		{ id: '4', title: 'Chapter 4: The Challenge', page: 72 },
		{ id: '5', title: 'Chapter 5: The Resolution', page: 95 }
	];

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
	<div class="flex h-[calc(100vh-3.5rem)]">
		<!-- Table of Contents Sidebar -->
		{#if tocOpen}
			<aside class="w-64 shrink-0 border-r border-border bg-card p-4">
				<div class="mb-4 flex items-center justify-between">
					<h2 class="font-semibold">Contents</h2>
					<button
						onclick={() => (tocOpen = false)}
						class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
					>
						<PanelLeftClose class="h-4 w-4" />
					</button>
				</div>
				<nav class="space-y-1">
					{#each tableOfContents as chapter}
						<button
							class="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
						>
							{chapter.title}
						</button>
					{/each}
				</nav>
			</aside>
		{/if}

		<!-- Main Reading Area -->
		<div class="flex flex-1 flex-col overflow-hidden">
			<!-- Reading Controls -->
			<div class="flex items-center justify-between border-b border-border px-4 py-2">
				<div class="flex items-center gap-2">
					{#if !tocOpen}
						<button
							onclick={() => (tocOpen = true)}
							class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
							aria-label="Open table of contents"
						>
							<List class="h-4 w-4" />
						</button>
					{/if}
					<span class="text-sm text-muted-foreground">{book.title}</span>
				</div>
				<div class="flex items-center gap-2">
					<span class="text-sm text-muted-foreground">
						Page {book.currentPage} of {book.totalPages}
					</span>
					<button
						onclick={() => (sidebarOpen = !sidebarOpen)}
						class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
						aria-label="Toggle annotations"
					>
						{#if sidebarOpen}
							<PanelLeftClose class="h-4 w-4" />
						{:else}
							<PanelLeft class="h-4 w-4" />
						{/if}
					</button>
				</div>
			</div>

			<!-- Book Content -->
			<div class="flex-1 overflow-y-auto">
				<article class="prose prose-neutral dark:prose-invert mx-auto max-w-2xl px-8 py-12">
					{@html sampleContent}
				</article>
			</div>
		</div>

		<!-- Annotations Sidebar -->
		{#if sidebarOpen}
			<aside class="w-80 shrink-0 border-l border-border bg-card">
				<div class="border-b border-border p-4">
					<h2 class="font-semibold">Annotations</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						{book.annotations.length} {book.annotations.length === 1 ? 'note' : 'notes'}
					</p>
				</div>

				<div class="h-[calc(100%-5rem)] overflow-y-auto p-4">
					{#if book.annotations.length === 0}
						<div class="flex flex-col items-center justify-center py-8 text-center">
							<div class="mb-3 rounded-full bg-muted p-3">
								<Highlighter class="h-5 w-5 text-muted-foreground" />
							</div>
							<p class="text-sm text-muted-foreground">
								Highlight text to add annotations
							</p>
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
			</aside>
		{/if}
	</div>
{/if}
