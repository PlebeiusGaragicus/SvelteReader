import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { removeEpubData } from '$lib/services/storageService';
import type { Book, Annotation } from '$lib/types';
import { AppError } from '$lib/types';

// Re-export types for backward compatibility
export type { Book, Annotation } from '$lib/types';

const STORAGE_KEY = 'sveltereader-books';

interface StoredBook {
	id: string;
	title: string;
	author: string;
	coverUrl?: string;
	progress: number;
	totalPages: number;
	currentPage: number;
	lastRead?: string;
	annotations: Array<Omit<Annotation, 'createdAt'> & { createdAt: string }>;
	currentCfi?: string;
}

function deserializeBook(stored: StoredBook): Book {
	return {
		...stored,
		lastRead: stored.lastRead ? new Date(stored.lastRead) : undefined,
		annotations: stored.annotations.map((a) => ({
			...a,
			createdAt: new Date(a.createdAt)
		}))
	};
}

function loadBooksFromStorage(): Book[] {
	if (!browser) return [];
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const books: StoredBook[] = JSON.parse(stored);
			return books.map(deserializeBook);
		}
	} catch (e) {
		console.error('Failed to load books from storage:', e);
		// Don't throw - return empty array and let user re-import
	}
	return [];
}

function saveBooksToStorage(books: Book[]): void {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
	} catch (e) {
		console.error('Failed to save books to storage:', e);
		// Storage quota exceeded or other error
		throw new AppError(
			'Failed to save book data. Your browser storage may be full.',
			'STORAGE_WRITE_FAILED',
			true
		);
	}
}

function createBooksStore() {
	const initialBooks = loadBooksFromStorage();
	const { subscribe, set, update } = writable<Book[]>(initialBooks);

	return {
		subscribe,
		addBook: (book: Omit<Book, 'id' | 'annotations'>): string => {
			const id = crypto.randomUUID();
			update((books) => {
				const newBooks = [...books, { ...book, id, annotations: [] }];
				saveBooksToStorage(newBooks);
				return newBooks;
			});
			return id;
		},
		removeBook: (id: string) => {
			removeEpubData(id);
			update((books) => {
				const newBooks = books.filter((b) => b.id !== id);
				saveBooksToStorage(newBooks);
				return newBooks;
			});
		},
		updateProgress: (id: string, currentPage: number, currentCfi?: string) => {
			update((books) => {
				const newBooks = books.map((b) =>
					b.id === id
						? {
								...b,
								currentPage,
								progress: Math.round((currentPage / b.totalPages) * 100),
								lastRead: new Date(),
								currentCfi: currentCfi ?? b.currentCfi
							}
						: b
				);
				saveBooksToStorage(newBooks);
				return newBooks;
			});
		},
		addAnnotation: (bookId: string, annotation: Omit<Annotation, 'id' | 'bookId' | 'createdAt'>) => {
			update((books) => {
				const newBooks = books.map((b) =>
					b.id === bookId
						? {
								...b,
								annotations: [
									...b.annotations,
									{
										...annotation,
										id: crypto.randomUUID(),
										bookId,
										createdAt: new Date()
									}
								]
							}
						: b
				);
				saveBooksToStorage(newBooks);
				return newBooks;
			});
		},
		removeAnnotation: (bookId: string, annotationId: string) => {
			update((books) => {
				const newBooks = books.map((b) =>
					b.id === bookId
						? {
								...b,
								annotations: b.annotations.filter((a) => a.id !== annotationId)
							}
						: b
				);
				saveBooksToStorage(newBooks);
				return newBooks;
			});
		},
		reset: () => {
			set([]);
			if (browser) {
				localStorage.removeItem(STORAGE_KEY);
			}
		}
	};
}

export const books = createBooksStore();
