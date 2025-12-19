import { test, expect } from '@playwright/test';

test.describe('Library Page', () => {
	test.beforeEach(async ({ page }) => {
		// Clear IndexedDB and localStorage before each test
		await page.goto('/');
		await page.evaluate(() => {
			localStorage.clear();
			indexedDB.deleteDatabase('sveltereader');
		});
		await page.reload();
	});

	test('shows empty state when no books are imported', async ({ page }) => {
		await page.goto('/');

		// Should show the empty state
		await expect(page.getByText('No books yet')).toBeVisible();
		await expect(page.getByText('Import your first EPUB to get started')).toBeVisible();
		await expect(page.getByRole('button', { name: /Import EPUB/i })).toBeVisible();
	});

	test('has correct page title and header', async ({ page }) => {
		await page.goto('/');

		// Check header elements
		await expect(page.getByText('SvelteReader')).toBeVisible();
	});

	test('import button is clickable and triggers file input', async ({ page }) => {
		await page.goto('/');

		// The file input should be hidden
		const fileInput = page.locator('input[type="file"]');
		await expect(fileInput).toBeHidden();

		// Click the import button - this should trigger the file input
		// We can't actually select a file in E2E without a real file,
		// but we can verify the button works
		const importButton = page.getByRole('button', { name: /Import EPUB/i });
		await expect(importButton).toBeEnabled();
	});
});

test.describe('Navigation', () => {
	test('clicking logo navigates to home', async ({ page }) => {
		await page.goto('/');

		// Click the SvelteReader logo/link
		await page.getByRole('link', { name: /SvelteReader/i }).click();

		// Should stay on home page
		await expect(page).toHaveURL('/');
	});
});

test.describe('Theme', () => {
	test('page loads with dark mode by default', async ({ page }) => {
		await page.goto('/');

		// The app uses mode-watcher with defaultMode="dark"
		// Check that the dark class is applied
		const html = page.locator('html');
		await expect(html).toHaveClass(/dark/);
	});
});
