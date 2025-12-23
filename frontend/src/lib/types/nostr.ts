// Nostr types for annotation and book sync

import type { Annotation, AnnotationColor, AnnotationLocal, BookIdentity } from './index';

// Kind 30800 - Addressable event for annotations (parameterized replaceable)
export const ANNOTATION_EVENT_KIND = 30800;

// Kind 30801 - Addressable event for book announcements
export const BOOK_EVENT_KIND = 30801;

// Content structure for annotation events
export interface AnnotationEventContent {
	text: string;
	note?: string;
	deleted?: boolean;
}

// Content structure for book events (empty or description)
export interface BookEventContent {
	description?: string;
	deleted?: boolean;
}

// Unsigned event structure (before signing)
export interface UnsignedNostrEvent {
	kind: number;
	tags: string[][];
	content: string;
	created_at: number;
}

// Signed event structure (after signing)
export interface SignedNostrEvent extends UnsignedNostrEvent {
	id: string;
	pubkey: string;
	sig: string;
}

// Result from publishing
export interface PublishResult {
	success: boolean;
	eventId?: string;
	relays?: string[];
	error?: string;
}

/**
 * Convert an annotation to a Nostr addressable event (kind 30800)
 * 
 * Event structure:
 * - kind: 30800
 * - d tag: bookSha256:cfiRange (unique identifier)
 * - a tag: reference to book announcement (NIP-01)
 * - color tag: highlight color (if present)
 * - content: JSON with text and note
 */
export function annotationToEvent(
	annotation: Annotation,
	userPubkey?: string,
	relayHint?: string
): UnsignedNostrEvent {
	const dTag = `${annotation.bookSha256}:${annotation.cfiRange}`;
	
	const tags: string[][] = [
		['d', dTag]
	];
	
	// Add reference to book announcement (NIP-01 a-tag)
	if (userPubkey) {
		const aTagValue = `${BOOK_EVENT_KIND}:${userPubkey}:${annotation.bookSha256}`;
		if (relayHint) {
			tags.push(['a', aTagValue, relayHint]);
		} else {
			tags.push(['a', aTagValue]);
		}
	}
	
	if (annotation.highlightColor) {
		tags.push(['color', annotation.highlightColor]);
	}
	
	const content: AnnotationEventContent = {
		text: annotation.text,
	};
	
	if (annotation.note) {
		content.note = annotation.note;
	}
	
	return {
		kind: ANNOTATION_EVENT_KIND,
		tags,
		content: JSON.stringify(content),
		created_at: Math.floor(annotation.createdAt / 1000), // Convert ms to seconds
	};
}

/**
 * Create a deletion (tombstone) event for an annotation
 */
export function annotationDeletionEvent(bookSha256: string, cfiRange: string): UnsignedNostrEvent {
	const dTag = `${bookSha256}:${cfiRange}`;
	
	const content: AnnotationEventContent = {
		text: '',
		deleted: true,
	};
	
	return {
		kind: ANNOTATION_EVENT_KIND,
		tags: [['d', dTag]],
		content: JSON.stringify(content),
		created_at: Math.floor(Date.now() / 1000),
	};
}

/**
 * Parse a Nostr event back into an Annotation
 * Used when fetching annotations from relays (future implementation)
 */
export function eventToAnnotation(event: SignedNostrEvent): Annotation | null {
	try {
		const dTag = event.tags.find(t => t[0] === 'd')?.[1];
		if (!dTag) return null;
		
		const colonIndex = dTag.indexOf(':');
		if (colonIndex === -1) return null;
		
		const bookSha256 = dTag.slice(0, colonIndex);
		const cfiRange = dTag.slice(colonIndex + 1);
		
		const content: AnnotationEventContent = JSON.parse(event.content);
		
		// Check for tombstone
		if (content.deleted) {
			return null;
		}
		
		const colorTag = event.tags.find(t => t[0] === 'color')?.[1] as AnnotationColor | undefined;
		
		return {
			bookSha256,
			cfiRange,
			text: content.text,
			highlightColor: colorTag ?? null,
			note: content.note,
			createdAt: event.created_at * 1000, // Convert seconds to ms
			nostrEventId: event.id,
			nostrCreatedAt: event.created_at,
		};
	} catch (e) {
		console.error('Failed to parse annotation event:', e);
		return null;
	}
}

/**
 * Get default relays from environment
 */
export function getDefaultRelays(): string[] {
	const relaysEnv = import.meta.env.VITE_DEFAULT_RELAYS || 'wss://relay.cypherflow.ai,wss://relay.primal.net';
	return relaysEnv.split(',').map((r: string) => r.trim()).filter(Boolean);
}

// =============================================================================
// BOOK EVENT FUNCTIONS
// =============================================================================

/**
 * Convert a book to a Nostr addressable event (kind 30801)
 * 
 * Event structure:
 * - kind: 30801
 * - d tag: SHA-256 (unique identifier per user)
 * - title, author, isbn, year tags for metadata
 * - image tag: base64 data URL for cover
 * - content: empty or optional description
 */
export function bookToEvent(book: BookIdentity, description?: string): UnsignedNostrEvent {
	const tags: string[][] = [
		['d', book.sha256],
		['title', book.title],
		['author', book.author],
	];
	
	if (book.isbn) {
		tags.push(['isbn', book.isbn]);
	}
	
	if (book.year) {
		tags.push(['year', book.year.toString()]);
	}
	
	if (book.coverBase64) {
		// Store as data URL for embedded image
		const dataUrl = book.coverBase64.startsWith('data:')
			? book.coverBase64
			: `data:image/jpeg;base64,${book.coverBase64}`;
		tags.push(['image', dataUrl]);
	}
	
	// Add relay hints
	const relays = getDefaultRelays();
	for (const relay of relays) {
		tags.push(['r', relay]);
	}
	
	const content: BookEventContent = {};
	if (description) {
		content.description = description;
	}
	
	return {
		kind: BOOK_EVENT_KIND,
		tags,
		content: Object.keys(content).length > 0 ? JSON.stringify(content) : '',
		created_at: Math.floor(Date.now() / 1000),
	};
}

/**
 * Create a deletion (tombstone) event for a book
 */
export function bookDeletionEvent(sha256: string): UnsignedNostrEvent {
	const content: BookEventContent = {
		deleted: true,
	};
	
	return {
		kind: BOOK_EVENT_KIND,
		tags: [['d', sha256]],
		content: JSON.stringify(content),
		created_at: Math.floor(Date.now() / 1000),
	};
}

/**
 * Parse a Nostr event back into BookIdentity
 * Returns null for tombstone events
 */
export function eventToBook(event: SignedNostrEvent): BookIdentity | null {
	try {
		const sha256 = event.tags.find(t => t[0] === 'd')?.[1];
		if (!sha256) return null;
		
		// Check for tombstone
		if (event.content) {
			try {
				const content: BookEventContent = JSON.parse(event.content);
				if (content.deleted) return null;
			} catch {
				// Empty content is fine
			}
		}
		
		const title = event.tags.find(t => t[0] === 'title')?.[1] || 'Unknown Title';
		const author = event.tags.find(t => t[0] === 'author')?.[1] || 'Unknown Author';
		const isbn = event.tags.find(t => t[0] === 'isbn')?.[1];
		const yearStr = event.tags.find(t => t[0] === 'year')?.[1];
		const year = yearStr ? parseInt(yearStr, 10) : undefined;
		const imageDataUrl = event.tags.find(t => t[0] === 'image')?.[1];
		
		// Extract base64 from data URL if present
		let coverBase64: string | undefined;
		if (imageDataUrl) {
			if (imageDataUrl.startsWith('data:')) {
				// Extract base64 portion after the comma
				const commaIndex = imageDataUrl.indexOf(',');
				coverBase64 = commaIndex > 0 ? imageDataUrl.slice(commaIndex + 1) : undefined;
			} else {
				// Already just base64
				coverBase64 = imageDataUrl;
			}
		}
		
		return {
			sha256,
			title,
			author,
			isbn,
			year: year && !isNaN(year) ? year : undefined,
			coverBase64,
		};
	} catch (e) {
		console.error('Failed to parse book event:', e);
		return null;
	}
}

/**
 * Extract Nostr sync metadata from a book event
 */
export function extractBookSyncMetadata(event: SignedNostrEvent): {
	nostrEventId: string;
	nostrCreatedAt: number;
	relays: string[];
} {
	const relays = event.tags
		.filter(t => t[0] === 'r')
		.map(t => t[1])
		.filter(Boolean);
	
	return {
		nostrEventId: event.id,
		nostrCreatedAt: event.created_at,
		relays: relays.length > 0 ? relays : getDefaultRelays(),
	};
}
