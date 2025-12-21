<script lang="ts">
	import { books } from '$lib/stores/books';
	import { annotations } from '$lib/stores/annotations';
	import { syncStore } from '$lib/stores/sync.svelte';
	import BookCard from '$lib/components/BookCard.svelte';
	import ImportButton from '$lib/components/ImportButton.svelte';
	import { BookOpen } from '@lucide/svelte';
	import { cyphertap } from 'cyphertap';

	// Set up sync callbacks when logged in (SyncStatusButton is in TopBar)
	$effect(() => {
		if (cyphertap.isLoggedIn) {
			annotations.setCyphertap(cyphertap);
			books.setCyphertap(cyphertap);
			syncStore.setCyphertap(cyphertap);
			syncStore.setMergeCallback(annotations.mergeFromNostr);
			syncStore.setBookMergeCallback(books.mergeFromNostr);
		} else {
			annotations.setCyphertap(null);
			books.setCyphertap(null);
			syncStore.setCyphertap(null);
		}
	});
</script>

<main class="container mx-auto px-4 py-8">
	{#if $books.length === 0}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<BookOpen class="mb-4 h-20 w-20 text-muted-foreground" />
			<h2 class="mb-2 text-2xl font-semibold">No books yet</h2>
			<p class="mb-6 text-muted-foreground">Import your first EPUB to get started</p>
			<ImportButton />
		</div>
	{:else}
		<div class="mb-6 flex items-center justify-between">
			<h1 class="library-header text-2xl font-bold">Library</h1>
			<ImportButton />
		</div>
		<div class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
			{#each $books as book (book.id)}
				<BookCard {book} />
			{/each}
		</div>
	{/if}
</main>
