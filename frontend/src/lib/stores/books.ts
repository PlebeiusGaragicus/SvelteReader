import { writable } from 'svelte/store';

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
}

export interface Annotation {
	id: string;
	bookId: string;
	text: string;
	note?: string;
	chapter?: string;
	page: number;
	color: 'yellow' | 'green' | 'blue' | 'pink';
	createdAt: Date;
}

function createBooksStore() {
	const { subscribe, set, update } = writable<Book[]>([
		{
			id: '1',
			title: 'The Great Gatsby',
			author: 'F. Scott Fitzgerald',
			progress: 45,
			totalPages: 180,
			currentPage: 81,
			lastRead: new Date('2024-12-15'),
			annotations: []
		},
		{
			id: '2',
			title: '1984',
			author: 'George Orwell',
			progress: 72,
			totalPages: 328,
			currentPage: 236,
			lastRead: new Date('2024-12-17'),
			annotations: []
		},
		{
			id: '3',
			title: 'Pride and Prejudice',
			author: 'Jane Austen',
			progress: 0,
			totalPages: 279,
			currentPage: 0,
			annotations: []
		}
	]);

	return {
		subscribe,
		addBook: (book: Omit<Book, 'id' | 'annotations'>) => {
			update((books) => [
				...books,
				{ ...book, id: crypto.randomUUID(), annotations: [] }
			]);
		},
		removeBook: (id: string) => {
			update((books) => books.filter((b) => b.id !== id));
		},
		updateProgress: (id: string, currentPage: number) => {
			update((books) =>
				books.map((b) =>
					b.id === id
						? {
								...b,
								currentPage,
								progress: Math.round((currentPage / b.totalPages) * 100),
								lastRead: new Date()
							}
						: b
				)
			);
		},
		addAnnotation: (bookId: string, annotation: Omit<Annotation, 'id' | 'bookId' | 'createdAt'>) => {
			update((books) =>
				books.map((b) =>
					b.id === bookId
						? {
								...b,
								annotations: [
									...b.annotations,
									{
										...annotation,
										id: crypto.randomUUID(),
										bookId,
										createdAt: new Date()
									}
								]
							}
						: b
				)
			);
		},
		removeAnnotation: (bookId: string, annotationId: string) => {
			update((books) =>
				books.map((b) =>
					b.id === bookId
						? {
								...b,
								annotations: b.annotations.filter((a) => a.id !== annotationId)
							}
						: b
				)
			);
		},
		reset: () => set([])
	};
}

export const books = createBooksStore();
