// Centralized type definitions for the application

export interface Book {
	id: string;
	title: string;
	author: string;
	coverUrl?: string;
	progress: number;
	totalPages: number;
	currentPage: number;
	lastRead?: Date;
	annotations: Annotation[];
	currentCfi?: string;
}

export type AnnotationType = 'highlight' | 'note' | 'ai-chat';

export interface Annotation {
	id: string;
	bookId: string;
	cfiRange: string;
	text: string;
	note?: string;
	chapter?: string;
	page: number;
	color: AnnotationColor;
	type: AnnotationType;
	createdAt: Date;
	chatThreadId?: string; // LangGraph thread ID for AI chat persistence
}

export type AnnotationColor = 'yellow' | 'green' | 'blue' | 'pink';

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
