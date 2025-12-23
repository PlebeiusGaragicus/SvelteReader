<script lang="ts">
	import { Upload, Loader2 } from '@lucide/svelte';
	import { books } from '$lib/stores/books';
	import { storeEpubData, computeSha256, getBookBySha256, getBookBySha256ForOwner } from '$lib/services/storageService';
	import { epubService } from '$lib/services/epubService';
	import { AppError, type BookIdentity } from '$lib/types';
	import { toast } from 'svelte-sonner';
	import BookAnnouncementModal from './BookAnnouncementModal.svelte';

	let fileInput: HTMLInputElement;
	let isImporting = $state(false);
	
	// Modal state for book announcement
	let showAnnouncementModal = $state(false);
	let pendingBook = $state<{
		sha256: string;
		title: string;
		author: string;
		coverBase64?: string;
		totalPages: number;
		arrayBuffer: ArrayBuffer;
	} | null>(null);

	function handleClick() {
		fileInput?.click();
	}

	// Process a file (can be called externally for drag-and-drop)
	export async function processFile(file: File): Promise<void> {
		if (!file.name.toLowerCase().endsWith('.epub')) {
			toast.error('Please select an EPUB file');
			return;
		}

		isImporting = true;

		try {
			const parsed = await epubService.parseEpub(file);

			// Compute SHA-256 hash of the EPUB file
			const sha256 = await computeSha256(parsed.arrayBuffer);

			// Check if current user already has this book
			const currentOwner = books.getCurrentOwner();
			if (currentOwner) {
				const existingBook = await getBookBySha256ForOwner(sha256, currentOwner);
				if (existingBook) {
					if (existingBook.hasEpubData) {
						toast.info(`"${existingBook.title}" is already in your library`);
						return;
					} else {
						// Ghost book exists for current user - add EPUB data to it
						await storeEpubData(existingBook.id, parsed.arrayBuffer);
						await books.update(existingBook.id, { hasEpubData: true });
						toast.success(`Added EPUB data to "${existingBook.title}"`);
						return;
					}
				}
			}
			
			// Check if any other user has this book with EPUB data (we can reuse it)
			const anyExistingBook = await getBookBySha256(sha256);
			if (anyExistingBook?.hasEpubData) {
				// Another user has this book - we can adopt it (EPUB data is shared)
				// But still show the announcement modal so user can customize metadata
				console.log(`[Import] Found existing EPUB from another user, will share data`);
			}

			// Extract cover as base64 for persistent storage
			const coverDataUrl = await epubService.extractCoverAsDataUrl(parsed.book);
			// Convert data URL to base64 (remove prefix)
			const coverBase64 = coverDataUrl?.replace(/^data:image\/[^;]+;base64,/, '');

			// Store pending book data and show announcement modal
			pendingBook = {
				sha256,
				title: parsed.metadata.title,
				author: parsed.metadata.author,
				coverBase64,
				totalPages: parsed.metadata.totalPages,
				arrayBuffer: parsed.arrayBuffer,
			};
			showAnnouncementModal = true;
		} catch (error) {
			console.error('Failed to import EPUB:', error);
			if (error instanceof AppError) {
				toast.error(error.message);
			} else {
				toast.error('Failed to import EPUB. Please try again.');
			}
		} finally {
			isImporting = false;
		}
	}

	async function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		await processFile(file);
		// Reset input so same file can be selected again
		input.value = '';
	}

	async function handleAnnouncementSave(updatedBook: BookIdentity, isPublic: boolean) {
		if (!pendingBook) return;

		try {
			// Add book to store with updated metadata
			const bookId = await books.add({
				// BookIdentity (publishable)
				sha256: pendingBook.sha256,
				title: updatedBook.title,
				author: updatedBook.author,
				coverBase64: updatedBook.coverBase64,
				isbn: updatedBook.isbn,
				year: updatedBook.year,
				// BookLocal (not published)
				progress: 0,
				currentPage: 0,
				totalPages: pendingBook.totalPages,
				hasEpubData: true,
				isPublic,
			});

			// Store EPUB data for later reading
			await storeEpubData(bookId, pendingBook.arrayBuffer);

			// Publish to Nostr if public
			if (isPublic) {
				const result = await books.publishBook(bookId);
				if (result.success) {
					toast.success(`Published "${updatedBook.title}" to Nostr`);
				} else {
					toast.success(`Imported "${updatedBook.title}"`);
					toast.warning('Failed to publish to Nostr: ' + result.error);
				}
			} else {
				toast.success(`Imported "${updatedBook.title}" (local only)`);
			}
		} catch (error) {
			console.error('Failed to save book:', error);
			toast.error('Failed to save book');
		} finally {
			pendingBook = null;
		}
	}

	function handleAnnouncementClose() {
		// User cancelled - don't save the book
		pendingBook = null;
		showAnnouncementModal = false;
	}
</script>

<input
	bind:this={fileInput}
	type="file"
	accept=".epub"
	class="hidden"
	onchange={handleFileSelect}
/>

<button
	onclick={handleClick}
	disabled={isImporting}
	class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
>
	{#if isImporting}
		<Loader2 class="h-4 w-4 animate-spin" />
		Importing...
	{:else}
		<Upload class="h-4 w-4" />
		Import EPUB
	{/if}
</button>

<!-- Book Announcement Modal -->
{#if pendingBook}
	<BookAnnouncementModal
		book={{
			sha256: pendingBook.sha256,
			title: pendingBook.title,
			author: pendingBook.author,
			coverBase64: pendingBook.coverBase64,
		}}
		isOpen={showAnnouncementModal}
		isEdit={false}
		onClose={handleAnnouncementClose}
		onSave={handleAnnouncementSave}
	/>
{/if}
