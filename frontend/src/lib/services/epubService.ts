import ePub, { Book } from 'epubjs';

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

class EpubService {
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
}

export const epubService = new EpubService();
