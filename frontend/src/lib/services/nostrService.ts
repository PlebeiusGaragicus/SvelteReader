// Nostr service for publishing annotations and books to relays

import type { Annotation, AnnotationLocal, BookIdentity } from '$lib/types';
import {
	annotationToEvent,
	annotationDeletionEvent,
	eventToAnnotation,
	bookToEvent,
	bookDeletionEvent,
	eventToBook,
	extractBookSyncMetadata,
	getDefaultRelays,
	ANNOTATION_EVENT_KIND,
	BOOK_EVENT_KIND,
	type PublishResult,
	type UnsignedNostrEvent,
	type SignedNostrEvent,
	type AnnotationEventContent,
} from '$lib/types/nostr';

// CypherTap API interface (subset of what we need)
export interface CyphertapPublisher {
	isLoggedIn: boolean;
	isReady: boolean;
	getUserHex(): string | null;
	publishEvent(event: Partial<{
		kind: number;
		tags: string[][];
		content: string;
		created_at: number;
	}>): Promise<{ id: string; pubkey: string }>;
	subscribe(
		filter: { kinds?: number[]; authors?: string[]; '#d'?: string[] },
		callback: (event: { id: string; pubkey: string; content: string; kind: number; created_at: number; tags?: string[][] }) => void
	): () => void;
}

/**
 * Publish an annotation to Nostr relays as a kind 30800 addressable event
 * 
 * @param annotation - The annotation to publish
 * @param cyphertap - CypherTap API instance for signing and publishing
 * @returns PublishResult with success status and event details
 */
export async function publishAnnotation(
	annotation: Annotation,
	cyphertap: CyphertapPublisher
): Promise<PublishResult> {
	const dTag = `${annotation.bookSha256}:${annotation.cfiRange}`;
	console.log(`[Nostr] Publishing annotation: ${dTag.slice(0, 20)}...`);
	
	if (!cyphertap.isLoggedIn || !cyphertap.isReady) {
		console.warn('[Nostr] Cannot publish - not logged in');
		return {
			success: false,
			error: 'Not logged in to Nostr',
		};
	}

	try {
		// Get user pubkey for a-tag reference to book announcement
		const userPubkey = cyphertap.getUserHex();
		const relays = getDefaultRelays();
		const relayHint = relays[0]; // Use first relay as hint
		
		const event = annotationToEvent(annotation, userPubkey || undefined, relayHint);
		console.log('[Nostr] Event prepared:', { kind: event.kind, tags: event.tags });
		
		const result = await cyphertap.publishEvent({
			kind: event.kind,
			tags: event.tags,
			content: event.content,
			created_at: event.created_at,
		});

		console.log(`[Nostr] ✓ Published successfully!`);
		console.log(`[Nostr]   Event ID: ${result.id}`);
		console.log(`[Nostr]   Relays: ${relays.join(', ')}`);
		console.log(`[Nostr]   View on: https://njump.me/${result.id}`);

		return {
			success: true,
			eventId: result.id,
			relays,
		};
	} catch (e) {
		console.error('[Nostr] ✗ Failed to publish annotation:', e);
		return {
			success: false,
			error: e instanceof Error ? e.message : 'Unknown error',
		};
	}
}

/**
 * Publish a deletion (tombstone) event for an annotation
 * 
 * @param bookSha256 - Book identifier
 * @param cfiRange - CFI range of the annotation
 * @param cyphertap - CypherTap API instance
 * @returns PublishResult
 */
export async function publishAnnotationDeletion(
	bookSha256: string,
	cfiRange: string,
	cyphertap: CyphertapPublisher
): Promise<PublishResult> {
	const dTag = `${bookSha256}:${cfiRange}`;
	console.log(`[Nostr] Publishing deletion (tombstone): ${dTag.slice(0, 20)}...`);
	
	if (!cyphertap.isLoggedIn || !cyphertap.isReady) {
		console.warn('[Nostr] Cannot publish deletion - not logged in');
		return {
			success: false,
			error: 'Not logged in to Nostr',
		};
	}

	try {
		const event = annotationDeletionEvent(bookSha256, cfiRange);
		
		const result = await cyphertap.publishEvent({
			kind: event.kind,
			tags: event.tags,
			content: event.content,
			created_at: event.created_at,
		});

		const relays = getDefaultRelays();

		console.log(`[Nostr] ✓ Deletion published!`);
		console.log(`[Nostr]   Event ID: ${result.id}`);

		return {
			success: true,
			eventId: result.id,
			relays,
		};
	} catch (e) {
		console.error('[Nostr] ✗ Failed to publish deletion:', e);
		return {
			success: false,
			error: e instanceof Error ? e.message : 'Unknown error',
		};
	}
}

// Fetch result type
export interface FetchResult {
	success: boolean;
	annotations: Annotation[];
	error?: string;
}

/**
 * Fetch annotations from Nostr relays for the current user
 * 
 * @param cyphertap - CypherTap API instance
 * @param timeoutMs - How long to wait for events (default 5000ms)
 * @returns FetchResult with annotations array
 */
export async function fetchAnnotations(
	cyphertap: CyphertapPublisher,
	timeoutMs: number = 5000
): Promise<FetchResult> {
	console.log('[Nostr] Fetching annotations from relays...');
	
	if (!cyphertap.isLoggedIn || !cyphertap.isReady) {
		console.warn('[Nostr] Cannot fetch - not logged in');
		return {
			success: false,
			annotations: [],
			error: 'Not logged in to Nostr',
		};
	}

	const userPubkey = cyphertap.getUserHex();
	if (!userPubkey) {
		console.warn('[Nostr] Cannot fetch - no user pubkey');
		return {
			success: false,
			annotations: [],
			error: 'No user pubkey available',
		};
	}

	console.log(`[Nostr] Subscribing to kind ${ANNOTATION_EVENT_KIND} events for ${userPubkey.slice(0, 8)}...`);

	return new Promise((resolve) => {
		const events: Map<string, { event: SignedNostrEvent; created_at: number }> = new Map();
		
		const unsubscribe = cyphertap.subscribe(
			{
				kinds: [ANNOTATION_EVENT_KIND],
				authors: [userPubkey],
			},
			(event) => {
				// Extract d-tag for deduplication (LWW)
				const dTag = event.tags?.find(t => t[0] === 'd')?.[1];
				if (!dTag) return;
				
				const existing = events.get(dTag);
				// Keep only the latest event (LWW)
				if (!existing || event.created_at > existing.created_at) {
					events.set(dTag, {
						event: {
							id: event.id,
							pubkey: event.pubkey,
							content: event.content,
							kind: event.kind,
							created_at: event.created_at,
							tags: event.tags || [],
							sig: '', // Not needed for parsing
						},
						created_at: event.created_at,
					});
				}
			}
		);

		// Wait for events then process
		setTimeout(() => {
			unsubscribe();
			
			const annotations: Annotation[] = [];
			let deletedCount = 0;
			
			for (const [dTag, { event }] of events) {
				const annotation = eventToAnnotation(event);
				if (annotation) {
					annotations.push(annotation);
				} else {
					// Tombstone or invalid event
					deletedCount++;
				}
			}

			console.log(`[Nostr] ✓ Fetch complete!`);
			console.log(`[Nostr]   Found ${events.size} events`);
			console.log(`[Nostr]   Active annotations: ${annotations.length}`);
			console.log(`[Nostr]   Deleted/tombstones: ${deletedCount}`);

			resolve({
				success: true,
				annotations,
			});
		}, timeoutMs);
	});
}

// =============================================================================
// BOOK FUNCTIONS
// =============================================================================

// Book fetch result type
export interface BookFetchResult {
	success: boolean;
	books: Array<BookIdentity & { nostrEventId: string; nostrCreatedAt: number; relays: string[] }>;
	error?: string;
}

/**
 * Publish a book announcement to Nostr relays as a kind 30801 addressable event
 * 
 * @param book - The book identity to publish
 * @param cyphertap - CypherTap API instance for signing and publishing
 * @param description - Optional description for the book
 * @returns PublishResult with success status and event details
 */
export async function publishBook(
	book: BookIdentity,
	cyphertap: CyphertapPublisher,
	description?: string
): Promise<PublishResult> {
	console.log(`[Nostr] Publishing book: ${book.title} (${book.sha256.slice(0, 8)}...)`);
	
	if (!cyphertap.isLoggedIn || !cyphertap.isReady) {
		console.warn('[Nostr] Cannot publish - not logged in');
		return {
			success: false,
			error: 'Not logged in to Nostr',
		};
	}

	try {
		const event = bookToEvent(book, description);
		console.log('[Nostr] Book event prepared:', { kind: event.kind, tags: event.tags.map(t => t[0]) });
		
		const result = await cyphertap.publishEvent({
			kind: event.kind,
			tags: event.tags,
			content: event.content,
			created_at: event.created_at,
		});

		const relays = getDefaultRelays();

		console.log(`[Nostr] ✓ Book published successfully!`);
		console.log(`[Nostr]   Event ID: ${result.id}`);
		console.log(`[Nostr]   Relays: ${relays.join(', ')}`);
		console.log(`[Nostr]   View on: https://njump.me/${result.id}`);

		return {
			success: true,
			eventId: result.id,
			relays,
		};
	} catch (e) {
		console.error('[Nostr] ✗ Failed to publish book:', e);
		return {
			success: false,
			error: e instanceof Error ? e.message : 'Unknown error',
		};
	}
}

/**
 * Publish a deletion (tombstone) event for a book
 * 
 * @param sha256 - Book SHA-256 identifier
 * @param cyphertap - CypherTap API instance
 * @returns PublishResult
 */
export async function publishBookDeletion(
	sha256: string,
	cyphertap: CyphertapPublisher
): Promise<PublishResult> {
	console.log(`[Nostr] Publishing book deletion (tombstone): ${sha256.slice(0, 8)}...`);
	
	if (!cyphertap.isLoggedIn || !cyphertap.isReady) {
		console.warn('[Nostr] Cannot publish deletion - not logged in');
		return {
			success: false,
			error: 'Not logged in to Nostr',
		};
	}

	try {
		const event = bookDeletionEvent(sha256);
		
		const result = await cyphertap.publishEvent({
			kind: event.kind,
			tags: event.tags,
			content: event.content,
			created_at: event.created_at,
		});

		const relays = getDefaultRelays();

		console.log(`[Nostr] ✓ Book deletion published!`);
		console.log(`[Nostr]   Event ID: ${result.id}`);

		return {
			success: true,
			eventId: result.id,
			relays,
		};
	} catch (e) {
		console.error('[Nostr] ✗ Failed to publish book deletion:', e);
		return {
			success: false,
			error: e instanceof Error ? e.message : 'Unknown error',
		};
	}
}

/**
 * Fetch book announcements from Nostr relays for the current user
 * 
 * @param cyphertap - CypherTap API instance
 * @param timeoutMs - How long to wait for events (default 5000ms)
 * @returns BookFetchResult with books array
 */
export async function fetchBooks(
	cyphertap: CyphertapPublisher,
	timeoutMs: number = 5000
): Promise<BookFetchResult> {
	console.log('[Nostr] Fetching books from relays...');
	
	if (!cyphertap.isLoggedIn || !cyphertap.isReady) {
		console.warn('[Nostr] Cannot fetch - not logged in');
		return {
			success: false,
			books: [],
			error: 'Not logged in to Nostr',
		};
	}

	const userPubkey = cyphertap.getUserHex();
	if (!userPubkey) {
		console.warn('[Nostr] Cannot fetch - no user pubkey');
		return {
			success: false,
			books: [],
			error: 'No user pubkey available',
		};
	}

	console.log(`[Nostr] Subscribing to kind ${BOOK_EVENT_KIND} events for ${userPubkey.slice(0, 8)}...`);

	return new Promise((resolve) => {
		const events: Map<string, { event: SignedNostrEvent; created_at: number }> = new Map();
		
		const unsubscribe = cyphertap.subscribe(
			{
				kinds: [BOOK_EVENT_KIND],
				authors: [userPubkey],
			},
			(event) => {
				// Extract d-tag (SHA-256) for deduplication (LWW)
				const dTag = event.tags?.find(t => t[0] === 'd')?.[1];
				if (!dTag) return;
				
				const existing = events.get(dTag);
				// Keep only the latest event (LWW)
				if (!existing || event.created_at > existing.created_at) {
					events.set(dTag, {
						event: {
							id: event.id,
							pubkey: event.pubkey,
							content: event.content,
							kind: event.kind,
							created_at: event.created_at,
							tags: event.tags || [],
							sig: '', // Not needed for parsing
						},
						created_at: event.created_at,
					});
				}
			}
		);

		// Wait for events then process
		setTimeout(() => {
			unsubscribe();
			
			const books: BookFetchResult['books'] = [];
			let deletedCount = 0;
			
			for (const [sha256, { event }] of events) {
				const book = eventToBook(event);
				if (book) {
					const syncMeta = extractBookSyncMetadata(event);
					books.push({
						...book,
						...syncMeta,
					});
				} else {
					// Tombstone or invalid event
					deletedCount++;
				}
			}

			console.log(`[Nostr] ✓ Book fetch complete!`);
			console.log(`[Nostr]   Found ${events.size} events`);
			console.log(`[Nostr]   Active books: ${books.length}`);
			console.log(`[Nostr]   Deleted/tombstones: ${deletedCount}`);

			resolve({
				success: true,
				books,
			});
		}, timeoutMs);
	});
}

// =============================================================================
// SPECTATE MODE - Fetch remote user's data from specified relays
// =============================================================================

export interface NostrProfile {
	name?: string;
	displayName?: string;
	picture?: string;
	about?: string;
	nip05?: string;
}

export interface FetchRemoteUserResult {
	success: boolean;
	error?: string;
	profile?: NostrProfile;
	books: Array<BookIdentity & { nostrEventId?: string; nostrCreatedAt?: number }>;
	annotations: Annotation[];
}

/**
 * Fetch a remote user's profile, books, and annotations from specified relays
 * This is used for "spectate mode" to view another user's library
 */
export async function fetchRemoteUserData(
	pubkey: string,
	relays: string[],
	timeoutMs: number = 15000
): Promise<FetchRemoteUserResult> {
	console.log(`[Nostr] Fetching remote user data for ${pubkey.slice(0, 8)}...`);
	console.log(`[Nostr]   Relays: ${relays.join(', ')}`);

	const result: FetchRemoteUserResult = {
		success: false,
		books: [],
		annotations: [],
	};

	try {
		// Create WebSocket connections to relays
		const sockets: WebSocket[] = [];
		const events = new Map<string, { kind: number; event: SignedNostrEvent }>();

		// Connect to each relay
		for (const relayUrl of relays) {
			try {
				const ws = new WebSocket(relayUrl);
				sockets.push(ws);

				ws.onopen = () => {
					console.log(`[Nostr] Connected to ${relayUrl}`);
					
					// Subscribe to kind 0 (profile), 30800 (annotations), 30801 (books)
					const subId = `spectate-${Date.now()}`;
					const req = JSON.stringify([
						'REQ',
						subId,
						{
							kinds: [0, ANNOTATION_EVENT_KIND, BOOK_EVENT_KIND],
							authors: [pubkey],
						}
					]);
					ws.send(req);
				};

				ws.onmessage = (msg) => {
					try {
						const data = JSON.parse(msg.data);
						if (data[0] === 'EVENT') {
							const event = data[2] as SignedNostrEvent;
							
							if (event.kind === 0) {
								// Profile event - parse content
								try {
									const profile = JSON.parse(event.content);
									result.profile = {
										name: profile.name,
										displayName: profile.display_name || profile.displayName,
										picture: profile.picture,
										about: profile.about,
										nip05: profile.nip05,
									};
								} catch (e) {
									console.warn('[Nostr] Failed to parse profile:', e);
								}
							} else {
								// Book or annotation event - dedupe by d-tag
								const dTag = event.tags?.find(t => t[0] === 'd')?.[1];
								const key = dTag ? `${event.kind}:${dTag}` : event.id;
								const existing = events.get(key);
								
								if (!existing || event.created_at > existing.event.created_at) {
									events.set(key, { kind: event.kind, event });
								}
							}
						}
					} catch (e) {
						// Ignore parse errors
					}
				};

				ws.onerror = (e) => {
					console.warn(`[Nostr] WebSocket error for ${relayUrl}:`, e);
				};
			} catch (e) {
				console.warn(`[Nostr] Failed to connect to ${relayUrl}:`, e);
			}
		}

		// Wait for responses
		await new Promise(resolve => setTimeout(resolve, timeoutMs));

		// Close all connections
		for (const ws of sockets) {
			try {
				ws.close();
			} catch (e) {
				// Ignore close errors
			}
		}

		// Process collected events
		for (const [key, { kind, event }] of events) {
			if (kind === BOOK_EVENT_KIND) {
				const book = eventToBook(event);
				if (book) {
					const syncMeta = extractBookSyncMetadata(event);
					result.books.push({
						...book,
						...syncMeta,
					});
				}
			} else if (kind === ANNOTATION_EVENT_KIND) {
				const annotation = eventToAnnotation(event);
				if (annotation) {
					result.annotations.push({
						...annotation,
						ownerPubkey: pubkey,
					});
				}
			}
		}

		console.log(`[Nostr] ✓ Remote user fetch complete!`);
		console.log(`[Nostr]   Profile: ${result.profile?.name || 'not found'}`);
		console.log(`[Nostr]   Books: ${result.books.length}`);
		console.log(`[Nostr]   Annotations: ${result.annotations.length}`);

		result.success = true;
		return result;

	} catch (e) {
		console.error('[Nostr] Failed to fetch remote user data:', e);
		result.error = e instanceof Error ? e.message : 'Unknown error';
		return result;
	}
}
