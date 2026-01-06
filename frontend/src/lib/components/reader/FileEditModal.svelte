<script lang="ts">
	import { X, Upload, Globe, Lock, Loader2, FileText, Image, File, Link, Tag, Plus, Check, Search } from '@lucide/svelte';
	import { userFilesStore, type UserFile } from '$lib/stores/userFiles.svelte';
	import { Popover } from 'bits-ui';

	interface Props {
		file: UserFile | null;
		open: boolean;
		onClose: () => void;
		isNewFile?: boolean; // True when showing after initial import
	}

	let { file, open, onClose, isNewFile = false }: Props = $props();

	// Editable form state
	let name = $state('');
	let description = $state('');
	let sourceUrl = $state('');
	let tags = $state<string[]>([]);
	let customThumbnail = $state<string | null>(null); // User-uploaded cover image
	let isPublic = $state(false); // Default to local only
	let isSaving = $state(false);
	let error = $state<string | null>(null);
	
	// Cover upload state
	let coverInputRef = $state<HTMLInputElement | null>(null);
	let isDraggingCover = $state(false);
	let dragCounter = $state(0); // Counter to handle nested element drag events
	
	// Tag management
	let tagSearch = $state('');
	let showTagPopover = $state(false);
	let tagSearchInput = $state<HTMLInputElement | null>(null);
	
	// Available tags (in the future these could be persisted per-user)
	const availableTags = [
		{ name: 'research', color: 'bg-blue-500' },
		{ name: 'reference', color: 'bg-purple-500' },
		{ name: 'notes', color: 'bg-green-500' },
		{ name: 'draft', color: 'bg-red-500' },
		{ name: 'important', color: 'bg-yellow-500' },
		{ name: 'archive', color: 'bg-gray-500' },
	];
	
	const RANDOM_COLORS = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500'];

	// The thumbnail to display (custom or original)
	const displayThumbnail = $derived(customThumbnail || file?.thumbnail || null);

	// Reset form when file changes
	$effect(() => {
		if (file) {
			name = file.name;
			description = file.description || '';
			sourceUrl = file.sourceUrl || '';
			tags = file.tags ? [...file.tags] : [];
			customThumbnail = null; // Reset custom thumbnail
			isPublic = file.isPublic ?? false;
			error = null;
			// Reset drag state
			dragCounter = 0;
			isDraggingCover = false;
		}
	});
	
	// Cover image processing
	async function processCoverImage(imageFile: Blob): Promise<string> {
		const targetWidth = 150;
		const targetHeight = 225; // 2:3 aspect ratio

		// Load image
		const img = await createImageBitmap(imageFile);

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

		// Export as JPEG data URL
		return canvas.toDataURL('image/jpeg', 0.85);
	}
	
	async function handleCoverUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const imageFile = input.files?.[0];
		if (!imageFile) return;

		// Validate file type
		if (!imageFile.type.startsWith('image/')) {
			error = 'Please select an image file';
			return;
		}

		try {
			customThumbnail = await processCoverImage(imageFile);
			error = null;
		} catch (e) {
			error = 'Failed to process image';
			console.error(e);
		}
	}
	
	function handleCoverDragEnter(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		dragCounter++;
		isDraggingCover = true;
	}
	
	function handleCoverDragOver(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		// Keep drag state active
		if (!isDraggingCover) isDraggingCover = true;
	}
	
	function handleCoverDragLeave(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		dragCounter--;
		// Only hide overlay when we've left all elements
		if (dragCounter <= 0) {
			dragCounter = 0;
			isDraggingCover = false;
		}
	}
	
	async function handleCoverDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		dragCounter = 0;
		isDraggingCover = false;
		
		const imageFile = e.dataTransfer?.files?.[0];
		if (!imageFile) return;
		
		// Use content detection for images too
		const arrayBuffer = await imageFile.arrayBuffer();
		const bytes = new Uint8Array(arrayBuffer.slice(0, 16));
		
		// Check for image signatures
		const isImage = (
			// JPEG
			(bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) ||
			// PNG
			(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) ||
			// GIF
			(bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) ||
			// WebP (RIFF + WEBP)
			(bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
			 bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) ||
			// BMP
			(bytes[0] === 0x42 && bytes[1] === 0x4D) ||
			// Browser says it's an image
			imageFile.type.startsWith('image/')
		);
		
		if (!isImage) {
			error = 'Please drop an image file';
			return;
		}
		
		try {
			// Create a blob from the arrayBuffer we already read
			const blob = new Blob([arrayBuffer], { type: imageFile.type || 'image/jpeg' });
			customThumbnail = await processCoverImage(blob);
			error = null;
		} catch (err) {
			error = 'Failed to process image';
			console.error(err);
		}
	}

	function getIcon(type: UserFile['type']) {
		switch (type) {
			case 'pdf': return FileText;
			case 'image': return Image;
			default: return File;
		}
	}

	function getTypeColor(type: UserFile['type']): string {
		switch (type) {
			case 'pdf': return 'text-red-500';
			case 'image': return 'text-blue-500';
			default: return 'text-green-500';
		}
	}
	
	function getTypeBgColor(type: UserFile['type']): string {
		switch (type) {
			case 'pdf': return 'bg-red-500/10';
			case 'image': return 'bg-blue-500/10';
			default: return 'bg-green-500/10';
		}
	}
	
	function getTypeLabel(type: UserFile['type']): string {
		switch (type) {
			case 'pdf': return 'PDF';
			case 'image': return 'Image';
			default: return 'Text';
		}
	}
	
	function getTagColor(tagName: string): string {
		const existing = availableTags.find(t => t.name === tagName);
		if (existing) return existing.color;
		// Generate consistent color from tag name
		const index = tagName.charCodeAt(0) % RANDOM_COLORS.length;
		return RANDOM_COLORS[index];
	}
	
	function toggleTag(tagName: string) {
		if (tags.includes(tagName)) {
			tags = tags.filter(t => t !== tagName);
		} else {
			tags = [...tags, tagName];
		}
	}
	
	function addCustomTag(tagName: string) {
		if (!tagName.trim()) return;
		const normalized = tagName.trim().toLowerCase();
		if (!tags.includes(normalized)) {
			tags = [...tags, normalized];
		}
		tagSearch = '';
		showTagPopover = false;
	}

	async function handleSave() {
		if (!file || !name.trim()) {
			error = 'File name is required';
			return;
		}

		isSaving = true;
		error = null;

		try {
			await userFilesStore.updateFile(file.id, { 
				name: name.trim(),
				description: description.trim() || undefined,
				sourceUrl: sourceUrl.trim() || undefined,
				tags: tags.length > 0 ? tags : undefined,
				thumbnail: customThumbnail || file.thumbnail, // Use custom if provided
				isPublic,
			});
			onClose();
		} catch (e) {
			error = (e as Error).message || 'Failed to save changes';
		} finally {
			isSaving = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}
	
	const filteredAvailableTags = $derived(
		availableTags.filter(t => t.name.toLowerCase().includes(tagSearch.toLowerCase()))
	);
	
	// Derived icon component for the file type
	const FileTypeIcon = $derived(file ? getIcon(file.type) : File);
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open && file}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
	>
		<div class="w-full max-w-md rounded-lg border border-border bg-background shadow-xl">
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-border p-4">
				<h2 class="text-lg font-semibold">
					{isNewFile ? 'Import File' : 'Edit File'}
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
				<!-- File preview and name -->
				<div class="flex gap-4">
					<!-- Thumbnail with upload capability -->
					<label 
						class="group relative flex-shrink-0 cursor-pointer"
						ondragenter={handleCoverDragEnter}
						ondragover={handleCoverDragOver}
						ondragleave={handleCoverDragLeave}
						ondrop={handleCoverDrop}
					>
						<div class="relative h-36 w-24 overflow-hidden rounded-md border border-border bg-muted transition-all {isDraggingCover ? 'border-primary border-2 scale-105' : ''}">
							{#if displayThumbnail}
								<img 
									src={displayThumbnail} 
									alt={file.name} 
									class="h-full w-full object-cover {isDraggingCover ? 'pointer-events-none' : ''}" 
								/>
							{:else}
								<div class="flex h-full w-full items-center justify-center {isDraggingCover ? 'pointer-events-none' : ''}">
									<FileTypeIcon class="h-8 w-8 {getTypeColor(file.type)}" />
								</div>
							{/if}
							<!-- Hover overlay -->
							<div class="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none">
								<div class="text-center text-white">
									<Upload class="mx-auto h-5 w-5 mb-1" />
									<span class="text-xs">Upload Cover</span>
								</div>
							</div>
							<!-- Drag overlay -->
							{#if isDraggingCover}
								<div class="absolute inset-0 flex items-center justify-center bg-primary/80 pointer-events-none">
									<div class="text-center text-white">
										<Upload class="mx-auto h-5 w-5 mb-1 animate-bounce" />
										<span class="text-xs">Drop Image</span>
									</div>
								</div>
							{/if}
						</div>
						<input
							bind:this={coverInputRef}
							type="file"
							accept="image/*"
							onchange={handleCoverUpload}
							class="hidden"
						/>
					</label>

					<!-- Name and type info -->
					<div class="flex-1 space-y-3">
						<div>
							<label for="file-name" class="block text-sm font-medium mb-1">File Name</label>
							<input
								id="file-name"
								type="text"
								bind:value={name}
								class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
								placeholder="File name"
							/>
						</div>
						<!-- File Type (read-only, detected from content) -->
						<div class="space-y-1.5">
							<div class="flex items-center gap-2">
								<span class="text-xs font-medium text-muted-foreground">Type:</span>
								<span class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium {getTypeBgColor(file.type)} {getTypeColor(file.type)}">
									<FileTypeIcon class="h-3 w-3" />
									{getTypeLabel(file.type)}
								</span>
							</div>
							<div class="flex items-center gap-2">
								<span class="text-xs font-medium text-muted-foreground">MIME:</span>
								<code class="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{file.mimeType}</code>
							</div>
							<div class="flex items-center gap-2">
								<span class="text-xs font-medium text-muted-foreground">Size:</span>
								<span class="text-xs text-muted-foreground">{userFilesStore.formatSize(file.size)}</span>
							</div>
						</div>
					</div>
				</div>

				<!-- Description -->
				<div>
					<label for="description" class="block text-sm font-medium mb-1">Description</label>
					<textarea
						id="description"
						bind:value={description}
						rows={2}
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
						placeholder="Add a description..."
					></textarea>
				</div>

				<!-- Source URL -->
				<div>
					<label for="source-url" class="flex items-center gap-2 text-sm font-medium mb-1">
						<Link class="h-3.5 w-3.5" />
						Source URL
					</label>
					<input
						id="source-url"
						type="url"
						bind:value={sourceUrl}
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
						placeholder="https://..."
					/>
				</div>

				<!-- Tags -->
				<div>
					<label class="flex items-center gap-2 text-sm font-medium mb-2">
						<Tag class="h-3.5 w-3.5" />
						Tags
					</label>
					
					<!-- Selected Tags -->
					<div class="flex flex-wrap gap-1.5 mb-2">
						{#each tags as tag}
							<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-secondary">
								<span class="size-1.5 rounded-full {getTagColor(tag)}"></span>
								{tag}
								<button 
									onclick={() => toggleTag(tag)}
									class="ml-0.5 text-muted-foreground hover:text-foreground"
								>
									<X class="h-3 w-3" />
								</button>
							</span>
						{/each}
						
						<!-- Add Tag Button -->
						<Popover.Root bind:open={showTagPopover}>
							<Popover.Trigger
								class="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
							>
								<Plus class="h-3 w-3" />
								Add tag
							</Popover.Trigger>
							<Popover.Portal>
								<Popover.Content
									side="bottom"
									align="start"
									sideOffset={5}
									class="z-[60] w-48 rounded-lg border border-border bg-popover p-1 shadow-xl"
								>
									<!-- Search input -->
									<div class="flex items-center gap-2 border-b border-border px-2 py-1.5">
										<Search class="h-3 w-3 text-muted-foreground" />
										<input
											bind:this={tagSearchInput}
											bind:value={tagSearch}
											placeholder="Search or create..."
											class="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
											onkeydown={(e) => {
												if (e.key === 'Enter' && tagSearch.trim()) {
													addCustomTag(tagSearch.trim());
												}
											}}
										/>
									</div>
									
									<!-- Tag list -->
									<div class="max-h-48 overflow-y-auto py-1">
										{#each filteredAvailableTags as tag}
											{@const isSelected = tags.includes(tag.name)}
											<button
												onclick={() => toggleTag(tag.name)}
												class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
											>
												<span class="size-1.5 rounded-full {tag.color}"></span>
												<span class="flex-1 capitalize">{tag.name}</span>
												{#if isSelected}
													<Check class="h-3 w-3 text-primary" />
												{/if}
											</button>
										{/each}
										
										{#if tagSearch.trim() && !availableTags.some(t => t.name.toLowerCase() === tagSearch.trim().toLowerCase())}
											<button
												onclick={() => addCustomTag(tagSearch.trim())}
												class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs italic text-muted-foreground hover:bg-accent"
											>
												<Plus class="h-3 w-3" />
												<span>Create "{tagSearch}"</span>
											</button>
										{/if}
									</div>
								</Popover.Content>
							</Popover.Portal>
						</Popover.Root>
					</div>
				</div>

				<!-- Sync Options -->
				<div class="space-y-2 pt-2">
					<p class="text-sm font-medium">Storage</p>
					<label class="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-accent/50 {!isPublic ? 'border-primary bg-primary/5' : ''}">
						<input
							type="radio"
							name="storage"
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
								Keep this file private on this device
							</p>
						</div>
					</label>
					<label class="flex items-start gap-3 rounded-md border border-border p-3 cursor-not-allowed opacity-50 {isPublic ? 'border-primary bg-primary/5' : ''}">
						<input
							type="radio"
							name="storage"
							checked={isPublic}
							disabled
							class="mt-0.5"
						/>
						<div class="flex-1">
							<div class="flex items-center gap-2">
								<Globe class="h-4 w-4 text-green-500" />
								<span class="font-medium text-sm">Sync to Nostr</span>
								<span class="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Coming soon</span>
							</div>
							<p class="text-xs text-muted-foreground mt-0.5">
								File metadata will sync across devices
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
					disabled={isSaving || !name.trim()}
					class="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
				>
					{#if isSaving}
						<Loader2 class="h-4 w-4 animate-spin" />
						Saving...
					{:else}
						{isNewFile ? 'Import File' : 'Save Changes'}
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
