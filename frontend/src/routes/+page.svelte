<script lang="ts">
	import { books } from '$lib/stores/books';
	import { annotations } from '$lib/stores/annotations';
	import { syncStore } from '$lib/stores/sync.svelte';
	import { spectateStore } from '$lib/stores/spectate.svelte';
	import BookCard from '$lib/components/BookCard.svelte';
	import ImportButton from '$lib/components/ImportButton.svelte';
	import { BookOpen, Binoculars } from '@lucide/svelte';
	import { cyphertap } from 'cyphertap';

	// Set up sync callbacks when logged in (SyncStatusButton is in TopBar)
	// Only enable sync when NOT spectating (can't sync someone else's data)
	$effect(() => {
		if (cyphertap.isLoggedIn && !spectateStore.isSpectating) {
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
	
	// Determine if we should show the library (logged in OR spectating)
	const canViewLibrary = $derived(cyphertap.isLoggedIn || spectateStore.isSpectating);

	// Drag and drop state
	let isDragging = $state(false);
	let importButtonRef: ImportButton;

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		// Only set to false if leaving the main container
		if (e.currentTarget === e.target) {
			isDragging = false;
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		
		const file = e.dataTransfer?.files?.[0];
		if (file && importButtonRef) {
			importButtonRef.processFile(file);
		}
	}
</script>

<main 
	class="px-4 py-8 min-h-[calc(100vh-3.5rem)] relative"
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	{#if !canViewLibrary}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<BookOpen class="mb-4 h-20 w-20 text-muted-foreground" />
			<h2 class="mb-2 text-2xl font-semibold">Welcome to SvelteReader</h2>
			<p class="mb-6 text-muted-foreground">Log in with Nostr to access your library</p>
			<p class="text-sm text-muted-foreground">Click the user icon in the top right to log in</p>
			<p class="mt-4 text-sm text-muted-foreground">Or use the <Binoculars class="inline h-4 w-4" /> button to view another user's library</p>
		</div>
	{:else if $books.length === 0}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			{#if spectateStore.isSpectating}
				<Binoculars class="mb-4 h-20 w-20 text-blue-400" />
				<h2 class="mb-2 text-2xl font-semibold">No books found</h2>
				<p class="mb-6 text-muted-foreground">This user hasn't published any books yet</p>
			{:else}
				<BookOpen class="mb-4 h-20 w-20 text-muted-foreground" />
				<h2 class="mb-2 text-2xl font-semibold">No books yet</h2>
				<p class="mb-6 text-muted-foreground">Import your first EPUB or drag and drop a file</p>
				<ImportButton bind:this={importButtonRef} />
			{/if}
		</div>
	{:else}
		<div class="mb-6 flex items-center justify-between">
			{#if spectateStore.isSpectating && spectateStore.target}
				<div class="flex items-center gap-3">
					<Binoculars class="h-6 w-6 text-blue-400" />
					<div>
						<h1 class="library-header text-2xl font-bold">
							{spectateStore.target.profile?.displayName || spectateStore.target.profile?.name || 'User'}'s Library
						</h1>
						<p class="text-xs text-muted-foreground">{spectateStore.target.npub.slice(0, 20)}...</p>
					</div>
				</div>
				<span class="rounded-full bg-blue-500/20 px-3 py-1 text-sm text-blue-400">View Only</span>
			{:else}
				<h1 class="library-header text-2xl font-bold">Library</h1>
				<ImportButton bind:this={importButtonRef} />
			{/if}
		</div>
		<div class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
			{#each $books as book (book.id)}
				<BookCard {book} />
			{/each}
		</div>
	{/if}

	<!-- Drag overlay -->
	{#if isDragging}
		<div class="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-lg pointer-events-none">
			<div class="text-center">
				<BookOpen class="mx-auto h-16 w-16 text-primary mb-2" />
				<p class="text-lg font-medium text-primary">Drop EPUB to import</p>
			</div>
		</div>
	{/if}
</main>
