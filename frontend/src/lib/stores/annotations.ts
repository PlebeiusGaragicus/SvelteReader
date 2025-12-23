import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import {
	storeAnnotation,
	getAnnotationsByBook,
	getAllAnnotations,
	deleteAnnotation as deleteAnnotationFromDB,
	deleteAnnotationsByBook,
	getBookBySha256
} from '$lib/services/storageService';
import {
	publishAnnotation,
	publishAnnotationDeletion,
	type CyphertapPublisher
} from '$lib/services/nostrService';
import type { Annotation } from '$lib/types';
import {
	type AnnotationLocal,
	type AnnotationColor,
	getAnnotationKey,
	annotationHasContent
} from '$lib/types';
import { getDefaultRelays } from '$lib/types/nostr';

// In-memory store for annotations
const { subscribe, set, update } = writable<AnnotationLocal[]>([]);

// Track if store has been initialized from IndexedDB
let initialized = false;
let currentOwnerPubkey: string | null = null;

// CypherTap instance for Nostr publishing
let cyphertapInstance: CyphertapPublisher | null = null;

// Set the CypherTap instance for Nostr publishing
function setCyphertap(cyphertap: CyphertapPublisher | null): void {
	console.log('[Annotations] CypherTap instance updated:', cyphertap ? 'connected' : 'disconnected');
	cyphertapInstance = cyphertap;
}

// Initialize store from IndexedDB for a specific user
async function initializeStore(ownerPubkey?: string): Promise<void> {
	if (!browser) return;
	
	// If owner changed, reinitialize
	if (initialized && ownerPubkey === currentOwnerPubkey) return;
	
	try {
		currentOwnerPubkey = ownerPubkey || null;
		if (ownerPubkey) {
			const annotations = await getAllAnnotations(ownerPubkey);
			set(annotations);
			console.log(`[Annotations] Initialized for user ${ownerPubkey.slice(0, 8)}...: ${annotations.length} annotations`);
		} else {
			// No user logged in - empty annotations
			set([]);
			console.log('[Annotations] No user logged in, annotations empty');
		}
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
	
	// Require user to be logged in
	if (!currentOwnerPubkey) {
		throw new Error('Cannot create annotation: no user logged in');
	}
	
	// Build plain object to avoid reactive proxy issues with IndexedDB
	let annotation: AnnotationLocal = {
		bookSha256,
		cfiRange,
		text: data.text ?? existing?.text ?? '',
		ownerPubkey: existing?.ownerPubkey ?? currentOwnerPubkey,
		highlightColor: data.highlightColor !== undefined ? data.highlightColor : existing?.highlightColor,
		// null means "clear the note", undefined means "don't change"
		note: data.note === null ? undefined : (data.note !== undefined ? data.note : existing?.note),
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
	
	// Auto-publish to Nostr if book is public and logged in
	const book = await getBookBySha256(bookSha256);
	if (book?.isPublic && cyphertapInstance?.isLoggedIn) {
		console.log(`[Annotations] Auto-publishing annotation for public book: ${key.slice(0, 30)}...`);
		const result = await publishAnnotation(annotation, cyphertapInstance);
		if (result.success) {
			// Update annotation with Nostr sync state
			annotation = {
				...annotation,
				nostrEventId: result.eventId,
				nostrCreatedAt: Math.floor(Date.now() / 1000),
				relays: result.relays,
				syncPending: false,
			};
			// Persist updated sync state
			await storeAnnotation(annotation);
			console.log(`[Annotations] ✓ Annotation synced to Nostr`);
		} else {
			// Mark as pending sync on failure
			annotation = { ...annotation, syncPending: true };
			await storeAnnotation(annotation);
			console.warn('[Annotations] ✗ Failed to publish annotation to Nostr:', result.error);
		}
	} else if (!book?.isPublic) {
		console.log(`[Annotations] Book is local-only, skipping Nostr sync`);
	}
	
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
	
	// Get the annotation before deleting to check if it was published
	const currentAnnotations = get({ subscribe });
	const existing = currentAnnotations.find(
		a => a.bookSha256 === bookSha256 && a.cfiRange === cfiRange
	);
	
	await deleteAnnotationFromDB(bookSha256, cfiRange);
	
	// Update store immediately (optimistic update) so UI reflects deletion right away
	update(annotations =>
		annotations.filter(a => !(a.bookSha256 === bookSha256 && a.cfiRange === cfiRange))
	);
	
	// Publish deletion to Nostr in background if the annotation was previously published
	if (existing?.nostrEventId && cyphertapInstance?.isLoggedIn) {
		publishAnnotationDeletion(bookSha256, cfiRange, cyphertapInstance).then(result => {
			if (!result.success) {
				console.warn('Failed to publish annotation deletion to Nostr:', result.error);
			}
		});
	}
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

// Merge annotations fetched from Nostr (LWW conflict resolution)
async function mergeFromNostr(remoteAnnotations: Annotation[]): Promise<{ merged: number; conflicts: number }> {
	await ensureInitialized();
	
	let merged = 0;
	let conflicts = 0;
	const currentAnnotations = get({ subscribe });
	
	console.log(`[Annotations] Merging ${remoteAnnotations.length} remote annotations...`);
	
	for (const remote of remoteAnnotations) {
		const key = getAnnotationKey(remote.bookSha256, remote.cfiRange);
		const local = currentAnnotations.find(
			a => a.bookSha256 === remote.bookSha256 && a.cfiRange === remote.cfiRange
		);
		
		if (!local) {
			// New annotation from Nostr - add it
			if (!currentOwnerPubkey) {
				console.warn('[Annotations] Cannot merge annotation: no user logged in');
				continue;
			}
			console.log(`[Annotations]   + New: ${key.slice(0, 30)}...`);
			const newAnnotation: AnnotationLocal = {
				...remote,
				ownerPubkey: remote.ownerPubkey || currentOwnerPubkey,
				nostrEventId: remote.nostrEventId,
				nostrCreatedAt: remote.nostrCreatedAt,
				syncPending: false,
			};
			await storeAnnotation(newAnnotation);
			update(annotations => [...annotations, newAnnotation]);
			merged++;
		} else {
			// Existing annotation - use LWW (Last Write Wins)
			const remoteTime = remote.nostrCreatedAt || 0;
			const localTime = local.nostrCreatedAt || Math.floor(local.createdAt / 1000);
			
			if (remoteTime > localTime) {
				// Remote is newer - update local
				console.log(`[Annotations]   ~ Update (remote newer): ${key.slice(0, 30)}...`);
				const updatedAnnotation: AnnotationLocal = {
					...local,
					text: remote.text,
					highlightColor: remote.highlightColor,
					note: remote.note,
					nostrEventId: remote.nostrEventId,
					nostrCreatedAt: remote.nostrCreatedAt,
					syncPending: false,
				};
				await storeAnnotation(updatedAnnotation);
				update(annotations => {
					const index = annotations.findIndex(
						a => a.bookSha256 === remote.bookSha256 && a.cfiRange === remote.cfiRange
					);
					if (index >= 0) {
						annotations[index] = updatedAnnotation;
						return [...annotations];
					}
					return annotations;
				});
				merged++;
				conflicts++;
			} else {
				// Local is newer or same - keep local
				console.log(`[Annotations]   = Skip (local newer): ${key.slice(0, 30)}...`);
			}
		}
	}
	
	console.log(`[Annotations] Merge complete: ${merged} merged, ${conflicts} conflicts resolved`);
	return { merged, conflicts };
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
	setCyphertap,
	mergeFromNostr,
	reset
};
