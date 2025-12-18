<script lang="ts">
	import { Upload, Loader2 } from '@lucide/svelte';
	import { books, storeEpubData } from '$lib/stores/books';
	import { epubService } from '$lib/services/epubService';
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

			// Extract cover as data URL for persistent storage
			const coverDataUrl = await epubService.extractCoverAsDataUrl(parsed.book);

			// Add book to store
			const bookId = books.addBook({
				title: parsed.metadata.title,
				author: parsed.metadata.author,
				coverUrl: coverDataUrl,
				totalPages: parsed.metadata.totalPages,
				currentPage: 0,
				progress: 0
			});

			// Store EPUB data for later reading
			await storeEpubData(bookId, parsed.arrayBuffer);

			toast.success(`Imported "${parsed.metadata.title}"`);
		} catch (error) {
			console.error('Failed to import EPUB:', error);
			toast.error('Failed to import EPUB. Please try again.');
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
