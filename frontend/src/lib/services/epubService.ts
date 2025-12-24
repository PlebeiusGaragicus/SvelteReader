import ePub, { Book, Rendition } from 'epubjs';
import type { NavItem } from 'epubjs';
import { storeLocations, getLocations } from '$lib/services/storageService';
import type { BookMetadata, TocItem, LocationInfo, Annotation, AnnotationLocal, AnnotationColor } from '$lib/types';
import { AppError, getAnnotationDisplayColor, annotationHasChat, annotationHasNote } from '$lib/types';

// Re-export types for backward compatibility
export type { BookMetadata, TocItem, LocationInfo } from '$lib/types';

export interface ParsedBook {
	metadata: BookMetadata;
	book: Book;
	arrayBuffer: ArrayBuffer;
}

export interface ChapterPosition {
	href: string;
	label: string;
	startPercent: number;
	endPercent: number;
}

// Constants for page estimation
const ESTIMATED_PAGES_PER_CHAPTER = 20;
const MIN_ESTIMATED_PAGES = 100;
const LOCATIONS_CHARS_PER_PAGE = 1024;

export interface TextSelection {
	text: string;
	cfiRange: string;
	position: { x: number; y: number };
}

export interface HighlightClickEvent {
	annotation: AnnotationLocal;
	position: { x: number; y: number };
}

class EpubService {
	private book: Book | null = null;
	private rendition: Rendition | null = null;
	private totalLocations: number = 0;
	private locationsReady: boolean = false;
	private onLocationsReady: (() => void) | null = null;
	private container: HTMLElement | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private resizeTimeout: ReturnType<typeof setTimeout> | null = null;
	private selectionCallback: ((selection: TextSelection | null) => void) | null = null;
	private highlightClickCallback: ((event: HighlightClickEvent | null) => void) | null = null;
	private contentClickCallback: (() => void) | null = null;
	private pageTurnCallback: (() => void) | null = null;
	private loadedAnnotations: AnnotationLocal[] = [];
	private renderedListenerAttached: boolean = false;
	private toc: TocItem[] = [];  // Cached table of contents for quick lookups
	async parseEpub(file: File): Promise<ParsedBook> {
		const arrayBuffer = await file.arrayBuffer();
		const book = ePub(arrayBuffer);

		await book.ready;

		const metadata = await book.loaded.metadata;
		const spine = await book.loaded.spine;

		let coverUrl: string | undefined;
		try {
			const coverHref = await book.coverUrl();
			if (coverHref) {
				coverUrl = coverHref;
			}
		} catch (e) {
			console.warn('Could not extract cover:', e);
		}

		// Estimate total pages based on spine items (chapters)
		// This is a rough estimate - actual page count depends on rendering
		const spineItems = (spine as any).items || [];
		const totalPages = Math.max(
			spineItems.length * ESTIMATED_PAGES_PER_CHAPTER,
			MIN_ESTIMATED_PAGES
		);

		return {
			metadata: {
				title: metadata.title || file.name.replace('.epub', ''),
				author: metadata.creator || 'Unknown Author',
				coverUrl,
				totalPages
			},
			book,
			arrayBuffer
		};
	}

	async extractCoverAsDataUrl(book: Book): Promise<string | undefined> {
		try {
			const coverUrl = await book.coverUrl();
			if (!coverUrl) return undefined;

			// Fetch the cover and convert to data URL for storage
			const response = await fetch(coverUrl);
			const blob = await response.blob();

			return new Promise((resolve) => {
				const reader = new FileReader();
				reader.onloadend = () => resolve(reader.result as string);
				reader.readAsDataURL(blob);
			});
		} catch (e) {
			console.warn('Could not extract cover as data URL:', e);
			return undefined;
		}
	}

	async loadBook(arrayBuffer: ArrayBuffer): Promise<Book> {
		this.destroy();
		try {
			this.book = ePub(arrayBuffer);
			await this.book.ready;
			return this.book;
		} catch (e) {
			console.error('Failed to load EPUB:', e);
			throw new AppError(
				'Failed to load the book. The file may be corrupted.',
				'EPUB_PARSE_FAILED',
				true
			);
		}
	}

	async renderBook(
		container: HTMLElement,
		options?: { width?: string; height?: string; startCfi?: string; bookId?: string }
	): Promise<Rendition> {
		if (!this.book) {
			throw new Error('No book loaded');
		}

		this.locationsReady = false;
		this.container = container;

		// Get exact pixel dimensions for proper pagination
		const rect = container.getBoundingClientRect();
		const width = Math.floor(rect.width);
		const height = Math.floor(rect.height);

		this.rendition = this.book.renderTo(container, {
			width: width,
			height: height,
			flow: 'paginated',
			spread: 'none',
			allowScriptedContent: true
		});

		// Register touch/swipe and keyboard handlers for content
		this.setupContentHandlers();

		// Wait for the rendition to be fully rendered before displaying
		const renderPromise = new Promise<void>((resolve) => {
			this.rendition!.once('rendered', () => resolve());
		});
		
		// Display the book
		if (options?.startCfi) {
			await this.rendition.display(options.startCfi);
		} else {
			await this.rendition.display();
		}
		
		// Wait for render to complete
		await renderPromise;
		
		// Additional frame to ensure layout is stable
		await new Promise(resolve => requestAnimationFrame(resolve));
		
		// Now setup resize observer for responsive behavior
		this.setupResizeObserver(container);

		// Load or generate locations in background
		this.loadLocationsAsync(options?.bookId);

		return this.rendition;
	}

	private setupContentHandlers(): void {
		if (!this.rendition) return;

		// Handle keyboard events within the iframe
		this.rendition.on('keyup', (event: KeyboardEvent) => {
			if (event.key === 'ArrowLeft') {
				this.prevPage();
				this.pageTurnCallback?.();
			} else if (event.key === 'ArrowRight') {
				this.nextPage();
				this.pageTurnCallback?.();
			} else if (event.key === 'Escape') {
				this.pageTurnCallback?.();
			}
		});

		// Handle text selection events
		this.rendition.on('selected', (cfiRange: string, contents: any) => {
			if (!this.selectionCallback) return;

			const selection = contents.window.getSelection();
			if (!selection || selection.isCollapsed || !selection.toString().trim()) {
				this.selectionCallback(null);
				return;
			}

			const text = selection.toString().trim();
			const range = selection.getRangeAt(0);
			const rect = range.getBoundingClientRect();

			// Get iframe position to calculate absolute position
			const iframe = contents.document.defaultView.frameElement;
			const iframeRect = iframe?.getBoundingClientRect() || { left: 0, top: 0 };

			// Position popup above the selection (use same offset as highlight clicks)
			const position = {
				x: iframeRect.left + rect.left + rect.width / 2,
				y: iframeRect.top + rect.top - 40
			};

			this.selectionCallback({
				text,
				cfiRange,
				position
			});
		});

		// Clear selection when clicking elsewhere and notify content click listeners
		this.rendition.on('click', () => {
			// Notify content click listeners (for closing panels/popups)
			this.contentClickCallback?.();
			
			// Small delay to allow selection event to fire first
			setTimeout(() => {
				const contents = this.rendition?.getContents() as any;
				if (contents && contents[0]) {
					const selection = contents[0].window?.getSelection();
					if (!selection || selection.isCollapsed) {
						this.selectionCallback?.(null);
					}
				}
			}, 50);
		});
	}

	private setupResizeObserver(container: HTMLElement): void {
		// Clean up existing observer
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
		}

		this.resizeObserver = new ResizeObserver((entries) => {
			// Debounce resize events
			if (this.resizeTimeout) {
				clearTimeout(this.resizeTimeout);
			}

			this.resizeTimeout = setTimeout(() => {
				const entry = entries[0];
				if (entry && this.rendition) {
					const width = Math.floor(entry.contentRect.width);
					const height = Math.floor(entry.contentRect.height);
					if (width > 0 && height > 0) {
						this.rendition.resize(width, height);
					}
				}
			}, 150);
		});

		this.resizeObserver.observe(container);
	}

	private async loadLocationsAsync(bookId?: string): Promise<void> {
		if (!this.book) return;

		try {
			// Try to load cached locations first
			if (bookId) {
				const cachedLocations = await getLocations(bookId);
				if (cachedLocations) {
					this.book.locations.load(cachedLocations);
					this.totalLocations = this.book.locations.length();
					this.locationsReady = true;
					this.onLocationsReady?.();
					console.log('Loaded cached locations');
					return;
				}
			}

			// Generate locations in background
			console.log('Generating locations...');
			const locations = await this.book.locations.generate(LOCATIONS_CHARS_PER_PAGE);
			this.totalLocations = this.book.locations.length();
			this.locationsReady = true;
			this.onLocationsReady?.();

			// Cache the generated locations
			if (bookId && locations) {
				const locationsJson = this.book.locations.save();
				await storeLocations(bookId, locationsJson);
				console.log('Cached locations for future use');
			}
		} catch (e) {
			console.error('Failed to load/generate locations:', e);
		}
	}

	setOnLocationsReady(callback: () => void): void {
		this.onLocationsReady = callback;
		if (this.locationsReady) {
			callback();
		}
	}

	hasLocations(): boolean {
		return this.locationsReady;
	}

	async getTableOfContents(): Promise<TocItem[]> {
		if (!this.book) return [];

		// Return cached TOC if available
		if (this.toc.length > 0) return this.toc;

		const navigation = await this.book.loaded.navigation;
		this.toc = this.convertNavItems(navigation.toc);
		return this.toc;
	}
	
	/**
	 * Get chapter title by ID from the cached TOC.
	 * Returns null if TOC not loaded or chapter not found.
	 */
	getChapterTitleById(chapterId: string): string | null {
		if (this.toc.length === 0) return null;
		
		// Recursive search through TOC
		const findTitle = (items: TocItem[]): string | null => {
			for (const item of items) {
				// Match by id or href (some books use href as id)
				if (item.id === chapterId || item.href === chapterId || item.href?.includes(chapterId)) {
					return item.label;
				}
				if (item.subitems && item.subitems.length > 0) {
					const found = findTitle(item.subitems);
					if (found) return found;
				}
			}
			return null;
		};
		
		return findTitle(this.toc);
	}

	/**
	 * Calculate chapter positions as percentages for the progress bar.
	 * Uses epub.js locations for accurate positioning that matches progress calculation.
	 * Falls back to equal spine-based segments if locations unavailable or parsing fails.
	 * Some ebooks have malformed TOCs or CFIs - graceful degradation is intentional.
	 */
	async getChapterPositions(): Promise<ChapterPosition[]> {
		if (!this.book) return [];

		const navigation = await this.book.loaded.navigation;
		const spine = this.book.spine as any;
		const spineItems = spine?.items || [];
		const spineLength = spineItems.length || 1;

		// Map href -> spine index for fallback calculation
		const hrefToIndex = new Map<string, number>();
		spineItems.forEach((item: any, index: number) => {
			const baseHref = item.href?.split('#')[0];
			if (baseHref && !hrefToIndex.has(baseHref)) {
				hrefToIndex.set(baseHref, index);
			}
		});

		// Build spine index -> percentage map by scanning _locations array directly.
		// This matches how getCurrentLocation calculates progress: locationIndex / totalLocations.
		// CFI format: "epubcfi(/6/X!/4/...)" where X = spineIndex * 2 + 2
		const spineToPercent = new Map<number, number>();
		if (this.locationsReady && this.book && this.totalLocations > 0) {
			const locations = (this.book.locations as any)._locations as string[];
			if (locations && locations.length > 0) {
				let lastSpineIndex = -1;
				for (let i = 0; i < locations.length; i++) {
					const cfi = locations[i];
					const match = cfi.match(/epubcfi\(\/6\/(\d+)/);
					if (match) {
						const cfiSpineNum = parseInt(match[1], 10);
						const spineIndex = (cfiSpineNum - 2) / 2;
						if (spineIndex !== lastSpineIndex && spineIndex >= 0) {
							const percent = (i / this.totalLocations) * 100;
							spineToPercent.set(spineIndex, percent);
							lastSpineIndex = spineIndex;
						}
					}
				}
			}
		}

		// Flatten TOC and collect start positions
		const rawPositions: { href: string; label: string; startPercent: number }[] = [];
		
		const flattenToc = (items: TocItem[]): void => {
			for (const item of items) {
				let startPercent: number | undefined;
				const baseHref = item.href?.split('#')[0];
				const spineIndex = hrefToIndex.get(baseHref);
				
				// Use location-based percentage if available (accurate)
				if (spineIndex !== undefined && spineToPercent.has(spineIndex)) {
					startPercent = spineToPercent.get(spineIndex);
				}

				// Fallback: equal segments based on spine index (less accurate)
				if (startPercent === undefined && spineIndex !== undefined) {
					startPercent = (spineIndex / spineLength) * 100;
				}

				if (startPercent !== undefined) {
					rawPositions.push({
						href: item.href,
						label: item.label,
						startPercent
					});
				}
				
				if (item.subitems) {
					flattenToc(item.subitems);
				}
			}
		};

		flattenToc(this.convertNavItems(navigation.toc));

		rawPositions.sort((a, b) => a.startPercent - b.startPercent);

		// Calculate end positions: each chapter ends where the next begins
		const positions: ChapterPosition[] = rawPositions.map((pos, index) => {
			const nextStart = index < rawPositions.length - 1 
				? rawPositions[index + 1].startPercent 
				: 100;
			return {
				href: pos.href,
				label: pos.label,
				startPercent: pos.startPercent,
				endPercent: nextStart
			};
		});

		return positions;
	}

	private convertNavItems(items: NavItem[]): TocItem[] {
		return items.map((item) => ({
			id: item.id,
			href: item.href,
			label: item.label,
			subitems: item.subitems ? this.convertNavItems(item.subitems) : undefined
		}));
	}

	async nextPage(): Promise<void> {
		if (this.rendition) {
			await this.rendition.next();
		}
	}

	async prevPage(): Promise<void> {
		if (this.rendition) {
			await this.rendition.prev();
		}
	}

	async goToHref(href: string): Promise<void> {
		if (this.rendition) {
			await this.rendition.display(href);
		}
	}

	async goToCfi(cfi: string): Promise<void> {
		if (this.rendition) {
			await this.rendition.display(cfi);
		}
	}

	getCurrentLocation(): LocationInfo | null {
		if (!this.rendition || !this.book) return null;

		const location = this.rendition.currentLocation() as any;
		if (!location || !location.start) return null;

		const cfi = location.start.cfi;
		
		// Try to get chapter title from cached TOC
		let chapterTitle: string | undefined;
		const spineIndex = location.start.index || 0;
		const spine = (this.book.spine as any);
		const spineItem = spine?.items?.[spineIndex] || spine?.get?.(spineIndex);
		const href = spineItem?.href || '';
		
		if (href && this.toc.length > 0) {
			const tocEntry = this.findTocEntryForHref(this.toc, href);
			chapterTitle = tocEntry?.label || this.extractTitleFromHref(href);
		}

		// If locations are ready, use accurate progress
		if (this.locationsReady && this.totalLocations > 0) {
			const locationIndex = this.book.locations.locationFromCfi(cfi) as unknown as number;
			const percentage = locationIndex / this.totalLocations;
			const page = Math.max(1, Math.ceil(percentage * this.totalLocations));

			return {
				cfi,
				percentage: Math.round(percentage * 100),
				page,
				totalPages: this.totalLocations,
				chapterTitle
			};
		}

		// Fallback: estimate based on spine position
		const spineLength = spine?.items?.length || spine?.length || 1;
		const percentage = Math.round((spineIndex / spineLength) * 100);

		return {
			cfi,
			percentage,
			page: spineIndex + 1,
			totalPages: spineLength,
			chapterTitle
		};
	}

	onRelocated(callback: (location: LocationInfo) => void): void {
		if (this.rendition) {
			this.rendition.on('relocated', () => {
				const location = this.getCurrentLocation();
				if (location) {
					callback(location);
				}
			});
		}
	}

	applyTheme(theme: 'light' | 'dark' | 'sepia'): void {
		if (!this.rendition) return;

		const colors = {
			light: { bg: '#ffffff', text: '#1a1a1a' },
			dark: { bg: '#1a1a1a', text: '#e5e5e5' },
			sepia: { bg: '#f4ecd8', text: '#5c4b37' }
		};

		const { bg, text } = colors[theme];

		// Use CSS override for better compatibility with scrolled-doc mode
		this.rendition.themes.default({
			'body': {
				'background-color': `${bg} !important`,
				'color': `${text} !important`
			},
			'p, div, span, h1, h2, h3, h4, h5, h6, li, a': {
				'color': `${text} !important`
			}
		});
	}

	applyFontSize(size: number): void {
		if (this.rendition) {
			this.rendition.themes.fontSize(`${size}%`);
		}
	}

	onTextSelected(callback: (selection: TextSelection | null) => void): void {
		this.selectionCallback = callback;
	}

	onHighlightClicked(callback: (event: HighlightClickEvent | null) => void): void {
		this.highlightClickCallback = callback;
	}

	onContentClicked(callback: () => void): void {
		this.contentClickCallback = callback;
	}

	onPageTurn(callback: () => void): void {
		this.pageTurnCallback = callback;
	}

	clearSelection(): void {
		const contents = this.rendition?.getContents() as any;
		if (contents && contents[0]) {
			contents[0].window?.getSelection()?.removeAllRanges();
		}
		this.selectionCallback?.(null);
	}

	addHighlight(annotation: AnnotationLocal): void {
		if (!this.rendition) return;

		// First, remove any existing highlight at this cfiRange to prevent duplicates
		try {
			this.rendition.annotations.remove(annotation.cfiRange, 'highlight');
		} catch (e) {
			// Ignore errors if highlight doesn't exist
		}

		const className = this.getHighlightClassNameFromAnnotation(annotation);
		
		// Track this annotation for style re-injection on page changes
		const existingIndex = this.loadedAnnotations.findIndex(a => a.cfiRange === annotation.cfiRange);
		if (existingIndex >= 0) {
			this.loadedAnnotations[existingIndex] = annotation;
		} else {
			this.loadedAnnotations.push(annotation);
		}
		
		// Get SVG styles for epub.js highlight (it uses SVG rect elements)
		const svgStyles = this.getHighlightSvgStyleFromAnnotation(annotation);
		
		// Add click handler for this highlight
		// epub.js passes the DOM event directly to the callback
		const clickHandler = (e: MouseEvent) => {
			if (!this.highlightClickCallback) return;
			
			// Get the clicked SVG element's position in the main viewport
			const target = e.target as SVGElement;
			const svgRect = target.getBoundingClientRect();
			
			// The SVG rect is relative to the iframe, we need to add the iframe's position
			const iframeDoc = target.ownerDocument;
			const iframeWin = iframeDoc?.defaultView;
			const iframe = iframeWin?.frameElement as HTMLIFrameElement | null;
			
			let x = svgRect.left + svgRect.width / 2;
			let y = svgRect.top - 40; // Offset upward so popup appears above the highlight
			
			// If we found the iframe, add its offset
			if (iframe) {
				const iframeRect = iframe.getBoundingClientRect();
				x += iframeRect.left;
				y += iframeRect.top;
			}
			
			this.highlightClickCallback({
				annotation,
				position: { x, y }
			});
		};
		
		this.rendition.annotations.add(
			'highlight',
			annotation.cfiRange,
			{ cfiRange: annotation.cfiRange },
			clickHandler,
			className,
			svgStyles
		);
	}

	removeHighlight(cfiRange: string): void {
		if (!this.rendition) return;
		this.rendition.annotations.remove(cfiRange, 'highlight');
		// Also remove from loaded annotations
		this.loadedAnnotations = this.loadedAnnotations.filter(a => a.cfiRange !== cfiRange);
	}

	updateHighlight(annotation: AnnotationLocal): void {
		if (!this.rendition) return;
		// Remove old highlight and add new one with updated styles
		this.rendition.annotations.remove(annotation.cfiRange, 'highlight');
		// Update in loaded annotations
		const index = this.loadedAnnotations.findIndex(a => a.cfiRange === annotation.cfiRange);
		if (index >= 0) {
			this.loadedAnnotations[index] = annotation;
		}
		// Re-add with new styles
		this.addHighlight(annotation);
	}

	loadAnnotations(annotations: AnnotationLocal[]): void {
		if (!this.rendition) return;
		
		// Clear existing highlights that are no longer in the new annotations list
		const newCfiRanges = new Set(annotations.map(a => a.cfiRange));
		this.loadedAnnotations.forEach((existing) => {
			if (!newCfiRanges.has(existing.cfiRange)) {
				try {
					this.rendition?.annotations.remove(existing.cfiRange, 'highlight');
				} catch (e) {
					// Ignore errors if highlight doesn't exist
				}
			}
		});
		
		// Store annotations for re-injection on page changes
		this.loadedAnnotations = [...annotations];
		
		// Only attach the rendered listener once to prevent accumulation
		if (!this.renderedListenerAttached) {
			this.renderedListenerAttached = true;
			this.rendition.on('rendered', () => {
				this.reinjectAllHighlightStyles();
			});
		}
		
		// Add annotations (addHighlight removes existing first to prevent duplicates)
		annotations.forEach((annotation) => {
			this.addHighlight(annotation);
		});
	}

	private reinjectAllHighlightStyles(): void {
		// Re-inject all highlight styles for the current annotations
		this.loadedAnnotations.forEach((annotation) => {
			this.injectHighlightStyleFromAnnotation(annotation);
		});
	}

	// Get class name based on composable annotation properties
	private getHighlightClassNameFromAnnotation(annotation: AnnotationLocal): string {
		const displayColor = getAnnotationDisplayColor(annotation);
		const hasChat = annotationHasChat(annotation);
		const hasNote = annotationHasNote(annotation);
		
		// Priority: highlight color > chat > note
		if (displayColor) {
			// Has visible highlight - use color class, add chat/note indicator via border
			if (hasChat) {
				return `hl-${displayColor}-chat`;
			} else if (hasNote) {
				return `hl-${displayColor}-note`;
			}
			return `hl-${displayColor}`;
		} else if (hasChat) {
			return 'hl-ai-chat';
		} else if (hasNote) {
			return 'hl-note';
		}
		// Fallback - should not happen with new model
		return 'hl-yellow';
	}

	// Get SVG style based on composable annotation properties
	private getHighlightSvgStyleFromAnnotation(annotation: Annotation): object {
		const colorMap: Record<AnnotationColor, string> = {
			yellow: 'rgba(255, 235, 59, 0.75)',
			green: 'rgba(76, 175, 80, 0.75)',
			blue: 'rgba(33, 150, 243, 0.75)',
			pink: 'rgba(249, 60, 123, 0.75)'
		};
		
		const displayColor = getAnnotationDisplayColor(annotation);
		const hasChat = annotationHasChat(annotation);
		const hasNote = annotationHasNote(annotation);
		
		// Has visible highlight color
		if (displayColor) {
			const baseStyle: Record<string, string> = {
				'fill': colorMap[displayColor],
				'fill-opacity': '0.4',
				'mix-blend-mode': 'multiply'
			};
			// Add blue dashed outline if also has chat (takes priority)
			if (hasChat) {
				baseStyle['stroke'] = 'rgb(33, 150, 243)';
				baseStyle['stroke-width'] = '2';
				baseStyle['stroke-dasharray'] = '4,2';
			} else if (hasNote) {
				// Add green dashed outline if has note (but no chat)
				baseStyle['stroke'] = 'rgb(76, 175, 80)';
				baseStyle['stroke-width'] = '2';
				baseStyle['stroke-dasharray'] = '4,2';
			}
			return baseStyle;
		}
		
		// No highlight color - show as dashed outline based on chat/note
		if (hasChat) {
			return {
				'fill': 'rgba(33, 150, 243, 0.1)',
				'fill-opacity': '0.1',
				'mix-blend-mode': 'multiply',
				'stroke': 'rgb(33, 150, 243)',
				'stroke-width': '2',
				'stroke-dasharray': '4,2'
			};
		}
		
		if (hasNote) {
			return {
				'fill': 'rgba(76, 175, 80, 0.1)',
				'fill-opacity': '0.1',
				'mix-blend-mode': 'multiply',
				'stroke': 'rgb(76, 175, 80)',
				'stroke-width': '2',
				'stroke-dasharray': '4,2'
			};
		}
		
		// Fallback - should not happen with new model
		return {
			'fill': 'rgba(255, 235, 59, 0.75)',
			'fill-opacity': '0.4',
			'mix-blend-mode': 'multiply'
		};
	}

	// Inject highlight style based on composable annotation properties
	private injectHighlightStyleFromAnnotation(annotation: Annotation): void {
		const contents = this.rendition?.getContents() as any;
		if (!contents || !contents[0]) return;

		const doc = contents[0].document;
		if (!doc) return;

		const className = this.getHighlightClassNameFromAnnotation(annotation);
		const styleId = `highlight-style-${className}`;

		// Don't inject if already exists
		if (doc.getElementById(styleId)) return;

		const colorMap: Record<AnnotationColor, string> = {
			yellow: 'rgba(255, 235, 59, 0.5)',
			green: 'rgba(76, 175, 80, 0.5)',
			blue: 'rgba(33, 150, 243, 0.5)',
			pink: 'rgba(233, 30, 99, 0.5)'
		};

		const displayColor = getAnnotationDisplayColor(annotation);
		const hasChat = annotationHasChat(annotation);
		const hasNote = annotationHasNote(annotation);

		let css = '';
		if (displayColor) {
			if (hasChat) {
				// Highlight with chat: dashed blue outline
				css = `.${className} { background-color: ${colorMap[displayColor]} !important; outline: 2px dashed rgb(33, 150, 243) !important; outline-offset: -1px !important; border-radius: 2px !important; }`;
			} else if (hasNote) {
				// Highlight with note: dashed green outline
				css = `.${className} { background-color: ${colorMap[displayColor]} !important; outline: 2px dashed rgb(76, 175, 80) !important; outline-offset: -1px !important; border-radius: 2px !important; }`;
			} else {
				css = `.${className} { background-color: ${colorMap[displayColor]} !important; border-radius: 2px !important; }`;
			}
		} else if (hasChat) {
			// No highlight, just chat: dashed blue outline
			css = `.${className} { background-color: transparent !important; outline: 2px dashed rgb(33, 150, 243) !important; outline-offset: -1px !important; border-radius: 2px !important; }`;
		} else if (hasNote) {
			// No highlight, just note: dashed green outline
			css = `.${className} { background-color: transparent !important; outline: 2px dashed rgb(76, 175, 80) !important; outline-offset: -1px !important; border-radius: 2px !important; }`;
		} else {
			// Fallback - should not happen with new model
			css = `.${className} { background-color: rgba(255, 235, 59, 0.5) !important; border-radius: 2px !important; }`;
		}

		const style = doc.createElement('style');
		style.id = styleId;
		style.textContent = css;
		doc.head.appendChild(style);
	}

	async goToCfiWithHighlight(cfi: string): Promise<void> {
		if (!this.rendition) return;
		
		await this.rendition.display(cfi);
		
		// Add a brief visual pulse effect after navigation
		setTimeout(() => {
			const contents = this.rendition?.getContents() as any;
			if (contents && contents[0]) {
				const doc = contents[0].document;
				if (doc) {
					// Find the highlight element and add pulse animation
					const highlights = doc.querySelectorAll('.hl');
					highlights.forEach((el: HTMLElement) => {
						// Check if this highlight contains the target CFI
						el.style.transition = 'all 0.3s ease';
						el.style.transform = 'scale(1.05)';
						el.style.boxShadow = '0 0 8px rgba(59, 130, 246, 0.8)';
						
						setTimeout(() => {
							el.style.transform = 'scale(1)';
							el.style.boxShadow = 'none';
						}, 600);
					});
				}
			}
		}, 300);
	}

	// =============================================================================
	// TEXT EXTRACTION FOR RAG (Agent-Driven Retrieval)
	// =============================================================================

	/**
	 * Get the full text content of a chapter by its ID/href.
	 * Used by the AI agent's get_chapter tool.
	 * 
	 * The chapterId can be:
	 * - A TOC nav ID (e.g., "np-5") - will be resolved to href via TOC lookup
	 * - A spine href or partial href (e.g., "chapter5.xhtml")
	 * - A spine idref
	 */
	async getChapterText(chapterId: string): Promise<string> {
		if (!this.book) {
			throw new Error('No book is currently loaded. Please open a book first.');
		}
		
		console.log(`[EpubService] getChapterText called with: "${chapterId}"`);
		
		// Wait for spine to be loaded (critical!)
		await this.book.loaded.spine;
		
		const spine = this.book.spine as any;
		const items: any[] = spine?.items || [];
		
		console.log(`[EpubService] Spine has ${items.length} items`);
		if (items.length === 0) {
			throw new Error('Book spine is empty. The book may not have loaded correctly.');
		}
		
		if (items.length > 0) {
			console.log('[EpubService] First spine item:', {
				href: items[0]?.href,
				hasLoad: typeof items[0]?.load === 'function',
				keys: Object.keys(items[0] || {})
			});
		}
		
		// Resolve the chapterId to an href first
		let targetHref: string | null = null;
		
		// Check if it's a TOC nav ID (like "np-5") - resolve via TOC
		const tocHref = await this.resolveTocIdToHref(chapterId);
		if (tocHref) {
			targetHref = tocHref.split('#')[0]; // Remove fragment
			console.log(`[EpubService] Resolved via TOC: "${chapterId}" -> "${targetHref}"`);
		} else {
			// Use as-is (might be an href directly)
			targetHref = chapterId;
			console.log(`[EpubService] Using chapterId as href: "${targetHref}"`);
		}
		
		// Find the spine item by href
		let foundIndex = -1;
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const itemHref = item?.href || '';
			
			// Try exact match
			if (itemHref === targetHref) {
				foundIndex = i;
				console.log(`[EpubService] Exact match at index ${i}: "${itemHref}"`);
				break;
			}
			
			// Try ends-with match (handle path differences)
			if (itemHref.endsWith(targetHref) || targetHref.endsWith(itemHref)) {
				foundIndex = i;
				console.log(`[EpubService] EndsWith match at index ${i}: "${itemHref}" <-> "${targetHref}"`);
				break;
			}
			
			// Try filename match
			const targetFilename = targetHref.split('/').pop();
			const itemFilename = itemHref.split('/').pop();
			if (targetFilename && itemFilename && targetFilename === itemFilename) {
				foundIndex = i;
				console.log(`[EpubService] Filename match at index ${i}: "${itemFilename}"`);
				break;
			}
		}
		
		if (foundIndex === -1) {
			console.error(`[EpubService] No spine item found for "${targetHref}"`);
			console.error('[EpubService] Available hrefs:', items.slice(0, 10).map((i: any) => i?.href));
			const availableIds = items.slice(0, 5).map((i: any) => i?.href?.split('/').pop()).filter(Boolean).join(', ');
			throw new Error(`Chapter "${chapterId}" not found. Available files include: ${availableIds || 'none'}. Try using get_table_of_contents() to see valid chapter IDs.`);
		}
		
		// Get the href from the spine item data
		const spineItem = items[foundIndex];
		const chapterHref = spineItem?.href;
		
		console.log(`[EpubService] Found spine item at index ${foundIndex}:`, {
			href: chapterHref
		});
		
		if (!chapterHref) {
			throw new Error(`Spine item at index ${foundIndex} has no href. The book structure may be corrupted.`);
		}
		
		const text = await this.extractTextFromHref(chapterHref);
		
		// Validate that we got content
		if (!text || text.trim().length === 0) {
			throw new Error(`Chapter "${chapterId}" exists but contains no readable text. This may be a title page, cover, or empty section. Try a different chapter.`);
		}
		
		return text;
	}

	/**
	 * Resolve a TOC navigation ID to its corresponding href.
	 * TOC items have IDs like "np-5" that map to hrefs like "xhtml/chapter5.xhtml"
	 */
	private async resolveTocIdToHref(tocId: string): Promise<string | null> {
		if (!this.book) return null;
		
		// Ensure navigation is loaded
		await this.book.loaded.navigation;
		
		const toc = await this.getTableOfContentsForAgent();
		console.log(`[EpubService] resolveTocIdToHref: looking for "${tocId}" in ${toc.length} TOC entries`);
		console.log('[EpubService] All TOC entries:', toc.map(t => ({ id: t.id, href: t.href, title: t.title.slice(0, 30) })));
		
		const entry = toc.find(item => item.id === tocId);
		if (entry) {
			console.log(`[EpubService] Found entry: id="${entry.id}", href="${entry.href}", hasHref=${!!entry.href}`);
			if (!entry.href) {
				console.error(`[EpubService] Entry found but has no href! This TOC entry may be a section header without actual content.`);
				return null;
			}
			return entry.href;
		}
		
		// Try fuzzy matching - the agent might send slightly different IDs
		const fuzzyMatch = toc.find(item => 
			item.id.toLowerCase() === tocId.toLowerCase() ||
			item.href?.includes(tocId) ||
			item.title.toLowerCase().includes(tocId.toLowerCase())
		);
		
		if (fuzzyMatch) {
			console.log(`[EpubService] Fuzzy match found: id="${fuzzyMatch.id}", href="${fuzzyMatch.href}"`);
			return fuzzyMatch.href || null;
		}
		
		console.log(`[EpubService] No entry found for "${tocId}". Available IDs: ${toc.slice(0, 10).map(t => t.id).join(', ')}`);
		return null;
	}

	/**
	 * Extract text content from a chapter by its href.
	 * Uses book.section() to get a proper Section object with load() method.
	 * Handles both HTML and XHTML content with various document structures.
	 */
	private async extractTextFromHref(href: string): Promise<string> {
		if (!this.book) throw new Error('No book loaded');
		
		console.log('[EpubService] extractTextFromHref called with:', href);
		
		// Use book.section() to get a proper Section object with load() method
		const section = this.book.section(href);
		
		if (!section) {
			console.error('[EpubService] Section not found for href:', href);
			// List available sections for debugging
			const spine = this.book.spine as any;
			const available = (spine?.items || []).slice(0, 5).map((i: any) => i?.href).filter(Boolean).join(', ');
			throw new Error(`Section "${href}" not found in book. Available sections include: ${available || 'none'}`);
		}
		
		console.log('[EpubService] Got section:', {
			href: section.href,
			hasLoad: typeof section.load === 'function'
		});
		
		if (typeof section.load !== 'function') {
			throw new Error(`Section "${href}" cannot be loaded. The book may need to be re-opened.`);
		}
		
		try {
			console.log('[EpubService] Loading section...');
			
			let text = '';
			
			// Try Method A: Use section.load() to get a document
			try {
				const doc = await section.load(this.book.load.bind(this.book));
				
				if (doc) {
					console.log('[EpubService] Section loaded via load():', {
						hasBody: !!doc?.body,
						hasDocumentElement: !!doc?.documentElement,
						docType: doc?.constructor?.name
					});
					
					// Try multiple ways to extract text content
					// Some EPUB formats have different document structures
					
					// Method 1: Standard body element
					if (doc.body) {
						text = doc.body.textContent || '';
						console.log('[EpubService] Extracted from body:', text.length, 'chars');
					}
					
					// Method 2: XHTML body with namespace (querySelector handles namespaces)
					if (!text && doc.querySelector) {
						const body = doc.querySelector('body');
						if (body) {
							text = body.textContent || '';
							console.log('[EpubService] Extracted from querySelector body:', text.length, 'chars');
						}
					}
					
					// Method 3: Get all text from documentElement (fallback)
					if (!text && doc.documentElement) {
						text = doc.documentElement.textContent || '';
						console.log('[EpubService] Extracted from documentElement:', text.length, 'chars');
					}
				}
			} catch (loadError) {
				console.warn('[EpubService] section.load() failed, trying render():', loadError);
			}
			
			// Try Method B: Use book.load() directly to get raw content
			if (!text && this.book.load) {
				try {
					console.log('[EpubService] Trying direct book.load()...');
					const rawContent = await this.book.load(href);
					
					if (rawContent) {
						console.log('[EpubService] Got raw content, type:', typeof rawContent);
						
						if (typeof rawContent === 'string') {
							// Parse HTML string
							const parser = new DOMParser();
							const parsed = parser.parseFromString(rawContent, 'text/html');
							text = parsed.body?.textContent || parsed.documentElement?.textContent || '';
							console.log('[EpubService] Extracted from parsed HTML string:', text.length, 'chars');
						} else if (rawContent instanceof Document) {
							text = rawContent.body?.textContent || rawContent.documentElement?.textContent || '';
							console.log('[EpubService] Extracted from Document:', text.length, 'chars');
						}
					}
				} catch (directLoadError) {
					console.warn('[EpubService] Direct book.load() failed:', directLoadError);
				}
			}
			
			// Try Method C: Access contents via spine item directly  
			if (!text) {
				const spine = this.book.spine as any;
				const spineItem = spine?.items?.find((item: any) => 
					item?.href === href || item?.href?.endsWith(href) || href.endsWith(item?.href || '')
				);
				
				if (spineItem?.contents) {
					console.log('[EpubService] Trying spine item contents...');
					const contents = spineItem.contents;
					if (contents.body) {
						text = contents.body.textContent || '';
						console.log('[EpubService] Extracted from spine contents:', text.length, 'chars');
					}
				}
			}
			
			// Try Method D: Access via the book's archive directly
			if (!text && (this.book as any).archive) {
				try {
					console.log('[EpubService] Trying archive.getText()...');
					const archive = (this.book as any).archive;
					
					// Try different path variations
					const pathsToTry = [
						href,
						`OEBPS/${href}`,
						`OPS/${href}`,
						`EPUB/${href}`,
						`Text/${href}`
					];
					
					for (const path of pathsToTry) {
						try {
							const rawHtml = await archive.getText(path);
							if (rawHtml) {
								console.log('[EpubService] Got archive content for path:', path);
								const parser = new DOMParser();
								const parsed = parser.parseFromString(rawHtml, 'text/html');
								text = parsed.body?.textContent || parsed.documentElement?.textContent || '';
								if (text.trim()) {
									console.log('[EpubService] Extracted from archive:', text.length, 'chars');
									break;
								}
							}
						} catch {
							// Try next path
						}
					}
				} catch (archiveError) {
					console.warn('[EpubService] Archive access failed:', archiveError);
				}
			}
			
			section.unload();
			
			console.log('[EpubService] Final extracted text length:', text.trim().length);
			return text.trim();
		} catch (e: any) {
			console.error('[EpubService] Failed to load section:', {
				errorMessage: e?.message,
				href: href
			});
			throw new Error(`Failed to load chapter "${href}": ${e?.message || 'unknown error'}. Try refreshing the book.`);
		}
	}

	/**
	 * Get all text content from the book for indexing.
	 * Used to build the client-side vector store.
	 */
	async getAllChaptersText(): Promise<Array<{
		id: string;
		title: string;
		text: string;
		href: string;
	}>> {
		if (!this.book) throw new Error('No book loaded');
		
		// Ensure spine is loaded
		await this.book.loaded.spine;
		
		const chapters: Array<{ id: string; title: string; text: string; href: string }> = [];
		const toc = await this.getTableOfContents();
		const spine = this.book.spine as any;
		const items = spine?.items || [];
		
		console.log(`[EpubService] getAllChaptersText: processing ${items.length} spine items`);
		
		for (const item of items) {
			const href = item?.href;
			if (!href) continue;
			
			try {
				// Use the robust extractTextFromHref method with all fallbacks
				const text = await this.extractTextFromHref(href);
				
				// Find TOC entry for title
				const tocEntry = this.findTocEntryForHref(toc, href);
				
				if (text.trim()) {
					chapters.push({
						id: item.idref || item.id || href,
						title: tocEntry?.label || this.extractTitleFromHref(href),
						text: text.trim(),
						href: href,
					});
					console.log(`[EpubService] Indexed chapter: ${href} (${text.length} chars)`);
				} else {
					console.log(`[EpubService] Skipped empty chapter: ${href}`);
				}
			} catch (e) {
				console.warn(`[EpubService] Failed to extract chapter ${href}:`, e);
			}
		}
		
		console.log(`[EpubService] getAllChaptersText: extracted ${chapters.length} chapters with content`);
		return chapters;
	}

	/**
	 * Get book metadata for the AI agent.
	 */
	getMetadata(): { title: string; author: string; totalPages: number } | null {
		if (!this.book) return null;
		
		const metadata = (this.book as any).packaging?.metadata;
		const spine = this.book.spine as any;
		
		return {
			title: metadata?.title || 'Unknown Title',
			author: metadata?.creator || 'Unknown Author',
			totalPages: this.totalLocations || spine?.items?.length * 20 || 100,
		};
	}

	/**
	 * Get table of contents formatted for the AI agent.
	 */
	async getTableOfContentsForAgent(): Promise<Array<{
		id: string;
		title: string;
		href: string;
		level: number;
	}>> {
		const toc = await this.getTableOfContents();
		return this.flattenTocForAgent(toc, 0);
	}

	private flattenTocForAgent(items: TocItem[], level: number): Array<{
		id: string;
		title: string;
		href: string;
		level: number;
	}> {
		const result: Array<{ id: string; title: string; href: string; level: number }> = [];
		
		for (const item of items) {
			result.push({
				id: item.id || item.href,
				title: item.label,
				href: item.href,
				level,
			});
			
			if (item.subitems) {
				result.push(...this.flattenTocForAgent(item.subitems, level + 1));
			}
		}
		
		return result;
	}

	/**
	 * Get comprehensive book context for the AI agent.
	 * This provides all the information the agent needs to use tools effectively.
	 */
	async getBookContext(): Promise<{
		metadata: { title: string; author: string; totalPages: number };
		tableOfContents: Array<{ id: string; title: string; level: number }>;
		chapterCount: number;
	} | null> {
		if (!this.book) return null;
		
		const metadata = this.getMetadata();
		if (!metadata) return null;
		
		const toc = await this.getTableOfContentsForAgent();
		
		return {
			metadata,
			tableOfContents: toc.map(item => ({
				id: item.id,
				title: item.title,
				level: item.level,
			})),
			chapterCount: toc.filter(item => item.level === 0).length,
		};
	}

	/**
	 * Format book context as a string for inclusion in agent prompts.
	 * Includes the full TOC with chapter_ids that can be used with get_chapter().
	 * Also includes the user's current reading location for context.
	 */
	async getBookContextString(): Promise<string | null> {
		if (!this.book) return null;
		
		const metadata = this.getMetadata();
		if (!metadata) return null;
		
		const toc = await this.getTableOfContentsForAgent();
		const pageInfo = await this.getCurrentPageInfo();
		
		const lines: string[] = [
			`Book: "${metadata.title}" by ${metadata.author}`,
			`Approximate pages: ${metadata.totalPages}`,
		];
		
		// Add current reading position if available (chapter title only, not percentage)
		if (pageInfo && pageInfo.chapterTitle) {
			lines.push(`User is currently reading: "${pageInfo.chapterTitle}"`);
		}
		
		lines.push('');
		lines.push(`Table of Contents (${toc.filter(item => item.level === 0).length} top-level sections):`);
		lines.push('');
		
		// Include both the id AND a hint about the href for debugging
		for (const item of toc) {
			const indent = '  '.repeat(item.level);
			const title = item.title.trim();
			// Use the id as the chapter_id (agent will pass this to get_chapter)
			lines.push(`${indent}- "${title}" (chapter_id: "${item.id}")`);
		}
		
		lines.push('');
		lines.push('To read a chapter, use: get_chapter(chapter_id) with one of the IDs above.');
		lines.push('To search for topics: use search_book(query) for semantic search.');
		
		return lines.join('\n');
	}

	private findTocEntryForHref(toc: TocItem[], href: string): TocItem | null {
		const baseHref = href.split('#')[0];
		
		for (const item of toc) {
			const itemBaseHref = item.href.split('#')[0];
			if (itemBaseHref === baseHref || item.href.includes(baseHref)) {
				return item;
			}
			if (item.subitems) {
				const found = this.findTocEntryForHref(item.subitems, href);
				if (found) return found;
			}
		}
		
		return null;
	}

	/**
	 * Get information about the current reading position.
	 * Returns chapter name, progress percentage, and visible text on the current page.
	 */
	async getCurrentPageInfo(): Promise<{
		chapterTitle: string | null;
		chapterId: string | null;
		percentage: number;
		visibleText: string | null;
	} | null> {
		if (!this.rendition || !this.book) return null;

		const location = this.rendition.currentLocation() as any;
		if (!location || !location.start) return null;

		// Get the current spine item href
		const spineIndex = location.start.index || 0;
		const spine = (this.book.spine as any);
		const spineItem = spine?.items?.[spineIndex] || spine?.get?.(spineIndex);
		const href = spineItem?.href || '';
		
		// Calculate percentage progress
		let percentage = 0;
		if (this.locationsReady && this.totalLocations > 0) {
			const cfi = location.start.cfi;
			const locationIndex = this.book.locations.locationFromCfi(cfi) as unknown as number;
			percentage = Math.round((locationIndex / this.totalLocations) * 100);
		} else {
			// Fallback to spine-based percentage
			const spineLength = spine?.items?.length || spine?.length || 1;
			percentage = Math.round((spineIndex / spineLength) * 100);
		}

		// Find matching TOC entry
		const toc = await this.getTableOfContents();
		const tocEntry = this.findTocEntryForHref(toc, href);

		// Get visible text from the current page
		let visibleText: string | null = null;
		try {
			const contents = this.rendition.getContents() as any;
			if (contents && contents.length > 0) {
				const content = contents[0];
				const body = content?.document?.body;
				if (body) {
					// Get text content, limited to reasonable size
					visibleText = body.textContent?.trim().slice(0, 2000) || null;
				}
			}
		} catch (e) {
			console.warn('[EpubService] Failed to get visible text:', e);
		}

		return {
			chapterTitle: tocEntry?.label || this.extractTitleFromHref(href) || null,
			chapterId: tocEntry?.id || null,
			percentage,
			visibleText,
		};
	}

	private extractTitleFromHref(href: string): string {
		// Extract a readable name from the href
		const filename = href.split('/').pop() || href;
		return filename
			.replace(/\.(x?html?|xml)$/i, '')
			.replace(/[-_]/g, ' ')
			.replace(/^\d+\s*/, ''); // Remove leading numbers
	}

	destroy(): void {
		if (this.resizeTimeout) {
			clearTimeout(this.resizeTimeout);
			this.resizeTimeout = null;
		}
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
		if (this.rendition) {
			this.rendition.destroy();
			this.rendition = null;
		}
		if (this.book) {
			this.book.destroy();
			this.book = null;
		}
		this.container = null;
		this.totalLocations = 0;
		this.locationsReady = false;
		this.onLocationsReady = null;
		this.loadedAnnotations = [];
		this.renderedListenerAttached = false;
		this.toc = [];
	}
}

export const epubService = new EpubService();
