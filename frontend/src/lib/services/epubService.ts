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
	private loadedAnnotations: AnnotationLocal[] = [];
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
			} else if (event.key === 'ArrowRight') {
				this.nextPage();
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

		const navigation = await this.book.loaded.navigation;
		return this.convertNavItems(navigation.toc);
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

		// If locations are ready, use accurate progress
		if (this.locationsReady && this.totalLocations > 0) {
			const locationIndex = this.book.locations.locationFromCfi(cfi) as unknown as number;
			const percentage = locationIndex / this.totalLocations;
			const page = Math.max(1, Math.ceil(percentage * this.totalLocations));

			return {
				cfi,
				percentage: Math.round(percentage * 100),
				page,
				totalPages: this.totalLocations
			};
		}

		// Fallback: estimate based on spine position
		const spineIndex = location.start.index || 0;
		const spine = (this.book.spine as any);
		const spineLength = spine?.items?.length || spine?.length || 1;
		const percentage = Math.round((spineIndex / spineLength) * 100);

		return {
			cfi,
			percentage,
			page: spineIndex + 1,
			totalPages: spineLength
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

	clearSelection(): void {
		const contents = this.rendition?.getContents() as any;
		if (contents && contents[0]) {
			contents[0].window?.getSelection()?.removeAllRanges();
		}
		this.selectionCallback?.(null);
	}

	addHighlight(annotation: AnnotationLocal): void {
		if (!this.rendition) return;

		const className = this.getHighlightClassNameFromAnnotation(annotation);
		
		// Track this annotation for style re-injection on page changes
		if (!this.loadedAnnotations.find(a => a.cfiRange === annotation.cfiRange)) {
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
				this.rendition?.annotations.remove(existing.cfiRange, 'highlight');
			}
		});
		
		// Store annotations for re-injection on page changes
		this.loadedAnnotations = annotations;
		
		// Re-inject styles when content changes (new chapter/page loaded)
		this.rendition.on('rendered', () => {
			this.reinjectAllHighlightStyles();
		});
		
		// Add new annotations (addHighlight checks for duplicates)
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
			// Add blue border if also has chat
			if (hasChat) {
				baseStyle['stroke'] = 'rgb(33, 150, 243)';
				baseStyle['stroke-width'] = '2';
			}
			return baseStyle;
		}
		
		// No highlight color - show as underline based on chat/note
		if (hasChat) {
			return {
				'fill': 'rgba(33, 150, 243, 0.2)',
				'fill-opacity': '0.2',
				'mix-blend-mode': 'multiply',
				'stroke': 'rgb(33, 150, 243)',
				'stroke-width': '2',
				'stroke-dasharray': '4,2'
			};
		}
		
		if (hasNote) {
			return {
				'fill': 'rgba(76, 175, 80, 0.2)',
				'fill-opacity': '0.2',
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
				// Highlight with chat indicator border
				css = `.${className} { background-color: ${colorMap[displayColor]} !important; border-bottom: 2px solid rgb(33, 150, 243) !important; border-radius: 2px !important; }`;
			} else {
				css = `.${className} { background-color: ${colorMap[displayColor]} !important; border-radius: 2px !important; }`;
			}
		} else if (hasChat) {
			css = `.${className} { background-color: transparent !important; border-bottom: 2px solid rgb(33, 150, 243) !important; border-radius: 0 !important; }`;
		} else if (hasNote) {
			css = `.${className} { background-color: transparent !important; border-bottom: 2px solid rgb(76, 175, 80) !important; border-radius: 0 !important; }`;
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
	}
}

export const epubService = new EpubService();
