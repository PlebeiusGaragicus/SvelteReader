import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { browser } from '$app/environment';

interface SvelteReaderDB extends DBSchema {
	epubs: {
		key: string;
		value: ArrayBuffer;
	};
	locations: {
		key: string;
		value: string;
	};
}

const DB_NAME = 'sveltereader';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SvelteReaderDB>> | null = null;

function getDB(): Promise<IDBPDatabase<SvelteReaderDB>> {
	if (!browser) {
		return Promise.reject(new Error('IndexedDB not available on server'));
	}

	if (!dbPromise) {
		dbPromise = openDB<SvelteReaderDB>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains('epubs')) {
					db.createObjectStore('epubs');
				}
				if (!db.objectStoreNames.contains('locations')) {
					db.createObjectStore('locations');
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
		throw e;
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
		return null;
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
	}
}

export async function storeLocations(bookId: string, locationsJson: string): Promise<void> {
	if (!browser) return;

	try {
		const db = await getDB();
		await db.put('locations', locationsJson, bookId);
	} catch (e) {
		console.error('Failed to store locations:', e);
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
		return null;
	}
}

export async function clearAllData(): Promise<void> {
	if (!browser) return;

	try {
		const db = await getDB();
		await db.clear('epubs');
		await db.clear('locations');
	} catch (e) {
		console.error('Failed to clear data:', e);
	}
}
