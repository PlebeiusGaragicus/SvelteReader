<script lang="ts">
	import { Upload, Loader2 } from '@lucide/svelte';
	import { books } from '$lib/stores/books';
	import { storeEpubData, computeSha256, getBookBySha256 } from '$lib/services/storageService';
	import { epubService } from '$lib/services/epubService';
	import { AppError } from '$lib/types';
	import { toast } from 'svelte-sonner';

	let fileInput: HTMLInputElement;
	let isImporting = $state(false);

	function handleClick() {
		fileInput?.click();
	}

	async function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		if (!file.name.toLowerCase().endsWith('.epub')) {
			toast.error('Please select an EPUB file');
			return;
		}

		isImporting = true;

		try {
			const parsed = await epubService.parseEpub(file);

			// Compute SHA-256 hash of the EPUB file
			const sha256 = await computeSha256(parsed.arrayBuffer);

			// Check if book already exists (by content hash)
			const existingBook = await getBookBySha256(sha256);
			if (existingBook) {
				if (existingBook.hasEpubData) {
					toast.info(`"${existingBook.title}" is already in your library`);
					return;
				} else {
					// Ghost book exists - add EPUB data to it
					await storeEpubData(existingBook.id, parsed.arrayBuffer);
					await books.update(existingBook.id, { hasEpubData: true });
					toast.success(`Added EPUB data to "${existingBook.title}"`);
					return;
				}
			}

			// Extract cover as base64 for persistent storage
			const coverDataUrl = await epubService.extractCoverAsDataUrl(parsed.book);
			// Convert data URL to base64 (remove prefix)
			const coverBase64 = coverDataUrl?.replace(/^data:image\/[^;]+;base64,/, '');

			// Add book to store with new structure
			const bookId = await books.add({
				// BookIdentity (publishable)
				sha256,
				title: parsed.metadata.title,
				author: parsed.metadata.author,
				coverBase64,
				// BookLocal (not published)
				progress: 0,
				currentPage: 0,
				totalPages: parsed.metadata.totalPages,
				hasEpubData: true
			});

			// Store EPUB data for later reading
			await storeEpubData(bookId, parsed.arrayBuffer);

			toast.success(`Imported "${parsed.metadata.title}"`);
		} catch (error) {
			console.error('Failed to import EPUB:', error);
			if (error instanceof AppError) {
				toast.error(error.message);
			} else {
				toast.error('Failed to import EPUB. Please try again.');
			}
		} finally {
			isImporting = false;
			// Reset input so same file can be selected again
			input.value = '';
		}
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
