<script lang="ts">
	import { X, Upload, Globe, Lock, Loader2 } from '@lucide/svelte';
	import { books } from '$lib/stores/books';
	import type { BookIdentity } from '$lib/types';

	interface Props {
		book: BookIdentity & { id?: string };
		isOpen: boolean;
		isEdit?: boolean;
		onClose: () => void;
		onSave: (book: BookIdentity, isPublic: boolean) => Promise<void>;
	}

	let { book, isOpen, isEdit = false, onClose, onSave }: Props = $props();

	// Editable form state
	let title = $state(book.title);
	let author = $state(book.author);
	let year = $state(book.year?.toString() || '');
	let isbn = $state(book.isbn || '');
	let coverBase64 = $state(book.coverBase64 || '');
	let isPublic = $state(true);
	let isSaving = $state(false);
	let error = $state<string | null>(null);

	// Cover image preview
	const coverUrl = $derived(
		coverBase64 ? (coverBase64.startsWith('data:') ? coverBase64 : `data:image/jpeg;base64,${coverBase64}`) : null
	);

	// Reset form when book changes
	$effect(() => {
		title = book.title;
		author = book.author;
		year = book.year?.toString() || '';
		isbn = book.isbn || '';
		coverBase64 = book.coverBase64 || '';
	});

	async function handleCoverUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		// Validate file type
		if (!file.type.startsWith('image/')) {
			error = 'Please select an image file';
			return;
		}

		try {
			const processed = await processCoverImage(file);
			coverBase64 = processed;
			error = null;
		} catch (e) {
			error = 'Failed to process image';
			console.error(e);
		}
	}

	async function processCoverImage(file: Blob): Promise<string> {
		const targetWidth = 128;
		const targetHeight = 192;

		// Load image
		const img = await createImageBitmap(file);

		// Create canvas with target dimensions
		const canvas = document.createElement('canvas');
		canvas.width = targetWidth;
		canvas.height = targetHeight;
		const ctx = canvas.getContext('2d')!;

		// Calculate crop (center crop to 2:3 ratio)
		const sourceRatio = img.width / img.height;
		const targetRatio = targetWidth / targetHeight;

		let sx = 0, sy = 0, sw = img.width, sh = img.height;
		if (sourceRatio > targetRatio) {
			// Source is wider - crop sides
			sw = img.height * targetRatio;
			sx = (img.width - sw) / 2;
		} else {
			// Source is taller - crop top/bottom
			sh = img.width / targetRatio;
			sy = (img.height - sh) / 2;
		}

		// Draw cropped & scaled image
		ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);

		// Export as JPEG data URL (without the data:image/jpeg;base64, prefix)
		const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
		const base64 = dataUrl.split(',')[1];
		return base64;
	}

	async function handleSave() {
		if (!title.trim()) {
			error = 'Title is required';
			return;
		}

		isSaving = true;
		error = null;

		try {
			const updatedBook: BookIdentity = {
				sha256: book.sha256,
				title: title.trim(),
				author: author.trim() || 'Unknown Author',
				year: year ? parseInt(year, 10) : undefined,
				isbn: isbn.trim() || undefined,
				coverBase64: coverBase64 || undefined,
			};

			await onSave(updatedBook, isPublic);
			onClose();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to save book';
		} finally {
			isSaving = false;
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onClose();
		}
	}
</script>

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		onclick={handleBackdropClick}
	>
		<div class="w-full max-w-md rounded-lg border border-border bg-background shadow-xl">
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-border p-4">
				<h2 class="text-lg font-semibold">
					{isEdit ? 'Edit Book' : 'Announce Book'}
				</h2>
				<button
					onclick={onClose}
					class="rounded-md p-1 hover:bg-accent"
					aria-label="Close"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- Content -->
			<div class="p-4 space-y-4">
				<!-- Cover and basic info -->
				<div class="flex gap-4">
					<!-- Cover image -->
					<div class="flex-shrink-0">
						<div class="relative h-32 w-[85px] overflow-hidden rounded-md border border-border bg-muted">
							{#if coverUrl}
								<img src={coverUrl} alt="Cover" class="h-full w-full object-cover" />
							{:else}
								<div class="flex h-full w-full items-center justify-center text-muted-foreground">
									<Upload class="h-6 w-6" />
								</div>
							{/if}
						</div>
						<label class="mt-2 block">
							<span class="sr-only">Upload cover</span>
							<input
								type="file"
								accept="image/*"
								onchange={handleCoverUpload}
								class="block w-full text-xs text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-primary file:px-2 file:py-1 file:text-xs file:text-primary-foreground hover:file:bg-primary/90"
							/>
						</label>
					</div>

					<!-- Title and Author -->
					<div class="flex-1 space-y-3">
						<div>
							<label for="title" class="block text-sm font-medium mb-1">Title</label>
							<input
								id="title"
								type="text"
								bind:value={title}
								class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
								placeholder="Book title"
							/>
						</div>
						<div>
							<label for="author" class="block text-sm font-medium mb-1">Author</label>
							<input
								id="author"
								type="text"
								bind:value={author}
								class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
								placeholder="Author name"
							/>
						</div>
					</div>
				</div>

				<!-- Year and ISBN -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label for="year" class="block text-sm font-medium mb-1">Year</label>
						<input
							id="year"
							type="text"
							bind:value={year}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
							placeholder="1925"
						/>
					</div>
					<div>
						<label for="isbn" class="block text-sm font-medium mb-1">ISBN</label>
						<input
							id="isbn"
							type="text"
							bind:value={isbn}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
							placeholder="978-0-123456-78-9"
						/>
					</div>
				</div>

				<!-- Publish options -->
				{#if !isEdit}
					<div class="space-y-2 pt-2">
						<p class="text-sm font-medium">Sync Options</p>
						<label class="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-accent/50 {isPublic ? 'border-primary bg-primary/5' : ''}">
							<input
								type="radio"
								name="publish"
								checked={isPublic}
								onchange={() => isPublic = true}
								class="mt-0.5"
							/>
							<div class="flex-1">
								<div class="flex items-center gap-2">
									<Globe class="h-4 w-4 text-green-500" />
									<span class="font-medium text-sm">Publish to Nostr</span>
								</div>
								<p class="text-xs text-muted-foreground mt-0.5">
									Book metadata and annotations will sync across devices
								</p>
							</div>
						</label>
						<label class="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-accent/50 {!isPublic ? 'border-primary bg-primary/5' : ''}">
							<input
								type="radio"
								name="publish"
								checked={!isPublic}
								onchange={() => isPublic = false}
								class="mt-0.5"
							/>
							<div class="flex-1">
								<div class="flex items-center gap-2">
									<Lock class="h-4 w-4 text-muted-foreground" />
									<span class="font-medium text-sm">Local Only</span>
								</div>
								<p class="text-xs text-muted-foreground mt-0.5">
									Keep this book private on this device
								</p>
							</div>
						</label>
					</div>
				{/if}

				<!-- Error message -->
				{#if error}
					<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
						{error}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="flex justify-end gap-2 border-t border-border p-4">
				<button
					onclick={onClose}
					class="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
					disabled={isSaving}
				>
					Cancel
				</button>
				<button
					onclick={handleSave}
					disabled={isSaving || !title.trim()}
					class="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
				>
					{#if isSaving}
						<Loader2 class="h-4 w-4 animate-spin" />
						Saving...
					{:else}
						{isEdit ? 'Save Changes' : (isPublic ? 'Publish' : 'Save Locally')}
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
