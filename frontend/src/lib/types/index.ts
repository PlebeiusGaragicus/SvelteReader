// Centralized type definitions for the application

// =============================================================================
// BOOK TYPES
// =============================================================================

// Publishable book identity (can be broadcast to Nostr for discovery)
export interface BookIdentity {
	sha256: string;              // SHA-256 of EPUB file (primary identifier)
	title: string;
	author: string;
	isbn?: string;               // ISBN-10 or ISBN-13
	year?: number;               // Publication year
	coverBase64?: string;        // Base64-encoded cover image
}

// Local-only book state (never broadcast)
export interface BookLocal {
	id: string;                  // Local UUID (IndexedDB key for epubs store)
	sha256: string;              // Links to BookIdentity + Annotations
	progress: number;            // 0-100
	currentPage: number;
	totalPages: number;
	currentCfi?: string;
	hasEpubData: boolean;        // false = "ghost book" (annotations only)
	
	// Nostr sync state
	isPublic?: boolean;          // true = sync book & annotations to Nostr
	nostrEventId?: string;       // Book announcement event ID
	nostrCreatedAt?: number;     // Event created_at for LWW
	relays?: string[];           // Relay URLs where published
	syncPending?: boolean;       // Local changes not yet published
}

// Combined book type for runtime use
export interface Book extends BookIdentity, BookLocal {}

// =============================================================================
// ANNOTATION TYPES
// =============================================================================

export type AnnotationColor = 'yellow' | 'green' | 'blue' | 'pink';

// Core annotation (publishable to Nostr)
// Composite key: bookSha256 + ":" + cfiRange
export interface Annotation {
	bookSha256: string;                      // Links to book by content hash
	cfiRange: string;                        // EPUB CFI location
	text: string;                            // Selected text
	highlightColor?: AnnotationColor | null; // null = explicitly no highlight
	note?: string;                           // User's note
	createdAt: number;                       // Unix timestamp (ms)
	
	// Nostr sync state
	nostrEventId?: string;                   // Event ID after publish
	nostrCreatedAt?: number;                 // Event created_at for LWW
	relays?: string[];                       // Relay URLs where published
	isPublic?: boolean;                      // User opted to broadcast
	syncPending?: boolean;                   // Local changes not yet published
}

// Extended annotation with local-only fields (never broadcast)
export interface AnnotationLocal extends Annotation {
	chatThreadIds?: string[];                // AI chat thread references
}

// Runtime display annotation (computed, never stored)
export interface AnnotationDisplay extends AnnotationLocal {
	page: number;                            // Derived from CFI + locations
	chapter?: string;                        // Derived from CFI + TOC
}

// =============================================================================
// ANNOTATION HELPERS
// =============================================================================

// Generate composite key for annotation
export const getAnnotationKey = (bookSha256: string, cfiRange: string): string =>
	`${bookSha256}:${cfiRange}`;

// Parse composite key back to components
export const parseAnnotationKey = (key: string): { bookSha256: string; cfiRange: string } => {
	const colonIndex = key.indexOf(':');
	if (colonIndex === -1) throw new Error('Invalid annotation key');
	return {
		bookSha256: key.slice(0, colonIndex),
		cfiRange: key.slice(colonIndex + 1)
	};
};

// Helper functions to check annotation capabilities
export const annotationHasHighlight = (a: Annotation): boolean => !!a.highlightColor;

export const annotationHasNote = (a: Annotation): boolean => !!a.note;

export const annotationHasChat = (a: AnnotationLocal): boolean => 
	!!a.chatThreadIds && a.chatThreadIds.length > 0;

// Get the highlight color for display (null if no highlight)
export const getAnnotationDisplayColor = (a: Annotation): AnnotationColor | null => 
	a.highlightColor ?? null;

// Check if annotation has any content (used to determine if it should be kept)
export const annotationHasContent = (a: AnnotationLocal): boolean => 
	annotationHasHighlight(a) || annotationHasNote(a) || annotationHasChat(a);

// =============================================================================
// LEGACY COMPATIBILITY (for epubService until migrated)
// =============================================================================

export interface BookMetadata {
	title: string;
	author: string;
	coverUrl?: string;
	totalPages: number;
}

export interface LocationInfo {
	cfi: string;
	percentage: number;
	page: number;
	totalPages: number;
}

export interface TocItem {
	id: string;
	href: string;
	label: string;
	subitems?: TocItem[];
}

// Error types for better error handling
export class AppError extends Error {
	constructor(
		message: string,
		public code: ErrorCode,
		public recoverable: boolean = true
	) {
		super(message);
		this.name = 'AppError';
	}
}

export type ErrorCode =
	| 'STORAGE_READ_FAILED'
	| 'STORAGE_WRITE_FAILED'
	| 'EPUB_PARSE_FAILED'
	| 'EPUB_RENDER_FAILED'
	| 'EPUB_NOT_FOUND'
	| 'BOOK_NOT_FOUND'
	| 'UNKNOWN_ERROR';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
	STORAGE_READ_FAILED: 'Failed to read from storage. Please refresh the page.',
	STORAGE_WRITE_FAILED: 'Failed to save data. Your browser storage may be full.',
	EPUB_PARSE_FAILED: 'Failed to parse EPUB file. The file may be corrupted.',
	EPUB_RENDER_FAILED: 'Failed to display the book. Please try again.',
	EPUB_NOT_FOUND: 'EPUB data not found. Please re-import the book.',
	BOOK_NOT_FOUND: 'Book not found in your library.',
	UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.'
};
