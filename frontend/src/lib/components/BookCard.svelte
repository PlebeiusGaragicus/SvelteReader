<script lang="ts">
	import { onMount } from 'svelte';
	import { MoreVertical, Trash2, BookOpen, Ghost, BookX, MessageSquareX, X, Upload, Pencil, Globe, AlertCircle, Plus, HardDrive } from '@lucide/svelte';
	import type { Book } from '$lib/stores/books';
	import { books } from '$lib/stores/books';
	import { annotations } from '$lib/stores/annotations';
	import { spectateStore } from '$lib/stores/spectate.svelte';
	import { removeEpubData, storeEpubData, storeBook, computeSha256 } from '$lib/services/storageService';
	import BookAnnouncementModal from './BookAnnouncementModal.svelte';
	import type { BookIdentity } from '$lib/types';
	import { toast } from 'svelte-sonner';

	interface Props {
		book: Book;
		showAdoptButton?: boolean;
		onAdopt?: () => void;
	}

	let { book, showAdoptButton = false, onAdopt }: Props = $props();
	let menuOpen = $state(false);
	let showDeleteModal = $state(false);
	let showEditModal = $state(false);
	let showUploadError = $state<string | null>(null);
	let menuElement: HTMLDivElement | null = $state(null);
	let fileInputElement: HTMLInputElement | null = $state(null);

	// Convert base64 to data URL for display
	const coverUrl = $derived(
		book.coverBase64 ? `data:image/jpeg;base64,${book.coverBase64}` : null
	);

	function openDeleteModal(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		menuOpen = false;
		showDeleteModal = true;
	}

	function openEditModal(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		menuOpen = false;
		showEditModal = true;
	}

	function triggerUploadEpub(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		menuOpen = false;
		fileInputElement?.click();
	}

	async function handleEpubUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		try {
			// Read file as ArrayBuffer
			const arrayBuffer = await file.arrayBuffer();
			
			// Compute SHA-256
			const sha256 = await computeSha256(arrayBuffer);
			
			// Verify it matches the ghost book
			if (sha256 !== book.sha256) {
				showUploadError = `SHA-256 mismatch. Expected: ${book.sha256.slice(0, 16)}...`;
				return;
			}
			
			// Store EPUB data
			await storeEpubData(book.id, arrayBuffer);
			
			// Update book to mark as having EPUB data
			await books.update(book.id, { hasEpubData: true });
			
			showUploadError = null;
			console.log(`[BookCard] EPUB uploaded successfully for ${book.title}`);
		} catch (err) {
			console.error('[BookCard] Failed to upload EPUB:', err);
			showUploadError = 'Failed to process EPUB file';
		} finally {
			// Reset file input
			input.value = '';
		}
	}

	async function handleEditSave(updatedBook: BookIdentity, isPublic: boolean) {
		// Update book metadata
		await books.update(book.id, {
			title: updatedBook.title,
			author: updatedBook.author,
			year: updatedBook.year,
			isbn: updatedBook.isbn,
			coverBase64: updatedBook.coverBase64,
			isPublic,
		});
		
		// If public, republish to Nostr
		if (isPublic) {
			const result = await books.publishBook(book.id);
			if (!result.success) {
				console.warn('[BookCard] Failed to republish book:', result.error);
			}
		}
	}

	async function handleDeleteBook(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		await books.remove(book.id);
		showDeleteModal = false;
	}

	async function handleDeleteAnnotations(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		await annotations.removeForBook(book.sha256);
		showDeleteModal = false;
	}

	async function handleDeleteAll(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		await annotations.removeForBook(book.sha256);
		await books.remove(book.id);
		showDeleteModal = false;
	}

	function closeModal(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		showDeleteModal = false;
	}

	function handleClickOutside(event: MouseEvent) {
		if (menuOpen && menuElement && !menuElement.contains(event.target as Node)) {
			menuOpen = false;
		}
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	});

	// Handle adopting a book from another user
	async function handleAdoptBook(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		
		try {
			await books.adoptBook(book);
			toast.success(`Added "${book.title}" to your library`);
			onAdopt?.();
		} catch (err) {
			console.error('[BookCard] Failed to adopt book:', err);
			toast.error(err instanceof Error ? err.message : 'Failed to add book');
		}
	}
</script>

<a
	href="/book/{book.id}"
	class="book-card group relative cursor-pointer overflow-visible rounded-lg border border-border bg-card transition-shadow hover:shadow-lg"
>
	<div class="relative aspect-[2/3] overflow-hidden rounded-t-lg bg-muted">
		{#if coverUrl}
			<img
				src={coverUrl}
				alt={book.title}
				class="h-full w-full object-cover"
			/>
		{:else}
			<div class="flex h-full w-full items-center justify-center">
				<BookOpen class="h-10 w-10 text-muted-foreground" />
			</div>
		{/if}
		
		{#if !book.hasEpubData}
			<div class="absolute inset-0 flex items-center justify-center bg-background/60">
				<Ghost class="h-8 w-8 text-muted-foreground" />
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
	</div>

	<!-- Context Menu Button - outside overflow container -->
	<div 
		bind:this={menuElement}
		class="absolute right-2 top-2 z-20 opacity-0 transition-opacity group-hover:opacity-100"
	>
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
			<div class="absolute right-0 top-full z-50 mt-1 w-40 rounded-md border border-border bg-popover p-1 shadow-lg">
					{#if !book.hasEpubData}
						<!-- Ghost book: show Upload EPUB option -->
						<button
							onclick={triggerUploadEpub}
							class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
						>
							<Upload class="h-4 w-4" />
							Upload EPUB
						</button>
					{/if}
					<button
						onclick={openEditModal}
						class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
					>
						<Pencil class="h-4 w-4" />
						Edit Metadata
					</button>
					<div class="my-1 border-t border-border"></div>
					<button
						onclick={openDeleteModal}
						class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-accent"
					>
						<Trash2 class="h-4 w-4" />
						Delete...
					</button>
				</div>
		{/if}
	</div>

	<div class="p-2">
		<h3 class="mb-0.5 line-clamp-2 text-xs font-semibold">{book.title}</h3>
		<p class="line-clamp-1 text-xs text-muted-foreground">{book.author}</p>
		{#if !spectateStore.isSpectating && !showAdoptButton}
			<div class="mt-1 flex items-center justify-between text-xs text-muted-foreground">
				<span>{book.progress > 0 && book.totalPages > 0 ? `${Math.round(book.progress)}%` : ''}</span>
				{#if book.isPublic}
					<Globe class="h-3 w-3 text-green-500" title="Published to Nostr" />
				{:else}
					<HardDrive class="h-3 w-3 text-muted-foreground" title="Local only" />
				{/if}
			</div>
		{/if}
	</div>
	
	<!-- Add to My Library button (for books from other users) -->
	{#if showAdoptButton}
		<button
			onclick={handleAdoptBook}
			class="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-primary/90"
			title="Add to My Library"
		>
			<Plus class="h-3 w-3" />
			Add
		</button>
	{/if}
</a>

<!-- Hidden file input for EPUB upload -->
<input
	bind:this={fileInputElement}
	type="file"
	accept=".epub,application/epub+zip"
	onchange={handleEpubUpload}
	class="hidden"
/>

<!-- Upload Error Toast -->
{#if showUploadError}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div 
		class="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 px-4 py-3 shadow-lg"
		onclick={() => showUploadError = null}
	>
		<AlertCircle class="h-5 w-5 text-destructive" />
		<div>
			<p class="text-sm font-medium text-destructive">Upload Failed</p>
			<p class="text-xs text-muted-foreground">{showUploadError}</p>
		</div>
		<button onclick={() => showUploadError = null} class="ml-2">
			<X class="h-4 w-4" />
		</button>
	</div>
{/if}

<!-- Edit Metadata Modal -->
<BookAnnouncementModal
	book={book}
	isOpen={showEditModal}
	onClose={() => showEditModal = false}
	onSave={handleEditSave}
/>

<!-- Delete Confirmation Modal -->
{#if showDeleteModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div 
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		onclick={closeModal}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div 
			class="mx-4 w-full max-w-sm rounded-lg border border-border bg-popover p-4 shadow-xl"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-semibold">Delete Options</h3>
				<button
					onclick={closeModal}
					class="rounded-md p-1 hover:bg-accent"
					aria-label="Close"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
			
			<p class="mb-4 text-sm text-muted-foreground">
				Choose what to delete for "{book.title}"
			</p>
			
			<div class="flex flex-col gap-2">
				<button
					onclick={handleDeleteBook}
					class="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
				>
					<BookX class="h-4 w-4" />
					Delete Book Only
				</button>
				<button
					onclick={handleDeleteAnnotations}
					class="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
				>
					<MessageSquareX class="h-4 w-4" />
					Delete Annotations Only
				</button>
				<button
					onclick={handleDeleteAll}
					class="flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive hover:bg-destructive/20"
				>
					<Trash2 class="h-4 w-4" />
					Delete All Data
				</button>
			</div>
			
			<button
				onclick={closeModal}
				class="mt-4 w-full rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
			>
				Cancel
			</button>
		</div>
	</div>
{/if}
