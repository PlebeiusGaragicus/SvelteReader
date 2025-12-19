import { vi } from 'vitest';

// Mock browser APIs not available in jsdom
const localStorageMock = {
	getItem: vi.fn(),
	setItem: vi.fn(),
	removeItem: vi.fn(),
	clear: vi.fn(),
	length: 0,
	key: vi.fn()
};

Object.defineProperty(globalThis, 'localStorage', {
	value: localStorageMock
});

// Mock crypto.randomUUID
Object.defineProperty(globalThis, 'crypto', {
	value: {
		randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9)
	}
});

// Mock IndexedDB (basic stub)
const indexedDBMock = {
	open: vi.fn(),
	deleteDatabase: vi.fn()
};

Object.defineProperty(globalThis, 'indexedDB', {
	value: indexedDBMock
});
