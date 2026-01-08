<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { userFilesStore, type UserFile, type OcrVersion } from '$lib/stores/userFiles.svelte';
	import { modeStore } from '$lib/stores/mode.svelte';
	import { cyphertap } from 'cyphertap';
	import { ArrowLeft, Download, Trash2, Copy, Check, FileText, Image, File, Loader2, ScanText, Eye, ChevronDown, Bot, Clock, Sparkles, Pencil, RotateCcw, Plus } from '@lucide/svelte';
	import { MarkdownRenderer } from '$lib/components/chat';
	import { toast } from 'svelte-sonner';
	import { ocrFile, canOcrFile, type OcrProgress } from '$lib/services/ocrService';
	import OcrEditor from '$lib/components/reader/OcrEditor.svelte';

	const fileId = $derived($page.params.id);
	
	let file = $state<UserFile | null>(null);
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);
	let fileUrl = $state<string | null>(null);
	let copied = $state(false);
	let showDeleteConfirm = $state(false);
	let showDeleteOcrConfirm = $state(false);
	
	// OCR view state
	let showOcrContent = $state(false);
	let selectedOcrVersionId = $state<string | null>(null);
	let showOcrVersionDropdown = $state(false);
	let isEditingOcr = $state(false);
	
	// OCR processing state
	let isOcrProcessing = $state(false);
	let ocrProgress = $state<OcrProgress | null>(null);
	
	// Derived: has OCR content available and can OCR
	const hasOcrContent = $derived((file?.ocrVersions?.length ?? 0) > 0);
	const canPerformOcr = $derived(file ? canOcrFile(file) : false);
	const selectedOcrVersion = $derived(
		file?.ocrVersions?.find(v => v.id === selectedOcrVersionId) ?? file?.ocrVersions?.[0] ?? null
	);

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
		if (!fileId) {
			loadError = 'No file ID provided';
			isLoading = false;
			return;
		}
		const foundFile = userFilesStore.getFile(fileId);
		if (!foundFile) {
			loadError = 'File not found';
			isLoading = false;
			return;
		}

		file = foundFile;
		
		// Create object URL for the file
		fileUrl = userFilesStore.getFileUrl(foundFile);
		
		// Initialize OCR state
		selectedOcrVersionId = foundFile.ocrVersions?.[0]?.id ?? null;
		
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
		let contentToCopy = '';
		
		if (showOcrContent && selectedOcrVersion) {
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
	
	function formatOcrDate(timestamp: number): string {
		return new Date(timestamp).toLocaleDateString();
	}

	async function handleOcr() {
		if (!file || isOcrProcessing) return;
		
		isOcrProcessing = true;
		ocrProgress = null;
		
		try {
			toast.info('Starting OCR...', { 
				description: file.type === 'pdf' ? 'This may take a moment for multi-page PDFs.' : undefined 
			});
			
			const result = await ocrFile(file, (progress) => {
				ocrProgress = progress;
			});
			
			if (result.success && result.ocrVersion) {
				// Add the OCR version to the file
				const existingVersions = file.ocrVersions ?? [];
				await userFilesStore.updateFile(file.id, {
					ocrVersions: [...existingVersions, result.ocrVersion]
				});
				
				// Refresh the file from the store
				const updatedFile = userFilesStore.getFile(file.id);
				if (updatedFile) {
					file = updatedFile;
					selectedOcrVersionId = result.ocrVersion.id;
					showOcrContent = true;
				}
				
				toast.success('OCR complete!', {
					description: `Extracted text from ${result.ocrVersion.pages.length} page${result.ocrVersion.pages.length !== 1 ? 's' : ''}.`
				});
			} else {
				toast.error('OCR failed', { description: result.error });
			}
		} catch (error) {
			console.error('[OCR] Error:', error);
			toast.error('OCR failed', { 
				description: error instanceof Error ? error.message : 'Unknown error' 
			});
		} finally {
			isOcrProcessing = false;
			ocrProgress = null;
		}
	}

	async function handleSaveOcrVersion(updatedVersion: OcrVersion) {
		if (!file) return;
		
		const updatedVersions = (file.ocrVersions ?? []).map(v => 
			v.id === updatedVersion.id ? updatedVersion : v
		);
		
		await userFilesStore.updateFile(file.id, {
			ocrVersions: updatedVersions
		});
		
		// Refresh file
		const updatedFile = userFilesStore.getFile(file.id);
		if (updatedFile) {
			file = updatedFile;
		}
		
		toast.success('OCR content saved');
		isEditingOcr = false;
	}

	async function handleDeleteOcrVersion() {
		if (!file || !selectedOcrVersionId) return;
		
		const updatedVersions = (file.ocrVersions ?? []).filter(v => v.id !== selectedOcrVersionId);
		
		await userFilesStore.updateFile(file.id, {
			ocrVersions: updatedVersions
		});
		
		// Refresh file and select another version if available
		const updatedFile = userFilesStore.getFile(file.id);
		if (updatedFile) {
			file = updatedFile;
			selectedOcrVersionId = updatedFile.ocrVersions?.[0]?.id ?? null;
			
			if (!selectedOcrVersionId) {
				showOcrContent = false;
			}
		}
		
		showDeleteOcrConfirm = false;
		toast.success('OCR version deleted');
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
				
				<!-- OCR Button / Toggle -->
				{#if canPerformOcr}
					{#if hasOcrContent}
						<!-- OCR Toggle - switch between original and OCR content -->
						<div class="relative flex items-stretch">
							<button
								onclick={() => { showOcrContent = !showOcrContent; isEditingOcr = false; }}
								class="flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-medium transition-colors
									{showOcrContent ? 'rounded-l-md bg-amber-500/10 border-amber-500/50 text-amber-500' : 'rounded-md border-border text-muted-foreground hover:bg-muted hover:text-foreground'}"
								title={showOcrContent ? 'Show original file' : 'Show OCR content'}
							>
								{#if showOcrContent}
									<Eye class="h-3.5 w-3.5" />
									<span class="hidden sm:inline">Original</span>
								{:else}
									<ScanText class="h-3.5 w-3.5" />
									<span class="hidden sm:inline">OCR</span>
								{/if}
							</button>
							
							{#if showOcrContent}
								<button
									onclick={() => { showOcrVersionDropdown = !showOcrVersionDropdown; }}
									class="flex items-center justify-center rounded-r-md border border-l-0 border-amber-500/50 bg-amber-500/10 px-2 text-amber-500 hover:bg-amber-500/20 transition-colors"
								>
									<ChevronDown class="h-3.5 w-3.5" />
								</button>
								
								{#if showOcrVersionDropdown}
									<!-- Backdrop to catch outside clicks -->
									<div 
										class="fixed inset-0 z-10" 
										onclick={() => { showOcrVersionDropdown = false; }}
										onkeydown={(e) => e.key === 'Escape' && (showOcrVersionDropdown = false)}
										role="presentation"
									></div>
									<div class="absolute right-0 top-full mt-1 z-20 w-64 rounded-md border border-border bg-popover shadow-lg">
										<!-- Version list -->
										<div class="p-1 border-b border-border">
											<div class="px-2 py-1 text-xs font-medium text-muted-foreground">OCR Versions</div>
											{#each file.ocrVersions ?? [] as version (version.id)}
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
																{formatOcrDate(version.generatedAt)}
															</span>
														</div>
													</div>
													{#if selectedOcrVersionId === version.id}
														<Check class="h-3 w-3 text-primary" />
													{/if}
												</button>
											{/each}
										</div>
										
										<!-- Actions for selected version -->
										{#if selectedOcrVersion}
											<div class="p-1 border-b border-border">
												<div class="px-2 py-1 text-xs font-medium text-muted-foreground">Actions</div>
												<button
													onclick={() => { isEditingOcr = true; showOcrVersionDropdown = false; }}
													class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
												>
													<Pencil class="h-3 w-3" />
													Edit OCR text
												</button>
												<button
													onclick={() => { showDeleteOcrConfirm = true; showOcrVersionDropdown = false; }}
													class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10"
												>
													<Trash2 class="h-3 w-3" />
													Delete this version
												</button>
											</div>
										{/if}
										
										<!-- Generate new -->
										<div class="p-1">
											<button
												onclick={() => { handleOcr(); showOcrVersionDropdown = false; }}
												disabled={isOcrProcessing}
												class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-50"
											>
												{#if isOcrProcessing}
													<Loader2 class="h-3 w-3 animate-spin" />
													Processing...
												{:else}
													<Plus class="h-3 w-3" />
													Generate new OCR version
												{/if}
											</button>
										</div>
									</div>
								{/if}
							{/if}
						</div>
					{:else}
						<!-- OCR Button - initiate OCR extraction -->
						<button
							onclick={handleOcr}
							disabled={isOcrProcessing}
							class="flex items-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-500 hover:bg-amber-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							title="Extract text using OCR"
						>
							{#if isOcrProcessing}
								<Loader2 class="h-3.5 w-3.5 animate-spin" />
								{#if ocrProgress && ocrProgress.totalPages > 1}
									<span class="hidden sm:inline">
										{ocrProgress.status === 'rendering' ? 'Rendering' : 'Processing'} {ocrProgress.currentPage}/{ocrProgress.totalPages}
									</span>
								{:else}
									<span class="hidden sm:inline">Processing...</span>
								{/if}
							{:else}
								<Sparkles class="h-3.5 w-3.5" />
								<span class="hidden sm:inline">OCR File</span>
							{/if}
						</button>
					{/if}
				{/if}
				
				{#if file.textContent || (showOcrContent && selectedOcrVersion)}
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
			{#if showOcrContent && selectedOcrVersion && isEditingOcr}
				<!-- OCR Editor -->
				<OcrEditor 
					ocrVersion={selectedOcrVersion}
					onSave={handleSaveOcrVersion}
					onClose={() => { isEditingOcr = false; }}
				/>
			{:else if showOcrContent && selectedOcrVersion}
				<!-- OCR Content viewer -->
				<div class="h-full overflow-y-auto p-6 md:p-8 lg:p-12">
					<div class="max-w-4xl mx-auto">
						<!-- OCR metadata header -->
						<div class="mb-6 p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
							<div class="flex items-center justify-between mb-2">
								<div class="flex items-center gap-2">
									<ScanText class="h-4 w-4 text-amber-500" />
									<span class="text-sm font-medium text-amber-500">OCR Content</span>
									<span class="text-xs text-muted-foreground">
										({selectedOcrVersion.pages.length} page{selectedOcrVersion.pages.length !== 1 ? 's' : ''})
									</span>
								</div>
								<button
									onclick={() => { isEditingOcr = true; }}
									class="flex items-center gap-1.5 rounded-md border border-amber-500/30 px-2 py-1 text-xs text-amber-500 hover:bg-amber-500/10 transition-colors"
								>
									<Pencil class="h-3 w-3" />
									Edit
								</button>
							</div>
							<div class="flex flex-wrap gap-3 text-xs text-muted-foreground">
								<span class="flex items-center gap-1">
									<Bot class="h-3 w-3" />
									{selectedOcrVersion.model}
								</span>
								<span class="flex items-center gap-1">
									<Clock class="h-3 w-3" />
									{formatOcrDate(selectedOcrVersion.generatedAt)}
								</span>
								{#if selectedOcrVersion.confidence}
									<span class="text-green-500">
										{Math.round(selectedOcrVersion.confidence * 100)}% confidence
									</span>
								{/if}
							</div>
						</div>
						
						<!-- OCR pages -->
						<div class="space-y-8">
							{#each selectedOcrVersion.pages as pageContent, pageIndex}
								<div class="relative">
									<div class="absolute -left-6 top-0 text-xs text-muted-foreground font-mono">
										p{pageIndex + 1}
									</div>
									<div class="prose prose-invert prose-sm md:prose-base max-w-none border-l-2 border-border pl-4">
										<MarkdownRenderer content={pageContent} />
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			{:else if file.type === 'pdf' && fileUrl}
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

	<!-- Delete OCR Version Confirmation Modal -->
	{#if showDeleteOcrConfirm && selectedOcrVersion}
		<div 
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onclick={() => showDeleteOcrConfirm = false}
			onkeydown={(e) => e.key === 'Escape' && (showDeleteOcrConfirm = false)}
			role="presentation"
		>
			<div 
				class="mx-4 w-full max-w-sm rounded-lg border border-border bg-popover p-6 shadow-xl"
				onclick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
			>
				<h3 class="text-lg font-semibold mb-2">Delete OCR Version?</h3>
				<p class="text-sm text-muted-foreground mb-6">
					Are you sure you want to delete "{selectedOcrVersion.label || `Version ${selectedOcrVersion.id.slice(0, 8)}`}"? 
					This action cannot be undone.
				</p>
				
				<div class="flex gap-3 justify-end">
					<button
						onclick={() => showDeleteOcrConfirm = false}
						class="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
					>
						Cancel
					</button>
					<button
						onclick={handleDeleteOcrVersion}
						class="rounded-md bg-destructive px-4 py-2 text-sm text-destructive-foreground hover:bg-destructive/90"
					>
						Delete
					</button>
				</div>
			</div>
		</div>
	{/if}
{/if}

