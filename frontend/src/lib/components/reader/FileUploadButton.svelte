<script lang="ts">
	import { Upload, Loader2, FileText, Image, File } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { userFilesStore, type UserFile } from '$lib/stores/userFiles.svelte';

	interface Props {
		class?: string;
		variant?: 'default' | 'compact';
		onFileImported?: (file: UserFile) => void; // Callback when a file is imported
	}

	let { class: className = '', variant = 'default', onFileImported }: Props = $props();

	let isUploading = $state(false);
	let inputRef = $state<HTMLInputElement | null>(null);

	const ACCEPTED_TYPES = [
		'application/pdf',
		'image/png',
		'image/jpeg',
		'image/webp',
		'image/gif',
		'text/plain',
		'text/markdown',
	].join(',');

	async function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const files = input.files;
		
		if (!files || files.length === 0) return;
		
		isUploading = true;
		
		try {
			for (const file of Array.from(files)) {
				const result = await userFilesStore.uploadFile(file);
				
				if (result.success && result.file) {
					toast.success(`Imported ${file.name}`);
					// Call callback for single file imports
					if (files.length === 1 && onFileImported) {
						onFileImported(result.file);
					}
				} else {
					toast.error(`Failed to import ${file.name}`, {
						description: result.error
					});
				}
			}
		} finally {
			isUploading = false;
			// Reset input
			if (inputRef) {
				inputRef.value = '';
			}
		}
	}

	function handleClick() {
		inputRef?.click();
	}
	
	// Expose processFile for external drag-and-drop handling
	export async function processFile(file: globalThis.File): Promise<UserFile | null> {
		isUploading = true;
		try {
			const result = await userFilesStore.uploadFile(file);
			if (result.success && result.file) {
				toast.success(`Imported ${file.name}`);
				return result.file;
			} else {
				toast.error(`Failed to import ${file.name}`, { description: result.error });
				return null;
			}
		} finally {
			isUploading = false;
		}
	}
</script>

<input
	bind:this={inputRef}
	type="file"
	accept={ACCEPTED_TYPES}
	multiple
	class="hidden"
	onchange={handleFileSelect}
/>

{#if variant === 'compact'}
	<button
		onclick={handleClick}
		disabled={isUploading}
		class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 {className}"
	>
		{#if isUploading}
			<Loader2 class="h-4 w-4 animate-spin" />
			<span>Importing...</span>
		{:else}
			<Upload class="h-4 w-4" />
			<span>Import File</span>
		{/if}
	</button>
{:else}
	<button
		onclick={handleClick}
		disabled={isUploading}
		class="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-secondary/30 p-8 transition-all hover:border-primary/50 hover:bg-secondary/50 disabled:opacity-50 {className}"
	>
		{#if isUploading}
			<Loader2 class="h-10 w-10 animate-spin text-primary" />
			<span class="text-sm font-medium text-foreground">Importing...</span>
		{:else}
			<div class="flex items-center gap-2">
				<FileText class="h-6 w-6 text-red-500" />
				<Image class="h-6 w-6 text-blue-500" />
				<File class="h-6 w-6 text-green-500" />
			</div>
			<div class="text-center">
				<p class="text-sm font-medium text-foreground">Import Files</p>
				<p class="text-xs text-muted-foreground mt-1">PDFs, images, and text files</p>
			</div>
		{/if}
	</button>
{/if}

