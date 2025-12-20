import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

// Mock the browser environment check
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock storage service
vi.mock('$lib/services/storageService', () => ({
	removeEpubData: vi.fn(),
	storeBook: vi.fn(),
	getBook: vi.fn(),
	getAllBooks: vi.fn().mockResolvedValue([]),
	deleteBook: vi.fn(),
	getAnnotationsByBook: vi.fn().mockResolvedValue([]),
	deleteAnnotationsByBook: vi.fn(),
	storeAnnotation: vi.fn(),
	getAnnotation: vi.fn(),
	getAllAnnotations: vi.fn().mockResolvedValue([]),
	deleteAnnotation: vi.fn()
}));

// Import after mocks are set up
const { books } = await import('./books');
const { annotations } = await import('./annotations');

describe('books store', () => {
	beforeEach(() => {
		// Reset stores before each test
		books.reset();
		annotations.reset();
	});

	describe('add', () => {
		it('adds a book with generated id', async () => {
			const bookId = await books.add({
				sha256: 'abc123',
				title: 'Test Book',
				author: 'Test Author',
				progress: 0,
				totalPages: 100,
				currentPage: 0,
				hasEpubData: true
			});

			expect(bookId).toBeDefined();
			expect(bookId).toContain('test-uuid-');

			const allBooks = get(books);
			expect(allBooks).toHaveLength(1);
			expect(allBooks[0].title).toBe('Test Book');
			expect(allBooks[0].author).toBe('Test Author');
			expect(allBooks[0].sha256).toBe('abc123');
			expect(allBooks[0].hasEpubData).toBe(true);
		});
	});

	describe('remove', () => {
		it('removes a book by id', async () => {
			const bookId = await books.add({
				sha256: 'abc123',
				title: 'Test Book',
				author: 'Test Author',
				progress: 0,
				totalPages: 100,
				currentPage: 0,
				hasEpubData: true
			});

			expect(get(books)).toHaveLength(1);

			await books.remove(bookId);

			expect(get(books)).toHaveLength(0);
		});
	});

	describe('updateProgress', () => {
		it('updates book progress', async () => {
			const bookId = await books.add({
				sha256: 'abc123',
				title: 'Test Book',
				author: 'Test Author',
				progress: 0,
				totalPages: 100,
				currentPage: 0,
				hasEpubData: true
			});

			await books.updateProgress(bookId, 50, 'epubcfi(/test)');

			const allBooks = get(books);
			expect(allBooks[0].currentPage).toBe(50);
			expect(allBooks[0].progress).toBe(50);
			expect(allBooks[0].currentCfi).toBe('epubcfi(/test)');
		});
	});

	describe('reset', () => {
		it('clears all books', async () => {
			await books.add({
				sha256: 'abc123',
				title: 'Test Book',
				author: 'Test Author',
				progress: 0,
				totalPages: 100,
				currentPage: 0,
				hasEpubData: true
			});

			expect(get(books)).toHaveLength(1);

			books.reset();

			expect(get(books)).toHaveLength(0);
		});
	});
});

describe('annotations store', () => {
	beforeEach(() => {
		annotations.reset();
	});

	describe('upsert', () => {
		it('adds a new annotation', async () => {
			const annotation = await annotations.upsert(
				'book-sha256',
				'epubcfi(/test/range)',
				{
					text: 'Highlighted text',
					highlightColor: 'yellow'
				}
			);

			expect(annotation.bookSha256).toBe('book-sha256');
			expect(annotation.cfiRange).toBe('epubcfi(/test/range)');
			expect(annotation.text).toBe('Highlighted text');
			expect(annotation.highlightColor).toBe('yellow');
			expect(annotation.createdAt).toBeDefined();

			const allAnnotations = get(annotations);
			expect(allAnnotations).toHaveLength(1);
		});

		it('updates an existing annotation', async () => {
			await annotations.upsert(
				'book-sha256',
				'epubcfi(/test/range)',
				{
					text: 'Original text',
					highlightColor: 'yellow'
				}
			);

			await annotations.upsert(
				'book-sha256',
				'epubcfi(/test/range)',
				{
					text: 'Original text',
					highlightColor: 'blue',
					note: 'Added a note'
				}
			);

			const allAnnotations = get(annotations);
			expect(allAnnotations).toHaveLength(1);
			expect(allAnnotations[0].highlightColor).toBe('blue');
			expect(allAnnotations[0].note).toBe('Added a note');
		});
	});

	describe('remove', () => {
		it('removes an annotation', async () => {
			await annotations.upsert(
				'book-sha256',
				'epubcfi(/test/range)',
				{
					text: 'Highlighted text',
					highlightColor: 'yellow'
				}
			);

			expect(get(annotations)).toHaveLength(1);

			await annotations.remove('book-sha256', 'epubcfi(/test/range)');

			expect(get(annotations)).toHaveLength(0);
		});
	});

	describe('chatThreadIds', () => {
		it('adds a chat thread to an annotation', async () => {
			await annotations.upsert(
				'book-sha256',
				'epubcfi(/test/range)',
				{
					text: 'Highlighted text',
					highlightColor: 'yellow'
				}
			);

			await annotations.addChatThread('book-sha256', 'epubcfi(/test/range)', 'thread-1');

			const allAnnotations = get(annotations);
			expect(allAnnotations[0].chatThreadIds).toContain('thread-1');
		});

		it('removes a chat thread from an annotation', async () => {
			await annotations.upsert(
				'book-sha256',
				'epubcfi(/test/range)',
				{
					text: 'Highlighted text',
					highlightColor: 'yellow',
					chatThreadIds: ['thread-1', 'thread-2']
				}
			);

			await annotations.removeChatThread('book-sha256', 'epubcfi(/test/range)', 'thread-1');

			const allAnnotations = get(annotations);
			expect(allAnnotations[0].chatThreadIds).not.toContain('thread-1');
			expect(allAnnotations[0].chatThreadIds).toContain('thread-2');
		});
	});
});
