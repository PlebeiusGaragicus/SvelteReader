import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

// Mock the browser environment check
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock storage service
vi.mock('$lib/services/storageService', () => ({
	removeEpubData: vi.fn()
}));

// Import after mocks are set up
const { books } = await import('./books');

describe('books store', () => {
	beforeEach(() => {
		// Reset store and localStorage before each test
		books.reset();
		vi.mocked(localStorage.getItem).mockReturnValue(null);
		vi.mocked(localStorage.setItem).mockClear();
	});

	describe('addBook', () => {
		it('adds a book with generated id and empty annotations', () => {
			const bookId = books.addBook({
				title: 'Test Book',
				author: 'Test Author',
				progress: 0,
				totalPages: 100,
				currentPage: 0
			});

			expect(bookId).toBeDefined();
			expect(bookId).toContain('test-uuid-');

			const allBooks = get(books);
			expect(allBooks).toHaveLength(1);
			expect(allBooks[0].title).toBe('Test Book');
			expect(allBooks[0].author).toBe('Test Author');
			expect(allBooks[0].annotations).toEqual([]);
		});

		it('saves to localStorage after adding', () => {
			books.addBook({
				title: 'Test Book',
				author: 'Test Author',
				progress: 0,
				totalPages: 100,
				currentPage: 0
			});

			expect(localStorage.setItem).toHaveBeenCalled();
		});
	});

	describe('removeBook', () => {
		it('removes a book by id', () => {
			const bookId = books.addBook({
				title: 'Test Book',
				author: 'Test Author',
				progress: 0,
				totalPages: 100,
				currentPage: 0
			});

			expect(get(books)).toHaveLength(1);

			books.removeBook(bookId);

			expect(get(books)).toHaveLength(0);
		});
	});

	describe('updateProgress', () => {
		it('updates book progress and lastRead date', () => {
			const bookId = books.addBook({
				title: 'Test Book',
				author: 'Test Author',
				progress: 0,
				totalPages: 100,
				currentPage: 0
			});

			books.updateProgress(bookId, 50, 'epubcfi(/test)');

			const allBooks = get(books);
			expect(allBooks[0].currentPage).toBe(50);
			expect(allBooks[0].progress).toBe(50);
			expect(allBooks[0].currentCfi).toBe('epubcfi(/test)');
			expect(allBooks[0].lastRead).toBeInstanceOf(Date);
		});
	});

	describe('addAnnotation', () => {
		it('adds an annotation to a book', () => {
			const bookId = books.addBook({
				title: 'Test Book',
				author: 'Test Author',
				progress: 0,
				totalPages: 100,
				currentPage: 0
			});

			books.addAnnotation(bookId, {
				text: 'Highlighted text',
				page: 10,
				color: 'yellow'
			});

			const allBooks = get(books);
			expect(allBooks[0].annotations).toHaveLength(1);
			expect(allBooks[0].annotations[0].text).toBe('Highlighted text');
			expect(allBooks[0].annotations[0].color).toBe('yellow');
			expect(allBooks[0].annotations[0].createdAt).toBeInstanceOf(Date);
		});
	});

	describe('removeAnnotation', () => {
		it('removes an annotation from a book', () => {
			const bookId = books.addBook({
				title: 'Test Book',
				author: 'Test Author',
				progress: 0,
				totalPages: 100,
				currentPage: 0
			});

			books.addAnnotation(bookId, {
				text: 'Highlighted text',
				page: 10,
				color: 'yellow'
			});

			const annotationId = get(books)[0].annotations[0].id;
			books.removeAnnotation(bookId, annotationId);

			expect(get(books)[0].annotations).toHaveLength(0);
		});
	});

	describe('reset', () => {
		it('clears all books', () => {
			books.addBook({
				title: 'Test Book',
				author: 'Test Author',
				progress: 0,
				totalPages: 100,
				currentPage: 0
			});

			expect(get(books)).toHaveLength(1);

			books.reset();

			expect(get(books)).toHaveLength(0);
		});
	});
});
