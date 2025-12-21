// Nostr service for publishing annotations to relays

import type { Annotation, AnnotationLocal } from '$lib/types';
import {
	annotationToEvent,
	annotationDeletionEvent,
	eventToAnnotation,
	getDefaultRelays,
	ANNOTATION_EVENT_KIND,
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
 * Publish an annotation to Nostr relays as a kind 30078 addressable event
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
		const event = annotationToEvent(annotation);
		console.log('[Nostr] Event prepared:', { kind: event.kind, tags: event.tags });
		
		const result = await cyphertap.publishEvent({
			kind: event.kind,
			tags: event.tags,
			content: event.content,
			created_at: event.created_at,
		});

		const relays = getDefaultRelays();

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
