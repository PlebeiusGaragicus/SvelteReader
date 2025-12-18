<script lang="ts">
	import { MoreHorizontal, Trash2, CheckCircle, BookOpen } from '@lucide/svelte';
	import type { Book } from '$lib/stores/books';
	import { books } from '$lib/stores/books';

	interface Props {
		book: Book;
	}

	let { book }: Props = $props();
	let menuOpen = $state(false);

	function formatDate(date?: Date) {
		if (!date) return 'Not started';
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric'
		}).format(date);
	}

	function handleDelete() {
		books.removeBook(book.id);
		menuOpen = false;
	}

	function handleMarkAsRead() {
		books.updateProgress(book.id, book.totalPages);
		menuOpen = false;
	}
</script>

<div class="group relative rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50">
	<a href="/book/{book.id}" class="block">
		<div class="mb-3 flex aspect-[2/3] items-center justify-center rounded-md bg-muted">
			{#if book.coverUrl}
				<img src={book.coverUrl} alt={book.title} class="h-full w-full rounded-md object-cover" />
			{:else}
				<BookOpen class="h-12 w-12 text-muted-foreground" />
			{/if}
		</div>

		<h3 class="line-clamp-2 font-medium leading-tight">{book.title}</h3>
		<p class="mt-1 text-sm text-muted-foreground">{book.author}</p>

		<div class="mt-3 space-y-2">
			<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
				<div
					class="h-full rounded-full bg-primary transition-all"
					style="width: {book.progress}%"
				></div>
			</div>
			<div class="flex items-center justify-between text-xs text-muted-foreground">
				<span>{book.progress}% complete</span>
				<span>{formatDate(book.lastRead)}</span>
			</div>
		</div>
	</a>

	<div class="absolute right-2 top-2">
		<button
			onclick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				menuOpen = !menuOpen;
			}}
			class="inline-flex h-8 w-8 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-background group-hover:opacity-100"
			aria-label="Book options"
		>
			<MoreHorizontal class="h-4 w-4" />
		</button>

		{#if menuOpen}
			<div class="absolute right-0 top-full z-10 mt-1 w-40 rounded-md border border-border bg-popover p-1 shadow-lg">
				<button
					onclick={handleMarkAsRead}
					class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
				>
					<CheckCircle class="h-4 w-4" />
					Mark as Read
				</button>
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
