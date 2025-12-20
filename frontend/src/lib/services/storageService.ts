import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { browser } from '$app/environment';
import { AppError, getAnnotationKey, type Book, type AnnotationLocal } from '$lib/types';

interface SvelteReaderDB extends DBSchema {
	epubs: {
		key: string;
		value: ArrayBuffer;
	};
	locations: {
		key: string;
		value: string;
	};
	books: {
		key: string;
		value: Book;
		indexes: { 'by-sha256': string };
	};
	annotations: {
		key: string;
		value: AnnotationLocal;
		indexes: { 'by-book': string };
	};
}

const DB_NAME = 'sveltereader';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<SvelteReaderDB>> | null = null;

function getDB(): Promise<IDBPDatabase<SvelteReaderDB>> {
	if (!browser) {
		return Promise.reject(new Error('IndexedDB not available on server'));
	}

	if (!dbPromise) {
		dbPromise = openDB<SvelteReaderDB>(DB_NAME, DB_VERSION, {
			upgrade(db, oldVersion) {
				// Version 1: epubs and locations
				if (!db.objectStoreNames.contains('epubs')) {
					db.createObjectStore('epubs');
				}
				if (!db.objectStoreNames.contains('locations')) {
					db.createObjectStore('locations');
				}
				
				// Version 2: books and annotations stores
				if (oldVersion < 2) {
					if (!db.objectStoreNames.contains('books')) {
						const booksStore = db.createObjectStore('books', { keyPath: 'id' });
						booksStore.createIndex('by-sha256', 'sha256', { unique: false });
					}
					if (!db.objectStoreNames.contains('annotations')) {
						const annotationsStore = db.createObjectStore('annotations');
						annotationsStore.createIndex('by-book', 'bookSha256', { unique: false });
					}
				}
			}
		});
	}

	return dbPromise;
}

export async function storeEpubData(bookId: string, arrayBuffer: ArrayBuffer): Promise<void> {
	if (!browser) return;

	try {
		const db = await getDB();
		await db.put('epubs', arrayBuffer, bookId);
	} catch (e) {
		console.error('Failed to store EPUB data:', e);
		throw new AppError(
			'Failed to store EPUB data. Your browser storage may be full.',
			'STORAGE_WRITE_FAILED',
			true
		);
	}
}

export async function getEpubData(bookId: string): Promise<ArrayBuffer | null> {
	if (!browser) return null;

	try {
		const db = await getDB();
		const data = await db.get('epubs', bookId);
		return data ?? null;
	} catch (e) {
		console.error('Failed to get EPUB data:', e);
		throw new AppError(
			'Failed to retrieve book data from storage.',
			'STORAGE_READ_FAILED',
			true
		);
	}
}

export async function removeEpubData(bookId: string): Promise<void> {
	if (!browser) return;

	try {
		const db = await getDB();
		await db.delete('epubs', bookId);
		await db.delete('locations', bookId);
	} catch (e) {
		console.error('Failed to remove EPUB data:', e);
		// Non-critical: log but don't throw - book metadata will still be removed
	}
}

export async function storeLocations(bookId: string, locationsJson: string): Promise<void> {
	if (!browser) return;

	try {
		const db = await getDB();
		await db.put('locations', locationsJson, bookId);
	} catch (e) {
		console.error('Failed to store locations:', e);
		// Non-critical: locations can be regenerated, don't throw
	}
}

export async function getLocations(bookId: string): Promise<string | null> {
	if (!browser) return null;

	try {
		const db = await getDB();
		const data = await db.get('locations', bookId);
		return data ?? null;
	} catch (e) {
		console.error('Failed to get locations:', e);
		// Non-critical: return null and locations will be regenerated
		return null;
	}
}

export async function clearAllData(): Promise<void> {
	if (!browser) return;

	try {
		const db = await getDB();
		await db.clear('epubs');
		await db.clear('locations');
		await db.clear('books');
		await db.clear('annotations');
	} catch (e) {
		console.error('Failed to clear data:', e);
		throw new AppError(
			'Failed to clear storage data.',
			'STORAGE_WRITE_FAILED',
			true
		);
	}
}

// =============================================================================
// BOOK STORAGE
// =============================================================================

export async function storeBook(book: Book): Promise<void> {
	if (!browser) return;

	try {
		const db = await getDB();
		await db.put('books', book);
	} catch (e) {
		console.error('Failed to store book:', e);
		throw new AppError(
			'Failed to save book data.',
			'STORAGE_WRITE_FAILED',
			true
		);
	}
}

export async function getBook(bookId: string): Promise<Book | null> {
	if (!browser) return null;

	try {
		const db = await getDB();
		const book = await db.get('books', bookId);
		return book ?? null;
	} catch (e) {
		console.error('Failed to get book:', e);
		throw new AppError(
			'Failed to retrieve book data.',
			'STORAGE_READ_FAILED',
			true
		);
	}
}

export async function getBookBySha256(sha256: string): Promise<Book | null> {
	if (!browser) return null;

	try {
		const db = await getDB();
		const book = await db.getFromIndex('books', 'by-sha256', sha256);
		return book ?? null;
	} catch (e) {
		console.error('Failed to get book by sha256:', e);
		throw new AppError(
			'Failed to retrieve book data.',
			'STORAGE_READ_FAILED',
			true
		);
	}
}

export async function getAllBooks(): Promise<Book[]> {
	if (!browser) return [];

	try {
		const db = await getDB();
		return await db.getAll('books');
	} catch (e) {
		console.error('Failed to get all books:', e);
		throw new AppError(
			'Failed to retrieve books.',
			'STORAGE_READ_FAILED',
			true
		);
	}
}

export async function deleteBook(bookId: string): Promise<void> {
	if (!browser) return;

	try {
		const db = await getDB();
		await db.delete('books', bookId);
	} catch (e) {
		console.error('Failed to delete book:', e);
		throw new AppError(
			'Failed to delete book.',
			'STORAGE_WRITE_FAILED',
			true
		);
	}
}

// =============================================================================
// ANNOTATION STORAGE
// =============================================================================

export async function storeAnnotation(annotation: AnnotationLocal): Promise<void> {
	if (!browser) return;

	try {
		const db = await getDB();
		const key = getAnnotationKey(annotation.bookSha256, annotation.cfiRange);
		await db.put('annotations', annotation, key);
	} catch (e) {
		console.error('Failed to store annotation:', e);
		throw new AppError(
			'Failed to save annotation.',
			'STORAGE_WRITE_FAILED',
			true
		);
	}
}

export async function getAnnotation(bookSha256: string, cfiRange: string): Promise<AnnotationLocal | null> {
	if (!browser) return null;

	try {
		const db = await getDB();
		const key = getAnnotationKey(bookSha256, cfiRange);
		const annotation = await db.get('annotations', key);
		return annotation ?? null;
	} catch (e) {
		console.error('Failed to get annotation:', e);
		throw new AppError(
			'Failed to retrieve annotation.',
			'STORAGE_READ_FAILED',
			true
		);
	}
}

export async function getAnnotationsByBook(bookSha256: string): Promise<AnnotationLocal[]> {
	if (!browser) return [];

	try {
		const db = await getDB();
		return await db.getAllFromIndex('annotations', 'by-book', bookSha256);
	} catch (e) {
		console.error('Failed to get annotations by book:', e);
		throw new AppError(
			'Failed to retrieve annotations.',
			'STORAGE_READ_FAILED',
			true
		);
	}
}

export async function getAllAnnotations(): Promise<AnnotationLocal[]> {
	if (!browser) return [];

	try {
		const db = await getDB();
		return await db.getAll('annotations');
	} catch (e) {
		console.error('Failed to get all annotations:', e);
		throw new AppError(
			'Failed to retrieve annotations.',
			'STORAGE_READ_FAILED',
			true
		);
	}
}

export async function deleteAnnotation(bookSha256: string, cfiRange: string): Promise<void> {
	if (!browser) return;

	try {
		const db = await getDB();
		const key = getAnnotationKey(bookSha256, cfiRange);
		await db.delete('annotations', key);
	} catch (e) {
		console.error('Failed to delete annotation:', e);
		throw new AppError(
			'Failed to delete annotation.',
			'STORAGE_WRITE_FAILED',
			true
		);
	}
}

export async function deleteAnnotationsByBook(bookSha256: string): Promise<void> {
	if (!browser) return;

	try {
		const db = await getDB();
		const annotations = await db.getAllFromIndex('annotations', 'by-book', bookSha256);
		const tx = db.transaction('annotations', 'readwrite');
		for (const annotation of annotations) {
			const key = getAnnotationKey(annotation.bookSha256, annotation.cfiRange);
			await tx.store.delete(key);
		}
		await tx.done;
	} catch (e) {
		console.error('Failed to delete annotations by book:', e);
		throw new AppError(
			'Failed to delete annotations.',
			'STORAGE_WRITE_FAILED',
			true
		);
	}
}

// =============================================================================
// SHA-256 COMPUTATION
// =============================================================================

export async function computeSha256(arrayBuffer: ArrayBuffer): Promise<string> {
	const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
