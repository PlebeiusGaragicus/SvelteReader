import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import {
	storeAnnotation,
	getAnnotationsByBook,
	getAllAnnotations,
	deleteAnnotation as deleteAnnotationFromDB,
	deleteAnnotationsByBook
} from '$lib/services/storageService';
import {
	type AnnotationLocal,
	type AnnotationColor,
	getAnnotationKey,
	annotationHasContent
} from '$lib/types';

// In-memory store for annotations
const { subscribe, set, update } = writable<AnnotationLocal[]>([]);

// Track if store has been initialized from IndexedDB
let initialized = false;

// Initialize store from IndexedDB
async function initializeStore(): Promise<void> {
	if (!browser || initialized) return;
	
	try {
		const annotations = await getAllAnnotations();
		set(annotations);
		initialized = true;
	} catch (e) {
		console.error('Failed to initialize annotations store:', e);
	}
}

// Ensure store is initialized before operations
async function ensureInitialized(): Promise<void> {
	if (!initialized) {
		await initializeStore();
	}
}

// Create or update an annotation
async function upsertAnnotation(
	bookSha256: string,
	cfiRange: string,
	data: Partial<Omit<AnnotationLocal, 'bookSha256' | 'cfiRange' | 'createdAt'>> & { text: string }
): Promise<AnnotationLocal> {
	await ensureInitialized();
	
	const key = getAnnotationKey(bookSha256, cfiRange);
	const currentAnnotations = get({ subscribe });
	const existing = currentAnnotations.find(
		a => a.bookSha256 === bookSha256 && a.cfiRange === cfiRange
	);
	
	// Build plain object to avoid reactive proxy issues with IndexedDB
	const annotation: AnnotationLocal = {
		bookSha256,
		cfiRange,
		text: data.text ?? existing?.text ?? '',
		highlightColor: data.highlightColor !== undefined ? data.highlightColor : existing?.highlightColor,
		note: data.note !== undefined ? data.note : existing?.note,
		createdAt: existing?.createdAt ?? Date.now(),
		// Ensure chatThreadIds is a plain array copy
		chatThreadIds: data.chatThreadIds 
			? [...data.chatThreadIds] 
			: existing?.chatThreadIds 
				? [...existing.chatThreadIds]
				: undefined,
		// Preserve sync state
		nostrEventId: existing?.nostrEventId,
		nostrCreatedAt: existing?.nostrCreatedAt,
		relays: existing?.relays ? [...existing.relays] : undefined,
		isPublic: existing?.isPublic,
		syncPending: existing?.syncPending
	};
	
	// Persist to IndexedDB
	await storeAnnotation(annotation);
	
	// Update in-memory store
	update(annotations => {
		const index = annotations.findIndex(
			a => a.bookSha256 === bookSha256 && a.cfiRange === cfiRange
		);
		if (index >= 0) {
			annotations[index] = annotation;
			return [...annotations];
		} else {
			return [...annotations, annotation];
		}
	});
	
	return annotation;
}

// Remove an annotation
async function removeAnnotation(bookSha256: string, cfiRange: string): Promise<void> {
	await ensureInitialized();
	
	await deleteAnnotationFromDB(bookSha256, cfiRange);
	
	update(annotations =>
		annotations.filter(a => !(a.bookSha256 === bookSha256 && a.cfiRange === cfiRange))
	);
}

// Remove all annotations for a book
async function removeAnnotationsForBook(bookSha256: string): Promise<void> {
	await ensureInitialized();
	
	await deleteAnnotationsByBook(bookSha256);
	
	update(annotations =>
		annotations.filter(a => a.bookSha256 !== bookSha256)
	);
}

// Get annotations for a specific book (derived store)
function getBookAnnotations(bookSha256: string) {
	return derived({ subscribe }, $annotations =>
		$annotations.filter(a => a.bookSha256 === bookSha256)
	);
}

// Add a chat thread to an annotation
async function addChatThread(
	bookSha256: string,
	cfiRange: string,
	threadId: string
): Promise<void> {
	await ensureInitialized();
	
	const currentAnnotations = get({ subscribe });
	const existing = currentAnnotations.find(
		a => a.bookSha256 === bookSha256 && a.cfiRange === cfiRange
	);
	
	if (!existing) {
		console.warn('Cannot add chat thread to non-existent annotation');
		return;
	}
	
	const chatThreadIds = existing.chatThreadIds || [];
	if (!chatThreadIds.includes(threadId)) {
		await upsertAnnotation(bookSha256, cfiRange, {
			...existing,
			chatThreadIds: [...chatThreadIds, threadId]
		});
	}
}

// Remove a chat thread from an annotation
async function removeChatThread(
	bookSha256: string,
	cfiRange: string,
	threadId: string
): Promise<void> {
	await ensureInitialized();
	
	const currentAnnotations = get({ subscribe });
	const existing = currentAnnotations.find(
		a => a.bookSha256 === bookSha256 && a.cfiRange === cfiRange
	);
	
	if (!existing || !existing.chatThreadIds) return;
	
	const updatedThreadIds = existing.chatThreadIds.filter(id => id !== threadId);
	const updatedAnnotation = { ...existing, chatThreadIds: updatedThreadIds };
	
	// If annotation has no content left, remove it entirely
	if (!annotationHasContent(updatedAnnotation)) {
		await removeAnnotation(bookSha256, cfiRange);
	} else {
		await upsertAnnotation(bookSha256, cfiRange, updatedAnnotation);
	}
}

// Reset store (for testing/clearing data)
function reset(): void {
	set([]);
	initialized = false;
}

export const annotations = {
	subscribe,
	initialize: initializeStore,
	upsert: upsertAnnotation,
	remove: removeAnnotation,
	removeForBook: removeAnnotationsForBook,
	getForBook: getBookAnnotations,
	addChatThread,
	removeChatThread,
	reset
};
