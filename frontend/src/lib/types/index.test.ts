import { describe, it, expect } from 'vitest';
import { AppError, ERROR_MESSAGES } from './index';

describe('AppError', () => {
	it('creates an error with message and code', () => {
		const error = new AppError('Test error', 'STORAGE_READ_FAILED');

		expect(error.message).toBe('Test error');
		expect(error.code).toBe('STORAGE_READ_FAILED');
		expect(error.recoverable).toBe(true);
		expect(error.name).toBe('AppError');
	});

	it('can be set as non-recoverable', () => {
		const error = new AppError('Fatal error', 'UNKNOWN_ERROR', false);

		expect(error.recoverable).toBe(false);
	});

	it('is instanceof Error', () => {
		const error = new AppError('Test', 'EPUB_PARSE_FAILED');

		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(AppError);
	});
});

describe('ERROR_MESSAGES', () => {
	it('has messages for all error codes', () => {
		const codes = [
			'STORAGE_READ_FAILED',
			'STORAGE_WRITE_FAILED',
			'EPUB_PARSE_FAILED',
			'EPUB_RENDER_FAILED',
			'EPUB_NOT_FOUND',
			'BOOK_NOT_FOUND',
			'UNKNOWN_ERROR'
		] as const;

		codes.forEach((code) => {
			expect(ERROR_MESSAGES[code]).toBeDefined();
			expect(typeof ERROR_MESSAGES[code]).toBe('string');
		});
	});
});
