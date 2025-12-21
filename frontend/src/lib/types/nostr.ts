// Nostr types for annotation sync

import type { Annotation, AnnotationColor, AnnotationLocal } from './index';

// Kind 30078 - Addressable event for annotations
export const ANNOTATION_EVENT_KIND = 30078;

// Content structure for annotation events
export interface AnnotationEventContent {
	text: string;
	note?: string;
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
 * Convert an annotation to a Nostr addressable event (kind 30078)
 * 
 * Event structure:
 * - kind: 30078
 * - d tag: bookSha256:cfiRange (unique identifier)
 * - color tag: highlight color (if present)
 * - content: JSON with text and note
 */
export function annotationToEvent(annotation: Annotation): UnsignedNostrEvent {
	const dTag = `${annotation.bookSha256}:${annotation.cfiRange}`;
	
	const tags: string[][] = [
		['d', dTag]
	];
	
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
