import ePub, { Book, Rendition } from 'epubjs';
import type { NavItem } from 'epubjs';
import { storeLocations, getLocations } from '$lib/services/storageService';
import type { BookMetadata, TocItem, LocationInfo } from '$lib/types';
import { AppError } from '$lib/types';

// Re-export types for backward compatibility
export type { BookMetadata, TocItem, LocationInfo } from '$lib/types';

export interface ParsedBook {
	metadata: BookMetadata;
	book: Book;
	arrayBuffer: ArrayBuffer;
}

// Constants for page estimation
const ESTIMATED_PAGES_PER_CHAPTER = 20;
const MIN_ESTIMATED_PAGES = 100;
const LOCATIONS_CHARS_PER_PAGE = 1024;

class EpubService {
	private book: Book | null = null;
	private rendition: Rendition | null = null;
	private totalLocations: number = 0;
	private locationsReady: boolean = false;
	private onLocationsReady: (() => void) | null = null;
	private container: HTMLElement | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private resizeTimeout: ReturnType<typeof setTimeout> | null = null;
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

		// Setup resize observer for responsive behavior
		this.setupResizeObserver(container);

		// Display the book immediately (don't wait for locations)
		if (options?.startCfi) {
			await this.rendition.display(options.startCfi);
		} else {
			await this.rendition.display();
		}

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
	}
}

export const epubService = new EpubService();
