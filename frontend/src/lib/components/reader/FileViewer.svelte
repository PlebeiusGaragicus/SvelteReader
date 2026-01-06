<script lang="ts">
	import { X, Download, Trash2, ExternalLink, Copy, Check, ScanText, FileText, ChevronDown, Eye, Clock, Bot } from '@lucide/svelte';
	import { userFilesStore, type UserFile, type OcrVersion } from '$lib/stores/userFiles.svelte';
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
	
	// OCR view state
	let showOcrContent = $state(false);
	let selectedOcrVersionId = $state<string | null>(null);
	let showOcrVersionDropdown = $state(false);
	
	// Derived: has OCR content available
	const hasOcrContent = $derived((file?.ocrVersions?.length ?? 0) > 0);
	const selectedOcrVersion = $derived(
		file?.ocrVersions?.find(v => v.id === selectedOcrVersionId) ?? file?.ocrVersions?.[0] ?? null
	);
	
	// Reset OCR view state when file changes
	$effect(() => {
		if (file) {
			showOcrContent = false;
			selectedOcrVersionId = file.ocrVersions?.[0]?.id ?? null;
			showOcrVersionDropdown = false;
		}
	});
	
	function formatDate(timestamp: number): string {
		return new Date(timestamp).toLocaleDateString();
	}

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
		let contentToCopy = '';
		
		if (showOcrContent && selectedOcrVersion) {
			// Copy OCR content (all pages joined)
			contentToCopy = selectedOcrVersion.pages.join('\n\n---\n\n');
		} else if (file?.textContent) {
			contentToCopy = file.textContent;
		}
		
		if (contentToCopy) {
			navigator.clipboard.writeText(contentToCopy);
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
				<!-- OCR Toggle (when available) -->
				{#if hasOcrContent}
					<div class="relative flex items-center">
						<button
							onclick={() => { showOcrContent = !showOcrContent; }}
							class="flex items-center gap-1.5 rounded-l-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors
								{showOcrContent ? 'bg-amber-500/10 border-amber-500/50 text-amber-500' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
							title={showOcrContent ? 'Show original file' : 'Show OCR content'}
						>
							{#if showOcrContent}
								<Eye class="h-3.5 w-3.5" />
								<span>Original</span>
							{:else}
								<ScanText class="h-3.5 w-3.5" />
								<span>OCR</span>
							{/if}
						</button>
						
						<!-- Version dropdown (only when viewing OCR) -->
						{#if showOcrContent && (file?.ocrVersions?.length ?? 0) > 1}
							<button
								onclick={() => { showOcrVersionDropdown = !showOcrVersionDropdown; }}
								class="flex items-center gap-1 rounded-r-md border border-l-0 border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-500 hover:bg-amber-500/20 transition-colors"
							>
								<ChevronDown class="h-3 w-3" />
							</button>
							
							{#if showOcrVersionDropdown}
								<div class="absolute right-0 top-full mt-1 z-10 w-56 rounded-md border border-border bg-popover p-1 shadow-lg">
									{#each file?.ocrVersions ?? [] as version (version.id)}
										<button
											onclick={() => { selectedOcrVersionId = version.id; showOcrVersionDropdown = false; }}
											class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent
												{selectedOcrVersionId === version.id ? 'bg-accent' : ''}"
										>
											<div class="flex-1 min-w-0">
												<div class="font-medium truncate">
													{version.label || `Version ${version.id.slice(0, 8)}`}
												</div>
												<div class="flex items-center gap-2 text-muted-foreground mt-0.5">
													<span class="flex items-center gap-1">
														<Bot class="h-2.5 w-2.5" />
														{version.model}
													</span>
													<span class="flex items-center gap-1">
														<Clock class="h-2.5 w-2.5" />
														{formatDate(version.generatedAt)}
													</span>
												</div>
											</div>
											{#if selectedOcrVersionId === version.id}
												<Check class="h-3 w-3 text-primary" />
											{/if}
										</button>
									{/each}
								</div>
							{/if}
						{/if}
					</div>
				{/if}
			
				{#if file.textContent || (showOcrContent && selectedOcrVersion)}
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
			{#if showOcrContent && selectedOcrVersion}
				<!-- OCR Content viewer -->
				<div class="h-full overflow-y-auto p-6">
					<!-- OCR metadata header -->
					<div class="mb-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
						<div class="flex items-center gap-2 mb-2">
							<ScanText class="h-4 w-4 text-amber-500" />
							<span class="text-sm font-medium text-amber-500">OCR Content</span>
							<span class="text-xs text-muted-foreground">
								({selectedOcrVersion.pages.length} page{selectedOcrVersion.pages.length !== 1 ? 's' : ''})
							</span>
						</div>
						<div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
							<span class="flex items-center gap-1">
								<Bot class="h-3 w-3" />
								{selectedOcrVersion.model}
							</span>
							<span class="flex items-center gap-1">
								<Clock class="h-3 w-3" />
								{formatDate(selectedOcrVersion.generatedAt)}
							</span>
							{#if selectedOcrVersion.confidence}
								<span class="text-green-500">
									{Math.round(selectedOcrVersion.confidence * 100)}% confidence
								</span>
							{/if}
						</div>
					</div>
					
					<!-- OCR pages -->
					<div class="space-y-6">
						{#each selectedOcrVersion.pages as pageContent, pageIndex}
							<div class="relative">
								<div class="absolute -left-4 top-0 text-xs text-muted-foreground font-mono">
									p{pageIndex + 1}
								</div>
								<div class="prose prose-invert prose-sm max-w-none border-l-2 border-border pl-4">
									<MarkdownRenderer content={pageContent} />
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else if file.type === 'pdf' && fileUrl}
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

