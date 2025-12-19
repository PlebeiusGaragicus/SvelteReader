<script lang="ts">
	import { MoreVertical, Trash2, BookOpen } from '@lucide/svelte';
	import type { Book } from '$lib/stores/books';
	import { books } from '$lib/stores/books';

	interface Props {
		book: Book;
	}

	let { book }: Props = $props();
	let menuOpen = $state(false);

	function handleDelete(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		books.removeBook(book.id);
		menuOpen = false;
	}
</script>

<a
	href="/book/{book.id}"
	class="group relative cursor-pointer rounded-lg border border-border bg-card transition-shadow hover:shadow-lg"
>
	<div class="relative aspect-[2/3] overflow-hidden rounded-t-lg bg-muted">
		{#if book.coverUrl}
			<img
				src={book.coverUrl}
				alt={book.title}
				class="h-full w-full object-cover"
			/>
		{:else}
			<div class="flex h-full w-full items-center justify-center">
				<BookOpen class="h-10 w-10 text-muted-foreground" />
			</div>
		{/if}

		{#if book.progress > 0}
			<div class="absolute bottom-0 left-0 right-0 h-1 bg-muted">
				<div
					class="h-full bg-primary transition-all"
					style="width: {book.progress}%"
				></div>
			</div>
		{/if}

		<!-- Context Menu Button -->
		<div class="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
			<button
				onclick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					menuOpen = !menuOpen;
				}}
				class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-background/80 backdrop-blur hover:bg-background"
				aria-label="Book options"
			>
				<MoreVertical class="h-4 w-4" />
			</button>

			{#if menuOpen}
				<div class="absolute right-0 top-full z-10 mt-1 w-32 rounded-md border border-border bg-popover p-1 shadow-lg">
					<button
						onclick={handleDelete}
						class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-accent"
					>
						<Trash2 class="h-4 w-4" />
						Delete
					</button>
				</div>
			{/if}
		</div>
	</div>

	<div class="p-2">
		<h3 class="mb-0.5 line-clamp-2 text-xs font-semibold">{book.title}</h3>
		<p class="line-clamp-1 text-xs text-muted-foreground">{book.author}</p>
		{#if book.progress > 0}
			<p class="mt-1 text-xs text-muted-foreground">{Math.round(book.progress)}%</p>
		{/if}
	</div>
</a>
