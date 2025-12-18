<script lang="ts">
	import { books } from '$lib/stores/books';
	import BookCard from '$lib/components/BookCard.svelte';
	import { Plus } from '@lucide/svelte';
</script>

<div class="container mx-auto px-4 py-8">
	<div class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">My Library</h1>
			<p class="mt-1 text-muted-foreground">
				{$books.length} {$books.length === 1 ? 'book' : 'books'}
			</p>
		</div>
		<button
			class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
		>
			<Plus class="h-4 w-4" />
			Add Book
		</button>
	</div>

	{#if $books.length === 0}
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<div class="mb-4 rounded-full bg-muted p-4">
				<Plus class="h-8 w-8 text-muted-foreground" />
			</div>
			<h2 class="text-xl font-semibold">No books yet</h2>
			<p class="mt-2 text-muted-foreground">Add your first ebook to get started</p>
		</div>
	{:else}
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
			{#each $books as book (book.id)}
				<BookCard {book} />
			{/each}
		</div>
	{/if}
</div>
