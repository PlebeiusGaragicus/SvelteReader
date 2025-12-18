import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'sveltereader-books';
const EPUB_STORAGE_KEY = 'sveltereader-epubs';

export interface Book {
	id: string;
	title: string;
	author: string;
	coverUrl?: string;
	progress: number;
	totalPages: number;
	currentPage: number;
	lastRead?: Date;
	annotations: Annotation[];
	currentCfi?: string;
}

export interface Annotation {
	id: string;
	bookId: string;
	text: string;
	note?: string;
	chapter?: string;
	page: number;
	color: 'yellow' | 'green' | 'blue' | 'pink';
	createdAt: Date;
}

function loadBooksFromStorage(): Book[] {
	if (!browser) return [];
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const books = JSON.parse(stored);
			return books.map((b: any) => ({
				...b,
				lastRead: b.lastRead ? new Date(b.lastRead) : undefined,
				annotations: b.annotations.map((a: any) => ({
					...a,
					createdAt: new Date(a.createdAt)
				}))
			}));
		}
	} catch (e) {
		console.error('Failed to load books from storage:', e);
	}
	return [];
}

function saveBooksToStorage(books: Book[]) {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
	} catch (e) {
		console.error('Failed to save books to storage:', e);
	}
}

export async function storeEpubData(bookId: string, arrayBuffer: ArrayBuffer): Promise<void> {
	if (!browser) return;
	try {
		const base64 = btoa(
			new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
		);
		localStorage.setItem(`${EPUB_STORAGE_KEY}-${bookId}`, base64);
	} catch (e) {
		console.error('Failed to store EPUB data:', e);
	}
}

export async function getEpubData(bookId: string): Promise<ArrayBuffer | null> {
	if (!browser) return null;
	try {
		const base64 = localStorage.getItem(`${EPUB_STORAGE_KEY}-${bookId}`);
		if (!base64) return null;

		const binaryString = atob(base64);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		return bytes.buffer;
	} catch (e) {
		console.error('Failed to get EPUB data:', e);
		return null;
	}
}

export function removeEpubData(bookId: string): void {
	if (!browser) return;
	try {
		localStorage.removeItem(`${EPUB_STORAGE_KEY}-${bookId}`);
	} catch (e) {
		console.error('Failed to remove EPUB data:', e);
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
