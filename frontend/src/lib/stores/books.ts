import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import {
	removeEpubData,
	storeBook,
	getBook,
	getAllBooks,
	deleteBook as deleteBookFromDB,
	getAnnotationsByBook,
	deleteAnnotationsByBook
} from '$lib/services/storageService';
import type { Book } from '$lib/types';

// Re-export types for backward compatibility
export type { Book } from '$lib/types';

// In-memory store for books
const { subscribe, set, update } = writable<Book[]>([]);

// Track if store has been initialized from IndexedDB
let initialized = false;

// Initialize store from IndexedDB
async function initializeStore(): Promise<void> {
	if (!browser || initialized) return;
	
	try {
		const books = await getAllBooks();
		set(books);
		initialized = true;
	} catch (e) {
		console.error('Failed to initialize books store:', e);
	}
}

// Ensure store is initialized before operations
async function ensureInitialized(): Promise<void> {
	if (!initialized) {
		await initializeStore();
	}
}

// Add a new book
async function addBook(book: Omit<Book, 'id'>): Promise<string> {
	await ensureInitialized();
	
	const id = crypto.randomUUID();
	const newBook: Book = { ...book, id };
	
	await storeBook(newBook);
	
	update(books => [...books, newBook]);
	
	return id;
}

// Remove a book (keeps annotations as ghost book if they exist)
async function removeBook(id: string, deleteAnnotations: boolean = false): Promise<void> {
	await ensureInitialized();
	
	const currentBooks = get({ subscribe });
	const book = currentBooks.find(b => b.id === id);
	
	if (!book) return;
	
	// Always remove EPUB data and locations
	await removeEpubData(id);
	
	if (deleteAnnotations) {
		// Delete annotations and book completely
		await deleteAnnotationsByBook(book.sha256);
		await deleteBookFromDB(id);
		update(books => books.filter(b => b.id !== id));
	} else {
		// Check if there are annotations for this book
		const annotations = await getAnnotationsByBook(book.sha256);
		
		if (annotations.length > 0) {
			// Convert to ghost book
			const ghostBook: Book = {
				...book,
				hasEpubData: false
			};
			await storeBook(ghostBook);
			update(books => books.map(b => b.id === id ? ghostBook : b));
		} else {
			// No annotations, delete completely
			await deleteBookFromDB(id);
			update(books => books.filter(b => b.id !== id));
		}
	}
}

// Update book progress
async function updateProgress(id: string, currentPage: number, currentCfi?: string): Promise<void> {
	await ensureInitialized();
	
	const currentBooks = get({ subscribe });
	const book = currentBooks.find(b => b.id === id);
	
	if (!book) return;
	
	const updatedBook: Book = {
		...book,
		currentPage,
		progress: Math.round((currentPage / book.totalPages) * 100),
		currentCfi: currentCfi ?? book.currentCfi
	};
	
	await storeBook(updatedBook);
	
	update(books => books.map(b => b.id === id ? updatedBook : b));
}

// Update book metadata
async function updateBook(id: string, updates: Partial<Omit<Book, 'id' | 'sha256'>>): Promise<void> {
	await ensureInitialized();
	
	const currentBooks = get({ subscribe });
	const book = currentBooks.find(b => b.id === id);
	
	if (!book) return;
	
	const updatedBook: Book = { ...book, ...updates };
	
	await storeBook(updatedBook);
	
	update(books => books.map(b => b.id === id ? updatedBook : b));
}

// Get a book by ID
async function getBookById(id: string): Promise<Book | null> {
	await ensureInitialized();
	
	const currentBooks = get({ subscribe });
	return currentBooks.find(b => b.id === id) ?? null;
}

// Get a book by SHA-256
function getBookBySha256(sha256: string): Book | null {
	const currentBooks = get({ subscribe });
	return currentBooks.find(b => b.sha256 === sha256) ?? null;
}

// Reset store (for testing/clearing data)
function reset(): void {
	set([]);
	initialized = false;
}

export const books = {
	subscribe,
	initialize: initializeStore,
	add: addBook,
	remove: removeBook,
	updateProgress,
	update: updateBook,
	getById: getBookById,
	getBySha256: getBookBySha256,
	reset
};
