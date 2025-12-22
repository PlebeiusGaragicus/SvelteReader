<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { mode } from 'mode-watcher';
	import { books } from '$lib/stores/books';
	import { annotations } from '$lib/stores/annotations';
	import { getEpubData } from '$lib/services/storageService';
	import { epubService, type ChapterPosition, type TextSelection, type HighlightClickEvent } from '$lib/services/epubService';
	import type { TocItem, LocationInfo, AnnotationColor, AnnotationLocal, AnnotationDisplay } from '$lib/types';
	import { AppError, ERROR_MESSAGES, getAnnotationKey } from '$lib/types';
	import { Loader2 } from '@lucide/svelte';
	import {
		ReaderHeader,
		ReaderControls,
		TocPanel,
		AnnotationsPanel,
		SettingsPanel,
		ProgressBar,
		AnnotationPopup
	} from '$lib/components/reader';
	import { ChatThread } from '$lib/components/chat';
	import type { PassageContext } from '$lib/types/chat';
	import { cyphertap, isUserMenuOpen } from 'cyphertap';
	import { useWalletStore } from '$lib/stores/wallet.svelte';
	import { syncStore } from '$lib/stores/sync.svelte';
	import { getThreads } from '$lib/services/langgraph';

	const bookId = $derived($page.params.id);
	const book = $derived($books.find((b) => b.id === bookId));
	
	// Get annotations for this book (reactive)
	const bookAnnotations = $derived(book ? $annotations.filter(a => a.bookSha256 === book.sha256) : []);

	// Panel visibility state
	let showTOC = $state(false);
	let showAnnotations = $state(false);
	let showSettings = $state(false);
	let showAIChat = $state(false);

	// Reader state
	let readerContainer: HTMLDivElement;
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);
	let errorCode = $state<string | null>(null);
	let isGhostBook = $state(false);
	let toc = $state<TocItem[]>([]);
	let currentLocation = $state<LocationInfo | null>(null);
	let isBookReady = $state(false);
	let chapters = $state<ChapterPosition[]>([]);
	let chaptersReady = $state(false);

	// Return to last location state
	let lastLocationCfi = $state<string | null>(null);
	let returnTimeout: ReturnType<typeof setTimeout> | null = null;

	// Text selection state
	let textSelection = $state<TextSelection | null>(null);

	// Highlight edit state
	let editingAnnotation = $state<{ annotation: AnnotationLocal; position: { x: number; y: number } } | null>(null);

	// AI Chat state - passage context for the chat
	let chatPassageContext = $state<PassageContext | null>(null);
	let chatInitialThreadId = $state<string | null>(null);
	// Track which annotation we're chatting about (to save threadId back to it)
	let chatAnnotationId = $state<string | null>(null);
	let chatCfiRange = $state<string | null>(null);

	// Wallet store for payment integration
	const wallet = useWalletStore();

	// Sync wallet state with CypherTap
	$effect(() => {
		wallet.syncWithCypherTap({
			balance: cyphertap.balance,
			isReady: cyphertap.isReady,
			isLoggedIn: cyphertap.isLoggedIn,
			npub: cyphertap.npub
		});
	});

	// Set CypherTap instance for annotation Nostr publishing and sync
	$effect(() => {
		if (cyphertap.isLoggedIn) {
			annotations.setCyphertap(cyphertap);
			books.setCyphertap(cyphertap);
			syncStore.setCyphertap(cyphertap);
			syncStore.setMergeCallback(annotations.mergeFromNostr);
			syncStore.setBookMergeCallback(books.mergeFromNostr);
		} else {
			annotations.setCyphertap(null);
			books.setCyphertap(null);
			syncStore.setCyphertap(null);
		}
	});

	// Auto-sync on login if current book is public
	let hasSyncedOnLogin = $state(false);
	$effect(() => {
		if (cyphertap.isLoggedIn && book?.isPublic && !hasSyncedOnLogin && isBookReady) {
			hasSyncedOnLogin = true;
			console.log('[Reader] Auto-syncing for public book on login...');
			syncStore.sync();
		}
	});

	// Payment generator for chat messages
	const generatePayment = wallet.createPaymentGenerator(cyphertap);

	// Apply theme when mode changes
	$effect(() => {
		if (isBookReady && mode.current) {
			epubService.applyTheme(mode.current === 'dark' ? 'dark' : 'light');
		}
	});

	// Reload annotations in epub reader when store changes (e.g., after sync)
	$effect(() => {
		if (isBookReady && book && bookAnnotations) {
			// This effect runs whenever bookAnnotations changes
			epubService.loadAnnotations(bookAnnotations);
		}
	});

	function setReadingMode(enabled: boolean): void {
		if (typeof document === 'undefined') return;
		const method = enabled ? 'add' : 'remove';
		document.documentElement.classList[method]('reading-mode');
		document.body.classList[method]('reading-mode');
	}

	function handleError(error: unknown): void {
		console.error('Failed to load book:', error);
		
		if (error instanceof AppError) {
			loadError = error.message;
			errorCode = error.code;
		} else {
			loadError = ERROR_MESSAGES.UNKNOWN_ERROR;
			errorCode = 'UNKNOWN_ERROR';
		}
		isLoading = false;
	}

	/**
	 * Reconcile annotations with existing threads.
	 * Removes orphaned annotations whose threads no longer exist.
	 * 
	 * With composable model, an annotation is valid if it has ANY of:
	 * - highlightColor (visible highlight)
	 * - note (user note)
	 * - valid chatThreadIds (AI chat threads)
	 * 
	 * If chatThreadIds are orphaned, we clear them but keep the annotation
	 * if it has other properties (highlight or note).
	 */
	async function reconcileAnnotations(): Promise<void> {
		if (!book) return;
		
		try {
			// Fetch all existing threads from server
			const existingThreads = await getThreads();
			const existingThreadIds = new Set(existingThreads.map(t => t.thread_id));
			
			for (const annotation of bookAnnotations) {
				// Check if annotation has orphaned chatThreadIds
				const orphanedThreadIds = (annotation.chatThreadIds || []).filter(id => !existingThreadIds.has(id));
				
				if (orphanedThreadIds.length === 0) continue;
				
				const key = getAnnotationKey(annotation.bookSha256, annotation.cfiRange);
				console.log(`[Reconcile] Orphaned threads: ${key} -> ${orphanedThreadIds.join(', ')}`);
				
				// Remove orphaned thread IDs
				for (const threadId of orphanedThreadIds) {
					await annotations.removeChatThread(annotation.bookSha256, annotation.cfiRange, threadId);
				}
				
				// Update highlight visual
				const updatedAnnotation = bookAnnotations.find(a => 
					a.bookSha256 === annotation.bookSha256 && a.cfiRange === annotation.cfiRange
				);
				if (updatedAnnotation) {
					epubService.updateHighlight(updatedAnnotation);
				}
			}
		} catch (e) {
			console.warn('[Reconcile] Failed to reconcile annotations:', e);
		}
	}

	onMount(async () => {
		setReadingMode(true);

		// Ensure stores are initialized before checking for book
		await books.initialize();
		await annotations.initialize();

		// Re-check for book after initialization
		const currentBooks = $books;
		const foundBook = currentBooks.find((b) => b.id === bookId);
		
		if (!foundBook) {
			loadError = ERROR_MESSAGES.BOOK_NOT_FOUND;
			errorCode = 'BOOK_NOT_FOUND';
			isLoading = false;
			return;
		}

		try {
			const epubData = await getEpubData(foundBook.id);
			if (!epubData) {
				// Ghost book - no EPUB data, but we can still show annotations
				isGhostBook = true;
				isLoading = false;
				return;
			}

			await epubService.loadBook(epubData);
			
			// Wait for container to have proper dimensions before rendering
			// This prevents the flash of incorrectly sized content
			await new Promise<void>((resolve) => {
				const checkDimensions = () => {
					const rect = readerContainer.getBoundingClientRect();
					if (rect.width > 0 && rect.height > 0) {
						resolve();
					} else {
						requestAnimationFrame(checkDimensions);
					}
				};
				checkDimensions();
			});
			
			await epubService.renderBook(readerContainer, {
				startCfi: foundBook.currentCfi,
				bookId: foundBook.id
			});

			// Apply initial theme based on current mode
			const currentMode = mode.current || 'light';
			epubService.applyTheme(currentMode === 'dark' ? 'dark' : 'light');
			isBookReady = true;
			isLoading = false;

			// Load existing annotations as highlights
			const currentAnnotations = $annotations.filter(a => a.bookSha256 === foundBook.sha256);
			if (currentAnnotations.length > 0) {
				epubService.loadAnnotations(currentAnnotations);
			}

			// Reconcile annotations with threads (clean up orphaned ai-chat annotations)
			reconcileAnnotations();

			// Load table of contents and chapter positions
			toc = await epubService.getTableOfContents();
			chapters = await epubService.getChapterPositions();

			// Track location changes
			epubService.onRelocated((location) => {
				currentLocation = location;
				books.updateProgress(foundBook.id, location.page, location.cfi);
			});

			// Get initial location
			currentLocation = epubService.getCurrentLocation();

			// Handle text selection
			epubService.onTextSelected((selection) => {
				textSelection = selection;
				// Close edit popup when making new selection
				if (selection) {
					editingAnnotation = null;
				}
			});

			// Handle highlight clicks for editing
			epubService.onHighlightClicked((event) => {
				if (event) {
					editingAnnotation = event;
					textSelection = null; // Close selection popup
				}
			});

			// Handle clicks inside epub content to close panels
			epubService.onContentClicked(() => {
				showTOC = false;
				showAnnotations = false;
				showSettings = false;
				showAIChat = false;
				editingAnnotation = null;
				// Close CypherTap popover
				isUserMenuOpen.set(false);
			});

			// Handle page turns from within iframe (keyboard events captured by epub)
			epubService.onPageTurn(() => {
				handlePopupClose();
			});

			// Update location and chapter positions when accurate locations become available
			epubService.setOnLocationsReady(async () => {
				console.log('Locations ready, recalculating chapters...');
				currentLocation = epubService.getCurrentLocation();
				// Recalculate chapter positions with accurate location data
				const newChapters = await epubService.getChapterPositions();
				console.log('New chapter positions:', newChapters);
				chapters = newChapters;
				chaptersReady = true;
			});
		} catch (error) {
			handleError(error);
		}
	});

	onDestroy(() => {
		setReadingMode(false);
		epubService.destroy();
		if (returnTimeout) {
			clearTimeout(returnTimeout);
		}
	});

	function handlePrevPage(): void {
		epubService.prevPage();
	}

	function handleNextPage(): void {
		epubService.nextPage();
	}

	function handleTocClick(item: TocItem): void {
		epubService.goToHref(item.href);
		showTOC = false;
	}

	function handleChapterClick(href: string): void {
		// Save current location before jumping
		const current = epubService.getCurrentLocation();
		if (current) {
			lastLocationCfi = current.cfi;
			
			// Clear any existing timeout
			if (returnTimeout) {
				clearTimeout(returnTimeout);
			}
			
			// Auto-hide after 10 seconds
			returnTimeout = setTimeout(() => {
				lastLocationCfi = null;
			}, 10000);
		}
		
		epubService.goToHref(href);
	}

	function handleReturnToLastLocation(): void {
		if (lastLocationCfi) {
			epubService.goToCfi(lastLocationCfi);
			lastLocationCfi = null;
			
			if (returnTimeout) {
				clearTimeout(returnTimeout);
				returnTimeout = null;
			}
		}
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowLeft') {
			handlePrevPage();
			// Close popup on page turn
			handlePopupClose();
		} else if (event.key === 'ArrowRight') {
			handleNextPage();
			// Close popup on page turn
			handlePopupClose();
		} else if (event.key === 'Escape') {
			showTOC = false;
			showAnnotations = false;
			showSettings = false;
			handlePopupClose();
		}
	}

	function toggleOverlay(overlay: 'toc' | 'annotations' | 'ai-chat' | 'settings'): void {
		showTOC = overlay === 'toc' ? !showTOC : false;
		showAnnotations = overlay === 'annotations' ? !showAnnotations : false;
		showSettings = overlay === 'settings' ? !showSettings : false;
				
		// For AI chat, clear context when toggling from header (not from annotation)
		if (overlay === 'ai-chat') {
			const wasOpen = showAIChat;
			showAIChat = !wasOpen;
			if (!wasOpen) {
				// Opening chat from header - clear any previous context
				chatPassageContext = null;
				chatInitialThreadId = null;
			}
		} else {
			showAIChat = false;
		}
	}

	async function deleteAnnotation(bookSha256: string, cfiRange: string): Promise<void> {
		if (book) {
			epubService.removeHighlight(cfiRange);
			await annotations.remove(bookSha256, cfiRange);
		}
	}

	function navigateToAnnotation(annotation: AnnotationLocal): void {
		epubService.goToCfiWithHighlight(annotation.cfiRange);
		showAnnotations = false;
	}

	// Composable annotation save data type (no legacy fields)
	// Note: null means "clear this field", undefined means "don't change"
	interface AnnotationSaveData {
		highlightColor?: AnnotationColor | null;
		note?: string | null;
		chatThreadId?: string;
	}

	// Unified handler for saving annotations (both new and editing)
	async function handleAnnotationSave(data: AnnotationSaveData): Promise<void> {
		if (!book || !currentLocation) return;

		if (editingAnnotation) {
			// Editing existing annotation - merge composable properties
			const existingThreadIds = editingAnnotation.annotation.chatThreadIds || [];
			const chatThreadIds = data.chatThreadId && !existingThreadIds.includes(data.chatThreadId)
				? [...existingThreadIds, data.chatThreadId]
				: existingThreadIds;
			
			const updatedAnnotation = await annotations.upsert(
				editingAnnotation.annotation.bookSha256,
				editingAnnotation.annotation.cfiRange,
				{
					text: editingAnnotation.annotation.text,
					highlightColor: data.highlightColor,
					note: data.note,
					chatThreadIds
				}
			);
			epubService.updateHighlight(updatedAnnotation);
			// Don't update editingAnnotation here - popup will close via onClose callback
		} else if (textSelection) {
			// Creating new annotation with composable properties
			const chatThreadIds = data.chatThreadId ? [data.chatThreadId] : undefined;
			
			const newAnnotation = await annotations.upsert(
				book.sha256,
				textSelection.cfiRange,
				{
					text: textSelection.text,
					highlightColor: data.highlightColor,
					note: data.note,
					chatThreadIds
				}
			);

			epubService.addHighlight(newAnnotation);

			epubService.clearSelection();
			textSelection = null;
		}
	}

	async function handleAnnotationDelete(): Promise<void> {
		if (!book || !editingAnnotation) return;
		
		epubService.removeHighlight(editingAnnotation.annotation.cfiRange);
		await annotations.remove(editingAnnotation.annotation.bookSha256, editingAnnotation.annotation.cfiRange);
		editingAnnotation = null;
	}

	function handlePopupClose(): void {
		if (textSelection) {
			epubService.clearSelection();
			textSelection = null;
		}
		editingAnnotation = null;
	}

	async function handleChatThreadDelete(threadId: string): Promise<void> {
		if (!book) return;
		
		// Find annotations linked to this thread
		const linkedAnnotations = bookAnnotations.filter(a => 
			a.chatThreadIds && a.chatThreadIds.includes(threadId)
		);
		
		for (const annotation of linkedAnnotations) {
			await annotations.removeChatThread(annotation.bookSha256, annotation.cfiRange, threadId);
			
			// Get updated annotation to refresh highlight
			const updated = bookAnnotations.find(a => 
				a.bookSha256 === annotation.bookSha256 && a.cfiRange === annotation.cfiRange
			);
			if (updated) {
				epubService.updateHighlight(updated);
			}
		}
	}

	function handleOpenAIChat(context: { text: string; cfiRange: string; note?: string; threadId?: string; annotationId?: string }): void {
		// Set passage context for the new chat interface
		chatPassageContext = {
			text: context.text,
			note: context.note,
			bookTitle: book?.title,
			chapter: currentLocation?.chapter
		};
		
		// Track which annotation we're chatting about
		chatAnnotationId = context.annotationId || null;
		chatCfiRange = context.cfiRange;
		
		// If opening from an existing annotation with a thread, restore that thread
		chatInitialThreadId = context.threadId || null;
		
		showAIChat = true;
		textSelection = null;
		editingAnnotation = null;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if loadError}
	<div class="flex h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-4">
		<p class="text-lg text-destructive">{loadError}</p>
		{#if errorCode === 'EPUB_NOT_FOUND'}
			<p class="text-sm text-muted-foreground">The book data may have been cleared from your browser.</p>
		{/if}
		<button
			onclick={() => goto('/')}
			class="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
		>
			Back to Library
		</button>
	</div>
{:else if isGhostBook && book}
	<!-- Ghost Book View - No EPUB data, show annotations only -->
	<div class="flex h-[calc(100vh-3.5rem)] flex-col">
		<ReaderHeader
			title={book.title}
			{showTOC}
			{showAnnotations}
			{showAIChat}
			{showSettings}
			onToggleTOC={() => {}}
			onToggleAnnotations={() => showAnnotations = !showAnnotations}
			onToggleAIChat={() => {}}
			onToggleSettings={() => showSettings = !showSettings}
		/>
		
		<div class="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
			<div class="flex flex-col items-center gap-4">
				{#if book.coverBase64}
					<img 
						src="data:image/jpeg;base64,{book.coverBase64}" 
						alt="{book.title} cover"
						class="h-48 w-auto rounded-lg shadow-lg opacity-50"
					/>
				{/if}
				<div class="space-y-2">
					<h2 class="text-2xl font-bold text-muted-foreground">{book.title}</h2>
					<p class="text-muted-foreground">{book.author}</p>
				</div>
			</div>
			
			<div class="max-w-md space-y-4">
				<div class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
					<p class="text-sm text-amber-600 dark:text-amber-400">
						This is a <strong>ghost book</strong> — synced from Nostr but missing the EPUB file.
					</p>
				</div>
				
				<p class="text-sm text-muted-foreground">
					{#if bookAnnotations.length > 0}
						You have <strong>{bookAnnotations.length}</strong> annotation{bookAnnotations.length === 1 ? '' : 's'} for this book.
						Upload the EPUB to read and see them in context.
					{:else}
						No annotations yet. Upload the EPUB to start reading.
					{/if}
				</p>
				
				<div class="flex justify-center gap-3">
					<button
						onclick={() => showAnnotations = true}
						class="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
						disabled={bookAnnotations.length === 0}
					>
						View Annotations ({bookAnnotations.length})
					</button>
					<button
						onclick={() => goto('/')}
						class="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
					>
						Back to Library
					</button>
				</div>
			</div>
		</div>
		
		{#if showAnnotations}
			<AnnotationsPanel
				annotations={bookAnnotations}
				onClose={() => (showAnnotations = false)}
				onDelete={(a) => deleteAnnotation(a.bookSha256, a.cfiRange)}
				onNavigate={() => {}}
			/>
		{/if}
		
		{#if showSettings}
			<SettingsPanel onClose={() => (showSettings = false)} />
		{/if}
	</div>
{:else if !book}
	<div class="flex h-[calc(100vh-3.5rem)] items-center justify-center">
		<p class="text-muted-foreground">Book not found</p>
	</div>
{:else}
	<div class="reader-page relative flex h-[calc(100vh-3.5rem)] flex-col">
		<ReaderHeader
			title={book.title}
			{showTOC}
			{showAnnotations}
			{showAIChat}
			{showSettings}
			onToggleTOC={() => toggleOverlay('toc')}
			onToggleAnnotations={() => toggleOverlay('annotations')}
			onToggleAIChat={() => toggleOverlay('ai-chat')}
			onToggleSettings={() => toggleOverlay('settings')}
		/>

		<!-- Main Reading Area -->
		<div class="relative flex flex-1 overflow-hidden">
			<div
				bind:this={readerContainer}
				class="epub-container flex-1 {isLoading ? 'loading' : 'ready'}"
			></div>
			{#if isLoading}
				<div class="absolute inset-0 flex items-center justify-center bg-background z-10">
					<div class="flex flex-col items-center gap-3 text-muted-foreground">
						<Loader2 class="h-8 w-8 animate-spin" />
						<p>Loading book...</p>
					</div>
				</div>
			{/if}

			{#if !isLoading}
				<ReaderControls onPrevPage={handlePrevPage} onNextPage={handleNextPage} />
			{/if}
		</div>

		<ProgressBar
			{currentLocation}
			fallbackProgress={book.progress}
			fallbackCurrentPage={book.currentPage}
			fallbackTotalPages={book.totalPages}
			chapters={chaptersReady ? chapters : []}
			onChapterClick={handleChapterClick}
			{lastLocationCfi}
			onReturnToLastLocation={handleReturnToLastLocation}
		/>

		{#if showTOC}
			<TocPanel {toc} onClose={() => (showTOC = false)} onItemClick={handleTocClick} />
		{/if}

		{#if showAnnotations}
			<AnnotationsPanel
				annotations={bookAnnotations}
				onClose={() => (showAnnotations = false)}
				onDelete={(a) => deleteAnnotation(a.bookSha256, a.cfiRange)}
				onNavigate={navigateToAnnotation}
			/>
		{/if}

		{#if showSettings}
			<SettingsPanel onClose={() => (showSettings = false)} />
		{/if}

		{#if textSelection || editingAnnotation}
			<AnnotationPopup
				selectedText={textSelection?.text}
				cfiRange={textSelection?.cfiRange}
				annotation={editingAnnotation?.annotation}
				position={editingAnnotation?.position || textSelection?.position || { x: 0, y: 0 }}
				onSave={handleAnnotationSave}
				onDelete={handleAnnotationDelete}
				onClose={handlePopupClose}
				onOpenAIChat={handleOpenAIChat}
			/>
		{/if}

		{#if showAIChat}
			<div class="absolute inset-y-0 right-0 top-[53px] z-10 w-96 border-l border-border bg-card text-card-foreground shadow-lg" style="background-color: var(--card); color: var(--card-foreground);">
				<ChatThread
					onClose={() => { 
						showAIChat = false; 
						chatPassageContext = null; 
						chatInitialThreadId = null; 
						chatAnnotationId = null;
						chatCfiRange = null;
					}}
					passageContext={chatPassageContext || undefined}
					showHistory={true}
					initialThreadId={chatInitialThreadId || undefined}
					{generatePayment}
					onThreadChange={async (threadId) => {
						// Update the annotation with the new thread ID (preserve other properties)
						if (book && threadId && chatCfiRange) {
							const existingAnnotation = bookAnnotations.find(a => a.cfiRange === chatCfiRange);
							if (existingAnnotation) {
								// Add thread ID to annotation
								await annotations.addChatThread(existingAnnotation.bookSha256, existingAnnotation.cfiRange, threadId);
								// Get updated annotation and refresh highlight
								const updated = bookAnnotations.find(a => 
									a.bookSha256 === existingAnnotation.bookSha256 && a.cfiRange === existingAnnotation.cfiRange
								);
								if (updated) {
									epubService.updateHighlight(updated);
								}
							}
						}
						console.log('Thread changed:', threadId);
					}}
					onThreadDelete={handleChatThreadDelete}
				/>
			</div>
		{/if}
	</div>
{/if}
