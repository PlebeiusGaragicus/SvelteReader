<script lang="ts">
	import { X, Upload, Globe, Lock, Loader2 } from '@lucide/svelte';
	import type { BookIdentity } from '$lib/types';

	interface Props {
		book: BookIdentity & { id?: string; isPublic?: boolean };
		isOpen: boolean;
		onClose: () => void;
		onSave: (book: BookIdentity, isPublic: boolean) => Promise<void>;
	}

	let { book, isOpen, onClose, onSave }: Props = $props();

	// Editable form state
	let title = $state('');
	let author = $state('');
	let year = $state('');
	let isbn = $state('');
	let coverBase64 = $state('');
	let isPublic = $state(true);
	let isSaving = $state(false);
	let error = $state<string | null>(null);
	
	// Determine if editing existing book (has id) vs new book
	const isEdit = $derived(!!book.id);

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
		isPublic = book.isPublic ?? true;
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

	</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
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
				<!-- Cover image with hover upload -->
				<div class="flex gap-4">
					<label class="group relative flex-shrink-0 cursor-pointer">
						<div class="relative h-36 w-24 overflow-hidden rounded-md border border-border bg-muted">
							{#if coverUrl}
								<img src={coverUrl} alt="Cover" class="h-full w-full object-cover" />
							{:else}
								<div class="flex h-full w-full items-center justify-center text-muted-foreground">
									<Upload class="h-6 w-6" />
								</div>
							{/if}
							<!-- Hover overlay -->
							<div class="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
								<div class="text-center text-white">
									<Upload class="mx-auto h-5 w-5 mb-1" />
									<span class="text-xs">Upload Image</span>
								</div>
							</div>
						</div>
						<input
							type="file"
							accept="image/*"
							onchange={handleCoverUpload}
							class="hidden"
						/>
					</label>

					<!-- Title and Author - stacked on right -->
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
							placeholder=""
						/>
					</div>
					<div>
						<label for="isbn" class="block text-sm font-medium mb-1">ISBN</label>
						<input
							id="isbn"
							type="text"
							bind:value={isbn}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
							placeholder=""
						/>
					</div>
				</div>

				<!-- Publish options -->
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
						{isPublic ? 'Save & Publish' : 'Save Locally'}
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
