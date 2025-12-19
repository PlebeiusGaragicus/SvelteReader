import ePub, { Book, Rendition } from 'epubjs';
import type { NavItem } from 'epubjs';

export interface BookMetadata {
	title: string;
	author: string;
	coverUrl?: string;
	totalPages: number;
}

export interface ParsedBook {
	metadata: BookMetadata;
	book: Book;
	arrayBuffer: ArrayBuffer;
}

export interface TocItem {
	id: string;
	href: string;
	label: string;
	subitems?: TocItem[];
}

export interface LocationInfo {
	cfi: string;
	percentage: number;
	page: number;
	totalPages: number;
}

class EpubService {
	private book: Book | null = null;
	private rendition: Rendition | null = null;
	private totalLocations: number = 0;
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
		const totalPages = Math.max(spineItems.length * 20, 100); // Rough estimate

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
		this.book = ePub(arrayBuffer);
		await this.book.ready;
		return this.book;
	}

	async renderBook(
		container: HTMLElement,
		options?: { width?: string; height?: string; startCfi?: string }
	): Promise<Rendition> {
		if (!this.book) {
			throw new Error('No book loaded');
		}

		this.rendition = this.book.renderTo(container, {
			width: options?.width || '100%',
			height: options?.height || '100%',
			flow: 'paginated',
			spread: 'none',
			minSpreadWidth: 99999,
			allowScriptedContent: true
		});

		// Generate locations for accurate progress tracking
		await this.book.locations.generate(1024);
		this.totalLocations = this.book.locations.length();

		// Display the book at the start or a specific CFI
		if (options?.startCfi) {
			await this.rendition.display(options.startCfi);
		} else {
			await this.rendition.display();
		}

		return this.rendition;
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

		const themes: Record<string, Record<string, string>> = {
			light: {
				body: {
					background: '#ffffff',
					color: '#1a1a1a'
				}
			},
			dark: {
				body: {
					background: '#1a1a1a',
					color: '#e5e5e5'
				}
			},
			sepia: {
				body: {
					background: '#f4ecd8',
					color: '#5c4b37'
				}
			}
		} as any;

		this.rendition.themes.register('custom', themes[theme]);
		this.rendition.themes.select('custom');
	}

	applyFontSize(size: number): void {
		if (this.rendition) {
			this.rendition.themes.fontSize(`${size}%`);
		}
	}

	destroy(): void {
		if (this.rendition) {
			this.rendition.destroy();
			this.rendition = null;
		}
		if (this.book) {
			this.book.destroy();
			this.book = null;
		}
		this.totalLocations = 0;
	}
}

export const epubService = new EpubService();
