<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { userFilesStore, type UserFile } from '$lib/stores/userFiles.svelte';
	import { modeStore } from '$lib/stores/mode.svelte';
	import { cyphertap } from 'cyphertap';
	import { ArrowLeft, Download, Trash2, Copy, Check, FileText, Image, File, Loader2 } from '@lucide/svelte';
	import { MarkdownRenderer } from '$lib/components/chat';
	import { toast } from 'svelte-sonner';

	const fileId = $derived($page.params.id);
	
	let file = $state<UserFile | null>(null);
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);
	let fileUrl = $state<string | null>(null);
	let copied = $state(false);
	let showDeleteConfirm = $state(false);

	// Ensure mode is set correctly
	onMount(async () => {
		if (modeStore.current !== 'reader') {
			modeStore.setMode('reader');
		}

		// Wait for CypherTap to be ready
		if (!cyphertap.isReady) {
			await new Promise<void>((resolve) => {
				const checkReady = () => {
					if (cyphertap.isReady) {
						resolve();
					} else {
						setTimeout(checkReady, 50);
					}
				};
				const timeout = setTimeout(() => resolve(), 3000);
				checkReady();
			});
		}

		// Initialize user files store if logged in
		if (cyphertap.isLoggedIn && cyphertap.npub) {
			await userFilesStore.initialize(cyphertap.npub);
		}

		// Find the file
		const foundFile = userFilesStore.getFile(fileId);
		if (!foundFile) {
			loadError = 'File not found';
			isLoading = false;
			return;
		}

		file = foundFile;
		
		// Create object URL for the file
		fileUrl = userFilesStore.getFileUrl(foundFile);
		isLoading = false;
	});

	onDestroy(() => {
		// Clean up object URL
		if (fileUrl) {
			URL.revokeObjectURL(fileUrl);
		}
	});

	function handleBack() {
		goto('/reader');
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

	async function handleDelete() {
		if (!file) return;
		
		await userFilesStore.deleteFile(file.id);
		toast.success(`Deleted "${file.name}"`);
		goto('/reader');
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
			handleBack();
		}
	}

	function getFileIcon(type: UserFile['type']) {
		switch (type) {
			case 'pdf': return FileText;
			case 'image': return Image;
			default: return File;
		}
	}

	function formatDate(timestamp: number): string {
		return new Date(timestamp).toLocaleDateString(undefined, {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>SvelteReader | {file?.name || 'File Viewer'}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

{#if isLoading}
	<div class="flex h-[calc(100vh-3.5rem)] items-center justify-center">
		<div class="flex flex-col items-center gap-3 text-muted-foreground">
			<Loader2 class="h-8 w-8 animate-spin" />
			<p>Loading file...</p>
		</div>
	</div>
{:else if loadError}
	<div class="flex h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-4">
		<p class="text-lg text-destructive">{loadError}</p>
		<p class="text-sm text-muted-foreground">The file may have been deleted or you don't have access to it.</p>
		<button
			onclick={handleBack}
			class="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
		>
			Back to Library
		</button>
	</div>
{:else if file}
	<div class="flex h-[calc(100vh-3.5rem)] flex-col">
		<!-- Header -->
		<header class="flex items-center justify-between border-b border-border bg-background px-4 py-3">
			<div class="flex items-center gap-3 min-w-0">
				<button
					onclick={handleBack}
					class="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
				>
					<ArrowLeft class="h-4 w-4" />
					<span class="hidden sm:inline">Back to Library</span>
				</button>
				
				<div class="h-6 w-px bg-border hidden sm:block"></div>
				
				<div class="flex items-center gap-2 min-w-0">
					<svelte:component this={getFileIcon(file.type)} class="h-5 w-5 text-muted-foreground flex-shrink-0" />
					<h1 class="text-sm font-semibold text-foreground truncate">
						{file.name}
					</h1>
				</div>
			</div>

			<div class="flex items-center gap-2">
				<span class="text-xs text-muted-foreground hidden md:block">
					{userFilesStore.formatSize(file.size)} • {formatDate(file.createdAt)}
				</span>
				
				{#if file.textContent}
					<button
						onclick={handleCopyContent}
						class="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
					>
						{#if copied}
							<Check class="h-3.5 w-3.5 text-green-500" />
							<span class="hidden sm:inline">Copied</span>
						{:else}
							<Copy class="h-3.5 w-3.5" />
							<span class="hidden sm:inline">Copy</span>
						{/if}
					</button>
				{/if}

				<button
					onclick={handleDownload}
					class="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
				>
					<Download class="h-3.5 w-3.5" />
					<span class="hidden sm:inline">Download</span>
				</button>

				<button
					onclick={() => showDeleteConfirm = true}
					class="flex items-center gap-1.5 rounded-md border border-destructive/50 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
				>
					<Trash2 class="h-3.5 w-3.5" />
					<span class="hidden sm:inline">Delete</span>
				</button>
			</div>
		</header>

		<!-- Content -->
		<div class="flex-1 overflow-hidden bg-muted/30">
			{#if file.type === 'pdf' && fileUrl}
				<!-- PDF viewer - use embed for better performance -->
				<embed
					src={fileUrl}
					type="application/pdf"
					class="w-full h-full"
				/>
			{:else if file.type === 'image' && fileUrl}
				<!-- Image viewer -->
				<div class="flex items-center justify-center h-full p-4 overflow-auto">
					<img
						src={fileUrl}
						alt={file.name}
						class="max-w-full max-h-full object-contain rounded-lg shadow-lg"
					/>
				</div>
			{:else if file.type === 'text' && file.textContent}
				<!-- Text viewer -->
				<div class="h-full overflow-y-auto p-6 md:p-8 lg:p-12">
					<div class="max-w-4xl mx-auto">
						{#if file.mimeType === 'text/markdown'}
							<div class="prose prose-invert prose-sm md:prose-base max-w-none">
								<MarkdownRenderer content={file.textContent} />
							</div>
						{:else}
							<pre class="text-sm text-foreground/90 whitespace-pre-wrap font-mono leading-relaxed">{file.textContent}</pre>
						{/if}
					</div>
				</div>
			{:else}
				<!-- Fallback -->
				<div class="flex flex-col items-center justify-center h-full py-20 text-center">
					<svelte:component this={getFileIcon(file.type)} class="h-16 w-16 text-muted-foreground mb-4" />
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

	<!-- Delete Confirmation Modal -->
	{#if showDeleteConfirm}
		<div 
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onclick={() => showDeleteConfirm = false}
			onkeydown={(e) => e.key === 'Escape' && (showDeleteConfirm = false)}
			role="presentation"
		>
			<div 
				class="mx-4 w-full max-w-sm rounded-lg border border-border bg-popover p-6 shadow-xl"
				onclick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
			>
				<h3 class="text-lg font-semibold mb-2">Delete File?</h3>
				<p class="text-sm text-muted-foreground mb-6">
					Are you sure you want to delete "{file.name}"? This action cannot be undone.
				</p>
				
				<div class="flex gap-3 justify-end">
					<button
						onclick={() => showDeleteConfirm = false}
						class="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
					>
						Cancel
					</button>
					<button
						onclick={handleDelete}
						class="rounded-md bg-destructive px-4 py-2 text-sm text-destructive-foreground hover:bg-destructive/90"
					>
						Delete
					</button>
				</div>
			</div>
		</div>
	{/if}
{/if}

