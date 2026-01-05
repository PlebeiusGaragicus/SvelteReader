/**
 * Books Store - Reactive store for book library using Svelte 5 runes
 * 
 * Manages the user's book collection with IndexedDB persistence and Nostr sync.
 */

import { browser } from '$app/environment';
import {
	removeEpubData,
	storeBook,
	getBook,
	getAllBooks,
	getBooksWithEpubData,
	getBookBySha256ForOwner,
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

// Reactive state using Svelte 5 runes
let booksState = $state<Book[]>([]);

// Track if store has been initialized from IndexedDB
let initialized = $state(false);
let currentOwnerPubkey = $state<string | null>(null);

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
			const loadedBooks = await getAllBooks(ownerPubkey);
			booksState = loadedBooks;
			console.log(`[Books] Initialized for user ${ownerPubkey.slice(0, 8)}...: ${loadedBooks.length} books`);
		} else {
			// No user logged in - empty library
			booksState = [];
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
	
	booksState = [...booksState, newBook];
	
	return id;
}

// Remove a book (keeps annotations as ghost book if they exist)
async function removeBook(id: string, deleteAnnotations: boolean = false): Promise<void> {
	await ensureInitialized();
	
	const book = booksState.find(b => b.id === id);
	
	if (!book) return;
	
	// Always remove EPUB data and locations
	await removeEpubData(id);
	
	if (deleteAnnotations) {
		// Delete annotations and book completely
		await deleteAnnotationsByBook(book.sha256);
		await deleteBookFromDB(id);
		booksState = booksState.filter(b => b.id !== id);
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
			booksState = booksState.map(b => b.id === id ? ghostBook : b);
		} else {
			// No annotations, delete completely
			await deleteBookFromDB(id);
			booksState = booksState.filter(b => b.id !== id);
		}
	}
}

// Update book progress
async function updateProgress(id: string, currentPage: number, currentCfi?: string, totalPages?: number): Promise<void> {
	await ensureInitialized();
	
	const book = booksState.find(b => b.id === id);
	
	if (!book) return;
	
	// Use provided totalPages or fall back to book's stored value
	const effectiveTotalPages = totalPages ?? book.totalPages;
	
	const updatedBook: Book = {
		...book,
		currentPage,
		totalPages: effectiveTotalPages > 0 ? effectiveTotalPages : book.totalPages,
		progress: effectiveTotalPages > 0 ? Math.round((currentPage / effectiveTotalPages) * 100) : 0,
		currentCfi: currentCfi ?? book.currentCfi
	};
	
	await storeBook(updatedBook);
	
	booksState = booksState.map(b => b.id === id ? updatedBook : b);
}

// Update book metadata
async function updateBook(id: string, updates: Partial<Omit<Book, 'id' | 'sha256'>>): Promise<void> {
	await ensureInitialized();
	
	const book = booksState.find(b => b.id === id);
	
	if (!book) return;
	
	const updatedBook: Book = { ...book, ...updates };
	
	await storeBook(updatedBook);
	
	booksState = booksState.map(b => b.id === id ? updatedBook : b);
}

// Get a book by ID
async function getBookById(id: string): Promise<Book | null> {
	await ensureInitialized();
	
	return booksState.find(b => b.id === id) ?? null;
}

// Get a book by SHA-256
function getBookBySha256(sha256: string): Book | null {
	return booksState.find(b => b.sha256 === sha256) ?? null;
}

// Set CypherTap instance for Nostr publishing
function setCyphertap(cyphertap: CyphertapPublisher | null): void {
	cyphertapInstance = cyphertap;
}

// Publish a book to Nostr
async function publishBook(id: string): Promise<{ success: boolean; error?: string }> {
	await ensureInitialized();
	
	const book = booksState.find(b => b.id === id);
	
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
		booksState = booksState.map(b => b.id === id ? updatedBook : b);
		
		return { success: true };
	}
	
	return { success: false, error: result.error };
}

// Merge books fetched from Nostr (creates ghost books for unknown SHA-256s)
async function mergeFromNostr(remoteBooks: FetchedBook[]): Promise<{ merged: number; ghostsCreated: number }> {
	await ensureInitialized();
	
	let merged = 0;
	let ghostsCreated = 0;
	
	console.log(`[Books] Merging ${remoteBooks.length} remote books...`);
	
	for (const remote of remoteBooks) {
		const local = booksState.find(b => b.sha256 === remote.sha256);
		
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
			booksState = [...booksState, ghostBook];
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
				booksState = booksState.map(b => b.sha256 === remote.sha256 ? updatedBook : b);
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
	booksState = [];
	initialized = false;
}

// Get books with EPUB data that belong to other users (for "Available Books" section)
async function getOtherBooksWithEpub(): Promise<Book[]> {
	if (!browser) return [];
	return getBooksWithEpubData(currentOwnerPubkey || undefined);
}

// Check if current user already has this book (by sha256)
async function currentUserHasBook(sha256: string): Promise<boolean> {
	if (!currentOwnerPubkey) return false;
	const book = await getBookBySha256ForOwner(sha256, currentOwnerPubkey);
	return book !== null;
}

// "Adopt" a book - create a new book record for current user, reusing existing EPUB data
// The sourceBookId is used to find the EPUB data to share
async function adoptBook(sourceBook: Book): Promise<string> {
	if (!currentOwnerPubkey) {
		throw new Error('Cannot adopt book: no user logged in');
	}
	
	// Check if user already has this book
	const existing = await getBookBySha256ForOwner(sourceBook.sha256, currentOwnerPubkey);
	if (existing) {
		throw new Error('Book already in your library');
	}
	
	const id = crypto.randomUUID();
	const newBook: Book = {
		id,
		ownerPubkey: currentOwnerPubkey,
		sha256: sourceBook.sha256,
		title: sourceBook.title,
		author: sourceBook.author,
		isbn: sourceBook.isbn,
		year: sourceBook.year,
		coverBase64: sourceBook.coverBase64,
		progress: 0,
		currentPage: 0,
		totalPages: sourceBook.totalPages,
		hasEpubData: sourceBook.hasEpubData, // Will be true since we're adopting from a book with EPUB
		isPublic: false, // Start as private, user can publish later
		syncPending: false,
	};
	
	await storeBook(newBook);
	booksState = [...booksState, newBook];
	
	return id;
}

// Get current owner pubkey (for external checks)
function getCurrentOwner(): string | null {
	return currentOwnerPubkey;
}

// Export reactive getters and actions
export const books = {
	// Reactive getter for the books array
	get items() { return booksState; },
	
	// Actions
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
	reset,
	getOtherBooksWithEpub,
	currentUserHasBook,
	adoptBook,
	getCurrentOwner
};

