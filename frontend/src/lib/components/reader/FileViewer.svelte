<script lang="ts">
	import { X, Download, Trash2, ExternalLink, Copy, Check } from '@lucide/svelte';
	import { userFilesStore, type UserFile } from '$lib/stores/userFiles.svelte';
	import { MarkdownRenderer } from '$lib/components/chat';
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		file: UserFile | null;
		open: boolean;
		onClose?: () => void;
		onDelete?: (file: UserFile) => void;
	}

	let { file, open, onClose, onDelete }: Props = $props();

	let fileUrl = $state<string | null>(null);
	let copied = $state(false);

	// Create object URL when file changes
	$effect(() => {
		if (file && open) {
			// Revoke old URL
			if (fileUrl) {
				URL.revokeObjectURL(fileUrl);
			}
			// Create new URL
			fileUrl = userFilesStore.getFileUrl(file);
		}
	});

	// Cleanup on unmount
	onDestroy(() => {
		if (fileUrl) {
			URL.revokeObjectURL(fileUrl);
		}
	});

	function handleClose() {
		if (fileUrl) {
			URL.revokeObjectURL(fileUrl);
			fileUrl = null;
		}
		onClose?.();
	}

	function handleDownload() {
		if (!file || !fileUrl) return;
		
		const a = document.createElement('a');
		a.href = fileUrl;
		a.download = file.name;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	function handleDelete() {
		if (file) {
			onDelete?.(file);
			handleClose();
		}
	}

	function handleCopyContent() {
		if (file?.textContent) {
			navigator.clipboard.writeText(file.textContent);
			copied = true;
			setTimeout(() => { copied = false; }, 2000);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open && file}
	<!-- Backdrop -->
	<button
		class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
		onclick={handleClose}
		aria-label="Close file viewer"
	></button>

	<!-- Modal -->
	<div class="fixed inset-4 md:inset-8 lg:inset-12 z-50 flex flex-col rounded-xl border border-border bg-background shadow-2xl overflow-hidden">
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-border px-4 py-3 flex-shrink-0">
			<div class="flex items-center gap-3 min-w-0 flex-1">
				<h2 class="text-sm font-semibold text-foreground truncate">
					{file.name}
				</h2>
				<span class="text-xs text-muted-foreground flex-shrink-0">
					{userFilesStore.formatSize(file.size)}
				</span>
			</div>

			<div class="flex items-center gap-2 flex-shrink-0">
				{#if file.textContent}
					<button
						onclick={handleCopyContent}
						class="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
					>
						{#if copied}
							<Check class="h-3.5 w-3.5 text-green-500" />
							<span>Copied</span>
						{:else}
							<Copy class="h-3.5 w-3.5" />
							<span>Copy Text</span>
						{/if}
					</button>
				{/if}

				<button
					onclick={handleDownload}
					class="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
				>
					<Download class="h-3.5 w-3.5" />
					<span>Download</span>
				</button>

				<button
					onclick={handleDelete}
					class="flex items-center gap-1.5 rounded-md border border-destructive/50 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
				>
					<Trash2 class="h-3.5 w-3.5" />
					<span>Delete</span>
				</button>

				<button
					onclick={handleClose}
					class="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
				>
					<X class="h-5 w-5" />
				</button>
			</div>
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-hidden">
			{#if file.type === 'pdf' && fileUrl}
				<!-- PDF viewer -->
				<iframe
					src={fileUrl}
					title={file.name}
					class="w-full h-full"
				></iframe>
			{:else if file.type === 'image' && fileUrl}
				<!-- Image viewer -->
				<div class="flex items-center justify-center h-full p-4 bg-muted/30">
					<img
						src={fileUrl}
						alt={file.name}
						class="max-w-full max-h-full object-contain rounded-lg"
					/>
				</div>
			{:else if file.type === 'text' && file.textContent}
				<!-- Text viewer -->
				<div class="h-full overflow-y-auto p-6">
					{#if file.mimeType === 'text/markdown'}
						<div class="prose prose-invert prose-sm max-w-none">
							<MarkdownRenderer content={file.textContent} />
						</div>
					{:else}
						<pre class="text-sm text-foreground/90 whitespace-pre-wrap font-mono">{file.textContent}</pre>
					{/if}
				</div>
			{:else}
				<!-- Fallback -->
				<div class="flex flex-col items-center justify-center h-full py-20 text-center">
					<p class="text-muted-foreground mb-4">
						Preview not available for this file type
					</p>
					<button
						onclick={handleDownload}
						class="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
					>
						<Download class="h-4 w-4" />
						Download File
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

