import { describe, it, expect, beforeEach, vi } from 'vitest';

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
	getBooksWithEpubData: vi.fn().mockResolvedValue([]),
	getBookBySha256ForOwner: vi.fn().mockResolvedValue(null),
	deleteBook: vi.fn(),
	getAnnotationsByBook: vi.fn().mockResolvedValue([]),
	deleteAnnotationsByBook: vi.fn(),
	storeAnnotation: vi.fn(),
	getAnnotation: vi.fn(),
	getAllAnnotations: vi.fn().mockResolvedValue([]),
	deleteAnnotation: vi.fn(),
	getBookBySha256: vi.fn().mockResolvedValue(null)
}));

// Mock nostr service
vi.mock('$lib/services/nostrService', () => ({
	publishBook: vi.fn().mockResolvedValue({ success: true }),
	publishBookDeletion: vi.fn().mockResolvedValue({ success: true }),
	publishAnnotation: vi.fn().mockResolvedValue({ success: true }),
	publishAnnotationDeletion: vi.fn().mockResolvedValue({ success: true })
}));

// Mock nostr types
vi.mock('$lib/types/nostr', () => ({
	getDefaultRelays: vi.fn().mockReturnValue(['wss://relay.example.com'])
}));

// Import after mocks are set up
const { books } = await import('./books.svelte');
const { annotations } = await import('./annotations.svelte');

describe('books store', () => {
	beforeEach(async () => {
		// Reset stores before each test
		books.reset();
		annotations.reset();
		// Initialize with a test owner pubkey
		await books.initialize('test-owner-pubkey');
		await annotations.initialize('test-owner-pubkey');
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

			const allBooks = books.items;
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

			expect(books.items).toHaveLength(1);

			await books.remove(bookId);

			expect(books.items).toHaveLength(0);
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

			const allBooks = books.items;
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

			expect(books.items).toHaveLength(1);

			books.reset();

			expect(books.items).toHaveLength(0);
		});
	});
});

describe('annotations store', () => {
	beforeEach(async () => {
		annotations.reset();
		// Initialize with a test owner pubkey
		await annotations.initialize('test-owner-pubkey');
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

			const allAnnotations = annotations.items;
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

			const allAnnotations = annotations.items;
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

			expect(annotations.items).toHaveLength(1);

			await annotations.remove('book-sha256', 'epubcfi(/test/range)');

			expect(annotations.items).toHaveLength(0);
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

			const allAnnotations = annotations.items;
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

			const allAnnotations = annotations.items;
			expect(allAnnotations[0].chatThreadIds).not.toContain('thread-1');
			expect(allAnnotations[0].chatThreadIds).toContain('thread-2');
		});
	});
});
