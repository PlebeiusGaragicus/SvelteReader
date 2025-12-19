<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { mode } from 'mode-watcher';
	import { books } from '$lib/stores/books';
	import { getEpubData } from '$lib/services/storageService';
	import { epubService, type ChapterPosition, type TextSelection, type HighlightClickEvent } from '$lib/services/epubService';
	import type { TocItem, LocationInfo, AnnotationColor, AnnotationType, Annotation } from '$lib/types';
	import { AppError, ERROR_MESSAGES } from '$lib/types';
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
	import { cyphertap } from 'cyphertap';
	import { useWalletStore } from '$lib/stores/wallet.svelte';

	const bookId = $derived($page.params.id);
	const book = $derived($books.find((b) => b.id === bookId));

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
	let editingAnnotation = $state<{ annotation: Annotation; position: { x: number; y: number } } | null>(null);

	// AI Chat state - passage context for the chat
	let chatPassageContext = $state<PassageContext | null>(null);
	let chatInitialThreadId = $state<string | null>(null);

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

	// Payment generator for chat messages
	const generatePayment = wallet.createPaymentGenerator(cyphertap);

	// Apply theme when mode changes
	$effect(() => {
		if (isBookReady && mode.current) {
			epubService.applyTheme(mode.current === 'dark' ? 'dark' : 'light');
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

	onMount(async () => {
		setReadingMode(true);

		if (!book) {
			loadError = ERROR_MESSAGES.BOOK_NOT_FOUND;
			errorCode = 'BOOK_NOT_FOUND';
			isLoading = false;
			return;
		}

		try {
			const epubData = await getEpubData(book.id);
			if (!epubData) {
				loadError = ERROR_MESSAGES.EPUB_NOT_FOUND;
				errorCode = 'EPUB_NOT_FOUND';
				isLoading = false;
				return;
			}

			await epubService.loadBook(epubData);
			await epubService.renderBook(readerContainer, {
				startCfi: book.currentCfi,
				bookId: book.id
			});

			// Apply initial theme based on current mode
			const currentMode = mode.current || 'light';
			epubService.applyTheme(currentMode === 'dark' ? 'dark' : 'light');
			isBookReady = true;
			isLoading = false;

			// Load existing annotations as highlights
			if (book.annotations.length > 0) {
				epubService.loadAnnotations(book.annotations);
			}

			// Load table of contents and chapter positions
			toc = await epubService.getTableOfContents();
			chapters = await epubService.getChapterPositions();

			// Track location changes
			epubService.onRelocated((location) => {
				currentLocation = location;
				books.updateProgress(book.id, location.page, location.cfi);
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
		} else if (event.key === 'ArrowRight') {
			handleNextPage();
		} else if (event.key === 'Escape') {
			showTOC = false;
			showAnnotations = false;
			showSettings = false;
		}
	}

	function toggleOverlay(overlay: 'toc' | 'annotations' | 'ai-chat' | 'settings'): void {
		showTOC = overlay === 'toc' ? !showTOC : false;
		showAnnotations = overlay === 'annotations' ? !showAnnotations : false;
		showAIChat = overlay === 'ai-chat' ? !showAIChat : false;
		showSettings = overlay === 'settings' ? !showSettings : false;
	}

	function deleteAnnotation(annotationId: string): void {
		if (book) {
			const annotation = book.annotations.find(a => a.id === annotationId);
			if (annotation) {
				epubService.removeHighlight(annotation.cfiRange);
			}
			books.removeAnnotation(book.id, annotationId);
		}
	}

	function navigateToAnnotation(annotation: Annotation): void {
		epubService.goToCfiWithHighlight(annotation.cfiRange);
		showAnnotations = false;
	}

	// Unified handler for saving annotations (both new and editing)
	function handleAnnotationSave(data: { color: AnnotationColor; note?: string; type: AnnotationType }): void {
		if (!book || !currentLocation) return;

		if (editingAnnotation) {
			// Editing existing annotation
			const updatedAnnotation = { ...editingAnnotation.annotation, ...data };
			books.updateAnnotation(book.id, editingAnnotation.annotation.id, data);
			epubService.updateHighlight(updatedAnnotation);
			editingAnnotation = { ...editingAnnotation, annotation: updatedAnnotation };
		} else if (textSelection) {
			// Creating new annotation
			const newAnnotation: Omit<Annotation, 'id' | 'bookId' | 'createdAt'> = {
				cfiRange: textSelection.cfiRange,
				text: textSelection.text,
				note: data.note,
				page: currentLocation.page,
				color: data.color,
				type: data.type
			};

			books.addAnnotation(book.id, newAnnotation);

			epubService.addHighlight({
				...newAnnotation,
				id: '',
				bookId: book.id,
				createdAt: new Date()
			} as Annotation);

			epubService.clearSelection();
			textSelection = null;
		}
	}

	function handleAnnotationDelete(): void {
		if (!book || !editingAnnotation) return;
		
		epubService.removeHighlight(editingAnnotation.annotation.cfiRange);
		books.removeAnnotation(book.id, editingAnnotation.annotation.id);
		editingAnnotation = null;
	}

	function handlePopupClose(): void {
		if (textSelection) {
			epubService.clearSelection();
			textSelection = null;
		}
		editingAnnotation = null;
	}

	function handleChatThreadDelete(threadId: string): void {
		if (!book) return;
		
		// Find annotations linked to this thread
		const linkedAnnotations = book.annotations.filter(a => a.chatThreadId === threadId);
		
		for (const annotation of linkedAnnotations) {
			// If annotation only has chat (no highlight color and no note), remove it entirely
			if (annotation.type === 'ai-chat' && !annotation.note) {
				epubService.removeHighlight(annotation.cfiRange);
				books.removeAnnotation(book.id, annotation.id);
			} else {
				// Otherwise, just clear the chatThreadId and change type back to note/highlight
				const newType = annotation.note ? 'note' : 'highlight';
				books.updateAnnotation(book.id, annotation.id, { 
					chatThreadId: undefined,
					type: newType 
				});
				// Update the visual highlight
				epubService.updateHighlight({ ...annotation, type: newType, chatThreadId: undefined });
			}
		}
	}

	function handleOpenAIChat(context: { text: string; cfiRange: string; note?: string; threadId?: string }): void {
		// Set passage context for the new chat interface
		chatPassageContext = {
			text: context.text,
			note: context.note,
			bookTitle: book?.title,
			chapter: currentLocation?.chapter
		};
		
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
			{#if isLoading}
				<div class="flex flex-1 items-center justify-center bg-background">
					<div class="flex flex-col items-center gap-3 text-muted-foreground">
						<Loader2 class="h-8 w-8 animate-spin" />
						<p>Loading book...</p>
					</div>
				</div>
			{/if}
			<div
				bind:this={readerContainer}
				class="epub-container flex-1"
				style:visibility={isLoading ? 'hidden' : 'visible'}
			></div>

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
				annotations={book.annotations}
				onClose={() => (showAnnotations = false)}
				onDelete={deleteAnnotation}
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
					onClose={() => { showAIChat = false; chatPassageContext = null; chatInitialThreadId = null; }}
					passageContext={chatPassageContext || undefined}
					showHistory={true}
					initialThreadId={chatInitialThreadId || undefined}
					{generatePayment}
					onThreadChange={(threadId) => {
						// Update the annotation with the new thread ID if we have an editing annotation
						if (editingAnnotation && threadId) {
							const updatedAnnotation = { ...editingAnnotation.annotation, chatThreadId: threadId };
							handleAnnotationSave({ 
								color: updatedAnnotation.color, 
								note: updatedAnnotation.note, 
								type: 'ai-chat' 
							});
						}
						console.log('Thread changed:', threadId);
					}}
					onThreadDelete={handleChatThreadDelete}
				/>
			</div>
		{/if}
	</div>
{/if}
