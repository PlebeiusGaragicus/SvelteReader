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
import { publishBook as publishBookToNostr, publishBookDeletion, type CyphertapPublisher } from '$lib/services/nostrService';
import { getDefaultRelays } from '$lib/types/nostr';
import type { Book, BookIdentity } from '$lib/types';
import type { FetchedBook } from './sync.svelte';

// Re-export types for backward compatibility
export type { Book } from '$lib/types';

// In-memory store for books
const { subscribe, set, update } = writable<Book[]>([]);

// Track if store has been initialized from IndexedDB
let initialized = false;
let currentOwnerPubkey: string | null = null;

// CypherTap instance for Nostr publishing
let cyphertapInstance: CyphertapPublisher | null = null;

// Initialize store from IndexedDB for a specific user
async function initializeStore(ownerPubkey?: string): Promise<void> {
	if (!browser) return;
	
	// If owner changed, reinitialize
	if (initialized && ownerPubkey === currentOwnerPubkey) return;
	
	try {
		currentOwnerPubkey = ownerPubkey || null;
		if (ownerPubkey) {
			const books = await getAllBooks(ownerPubkey);
			set(books);
			console.log(`[Books] Initialized for user ${ownerPubkey.slice(0, 8)}...: ${books.length} books`);
		} else {
			// No user logged in - empty library
			set([]);
			console.log('[Books] No user logged in, library empty');
		}
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
async function addBook(book: Omit<Book, 'id' | 'ownerPubkey'>): Promise<string> {
	await ensureInitialized();
	
	if (!currentOwnerPubkey) {
		throw new Error('Cannot add book: no user logged in');
	}
	
	const id = crypto.randomUUID();
	const newBook: Book = { ...book, id, ownerPubkey: currentOwnerPubkey };
	
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

// Set CypherTap instance for Nostr publishing
function setCyphertap(cyphertap: CyphertapPublisher | null): void {
	cyphertapInstance = cyphertap;
}

// Publish a book to Nostr
async function publishBook(id: string): Promise<{ success: boolean; error?: string }> {
	await ensureInitialized();
	
	const currentBooks = get({ subscribe });
	const book = currentBooks.find(b => b.id === id);
	
	if (!book) {
		return { success: false, error: 'Book not found' };
	}
	
	if (!cyphertapInstance?.isLoggedIn) {
		return { success: false, error: 'Not logged in to Nostr' };
	}
	
	const bookIdentity: BookIdentity = {
		sha256: book.sha256,
		title: book.title,
		author: book.author,
		isbn: book.isbn,
		year: book.year,
		coverBase64: book.coverBase64,
	};
	
	const result = await publishBookToNostr(bookIdentity, cyphertapInstance);
	
	if (result.success) {
		// Update book with Nostr sync state
		const updatedBook: Book = {
			...book,
			isPublic: true,
			nostrEventId: result.eventId,
			nostrCreatedAt: Math.floor(Date.now() / 1000),
			relays: result.relays,
			syncPending: false,
		};
		
		await storeBook(updatedBook);
		update(books => books.map(b => b.id === id ? updatedBook : b));
		
		return { success: true };
	}
	
	return { success: false, error: result.error };
}

// Merge books fetched from Nostr (creates ghost books for unknown SHA-256s)
async function mergeFromNostr(remoteBooks: FetchedBook[]): Promise<{ merged: number; ghostsCreated: number }> {
	await ensureInitialized();
	
	let merged = 0;
	let ghostsCreated = 0;
	const currentBooks = get({ subscribe });
	
	console.log(`[Books] Merging ${remoteBooks.length} remote books...`);
	
	for (const remote of remoteBooks) {
		const local = currentBooks.find(b => b.sha256 === remote.sha256);
		
		if (!local) {
			// New book from Nostr - create ghost book
			if (!currentOwnerPubkey) {
				console.warn('[Books] Cannot create ghost book: no user logged in');
				continue;
			}
			console.log(`[Books]   + Ghost book: ${remote.title}`);
			const ghostBook: Book = {
				id: crypto.randomUUID(),
				sha256: remote.sha256,
				ownerPubkey: currentOwnerPubkey,
				title: remote.title,
				author: remote.author,
				isbn: remote.isbn,
				year: remote.year,
				coverBase64: remote.coverBase64,
				progress: 0,
				currentPage: 0,
				totalPages: 0,
				hasEpubData: false, // Ghost book - no EPUB data
				isPublic: true,
				nostrEventId: remote.nostrEventId,
				nostrCreatedAt: remote.nostrCreatedAt,
				relays: remote.relays,
				syncPending: false,
			};
			
			await storeBook(ghostBook);
			update(books => [...books, ghostBook]);
			ghostsCreated++;
			merged++;
		} else {
			// Existing book - use LWW (Last Write Wins)
			const remoteTime = remote.nostrCreatedAt || 0;
			const localTime = local.nostrCreatedAt || 0;
			
			if (remoteTime > localTime) {
				// Remote is newer - update local metadata
				console.log(`[Books]   ~ Update (remote newer): ${remote.title}`);
				const updatedBook: Book = {
					...local,
					title: remote.title,
					author: remote.author,
					isbn: remote.isbn,
					year: remote.year,
					coverBase64: remote.coverBase64,
					isPublic: true,
					nostrEventId: remote.nostrEventId,
					nostrCreatedAt: remote.nostrCreatedAt,
					relays: remote.relays,
					syncPending: false,
				};
				
				await storeBook(updatedBook);
				update(books => books.map(b => b.sha256 === remote.sha256 ? updatedBook : b));
				merged++;
			} else {
				// Local is newer or same - keep local
				console.log(`[Books]   = Skip (local newer): ${remote.title}`);
			}
		}
	}
	
	console.log(`[Books] Merge complete: ${merged} merged, ${ghostsCreated} ghost books created`);
	return { merged, ghostsCreated };
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
	setCyphertap,
	publishBook,
	mergeFromNostr,
	reset
};
