import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SAMPLE_EPUB = join(__dirname, 'fixtures/sample.epub');

test.describe('Book Reader', () => {
	test('shows error when navigating to non-existent book', async ({ page }) => {
		// Navigate to a book that doesn't exist
		await page.goto('/book/non-existent-id');

		// Should show error message
		await expect(page.getByText(/Book not found/i)).toBeVisible();
	});

	test('back to library button works from error state', async ({ page }) => {
		await page.goto('/book/non-existent-id');

		// Click back to library
		await page.getByRole('button', { name: /Back to Library/i }).click();

		// Should be on home page
		await expect(page).toHaveURL('/');
	});
});

test.describe('Book Import and Reading Flow', () => {
	// Run these tests serially since they share browser state
	test.describe.configure({ mode: 'serial' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.evaluate(() => {
			localStorage.clear();
			indexedDB.deleteDatabase('sveltereader');
		});
		await page.reload();
		// Wait for page to be fully loaded
		await page.waitForLoadState('networkidle');
	});

	test('can import an EPUB file', async ({ page }) => {
		// Import a book
		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles(SAMPLE_EPUB);

		// Wait for book card to appear in library (import complete)
		await expect(page.locator('[href^="/book/"]')).toBeVisible({ timeout: 20000 });
	});

	test('can open a book and see reader controls', async ({ page }) => {
		// Import first
		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles(SAMPLE_EPUB);
		await expect(page.locator('[href^="/book/"]')).toBeVisible({ timeout: 20000 });

		// Click on the book card
		await page.locator('[href^="/book/"]').first().click();

		// Should be on the reader page
		await expect(page).toHaveURL(/\/book\/.+/);

		// Reader controls should be visible
		await expect(page.getByRole('button', { name: /Previous page/i })).toBeVisible({ timeout: 10000 });
		await expect(page.getByRole('button', { name: /Next page/i })).toBeVisible();
	});

	test('can navigate pages with buttons', async ({ page }) => {
		// Import and open book
		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles(SAMPLE_EPUB);
		await expect(page.locator('[href^="/book/"]')).toBeVisible({ timeout: 20000 });
		await page.locator('[href^="/book/"]').first().click();
		await expect(page.getByRole('button', { name: /Next page/i })).toBeVisible({ timeout: 10000 });

		// Click next page
		await page.getByRole('button', { name: /Next page/i }).click();
		await page.waitForTimeout(500); // Wait for page turn animation

		// Click previous page
		await page.getByRole('button', { name: /Previous page/i }).click();
		await page.waitForTimeout(500);
	});

	test('can navigate pages with keyboard', async ({ page }) => {
		// Import and open book
		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles(SAMPLE_EPUB);
		await expect(page.locator('[href^="/book/"]')).toBeVisible({ timeout: 20000 });
		await page.locator('[href^="/book/"]').first().click();
		await expect(page.getByRole('button', { name: /Next page/i })).toBeVisible({ timeout: 10000 });

		// Navigate with arrow keys
		await page.keyboard.press('ArrowRight');
		await page.waitForTimeout(500);
		await page.keyboard.press('ArrowLeft');
		await page.waitForTimeout(500);
	});

	test('can open and close table of contents', async ({ page }) => {
		// Import and open book
		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles(SAMPLE_EPUB);
		await expect(page.locator('[href^="/book/"]')).toBeVisible({ timeout: 20000 });
		await page.locator('[href^="/book/"]').first().click();
		await expect(page.getByRole('button', { name: /Table of contents/i })).toBeVisible({ timeout: 10000 });

		// Open TOC
		await page.getByRole('button', { name: /Table of contents/i }).click();
		await expect(page.getByRole('heading', { name: 'Contents' })).toBeVisible();

		// Close with Escape
		await page.keyboard.press('Escape');
		await expect(page.getByRole('heading', { name: 'Contents' })).not.toBeVisible();
	});

	test('can return to library from reader', async ({ page }) => {
		// Import and open book
		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles(SAMPLE_EPUB);
		await expect(page.locator('[href^="/book/"]')).toBeVisible({ timeout: 20000 });
		await page.locator('[href^="/book/"]').first().click();
		await expect(page).toHaveURL(/\/book\/.+/);

		// Click back button
		await page.getByRole('button', { name: /Back to library/i }).click();

		// Should be back on home page
		await expect(page).toHaveURL('/');
	});
});

test.describe('Chapter Progress Bar', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.evaluate(() => {
			localStorage.clear();
			indexedDB.deleteDatabase('sveltereader');
		});
		await page.reload();
		await page.waitForLoadState('networkidle');
	});

	test('progress bar shows percentage and location', async ({ page }) => {
		// Import and open book
		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles(SAMPLE_EPUB);
		await expect(page.locator('[href^="/book/"]')).toBeVisible({ timeout: 20000 });
		await page.locator('[href^="/book/"]').first().click();
		await expect(page.getByRole('button', { name: /Next page/i })).toBeVisible({ timeout: 10000 });

		// Progress bar should show percentage and location info
		await expect(page.getByText(/%/)).toBeVisible();
		await expect(page.getByText(/Location \d+ of \d+/)).toBeVisible();
	});

	test('chapter segments are rendered in DOM after locations ready', async ({ page }) => {
		// Import and open book
		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles(SAMPLE_EPUB);
		await expect(page.locator('[href^="/book/"]')).toBeVisible({ timeout: 20000 });
		await page.locator('[href^="/book/"]').first().click();
		await expect(page.getByRole('button', { name: /Next page/i })).toBeVisible({ timeout: 10000 });

		// Chapter segments should be attached to DOM after locations are ready
		// Segments are buttons with aria-label "Go to [chapter name]"
		const chapterSegment = page.locator('button[aria-label^="Go to"]').first();
		await expect(chapterSegment).toBeAttached({ timeout: 15000 });
		
		// Verify the segment has the expected aria-label format
		const ariaLabel = await chapterSegment.getAttribute('aria-label');
		expect(ariaLabel).toMatch(/^Go to/); // aria-label may contain newlines from chapter name
	});

	test('clicking chapter segment triggers navigation and shows return button', async ({ page }) => {
		// Import and open book
		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles(SAMPLE_EPUB);
		await expect(page.locator('[href^="/book/"]')).toBeVisible({ timeout: 20000 });
		await page.locator('[href^="/book/"]').first().click();
		await expect(page.getByRole('button', { name: /Next page/i })).toBeVisible({ timeout: 10000 });

		// Navigate forward a few pages first so we have somewhere to return to
		await page.getByRole('button', { name: /Next page/i }).click();
		await page.waitForTimeout(500);
		await page.getByRole('button', { name: /Next page/i }).click();
		await page.waitForTimeout(500);

		// Wait for chapter segments to be attached
		const chapterSegments = page.locator('button[aria-label^="Go to"]');
		await expect(chapterSegments.first()).toBeAttached({ timeout: 15000 });

		// Click on a chapter segment using dispatchEvent (bypasses visibility)
		const segmentCount = await chapterSegments.count();
		const targetSegment = segmentCount > 1 ? chapterSegments.nth(1) : chapterSegments.first();
		await targetSegment.dispatchEvent('click');

		// "Return to last page" button should appear
		await expect(page.getByRole('button', { name: /Return to last page/i })).toBeVisible({ timeout: 5000 });
	});

	test('return to last page button works', async ({ page }) => {
		// Import and open book
		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles(SAMPLE_EPUB);
		await expect(page.locator('[href^="/book/"]')).toBeVisible({ timeout: 20000 });
		await page.locator('[href^="/book/"]').first().click();
		await expect(page.getByRole('button', { name: /Next page/i })).toBeVisible({ timeout: 10000 });

		// Navigate forward
		await page.getByRole('button', { name: /Next page/i }).click();
		await page.waitForTimeout(500);
		await page.getByRole('button', { name: /Next page/i }).click();
		await page.waitForTimeout(500);

		// Wait for chapter segments and click one
		const chapterSegments = page.locator('button[aria-label^="Go to"]');
		await expect(chapterSegments.first()).toBeAttached({ timeout: 15000 });
		
		const segmentCount = await chapterSegments.count();
		const targetSegment = segmentCount > 1 ? chapterSegments.nth(1) : chapterSegments.first();
		await targetSegment.dispatchEvent('click');

		// Click return button
		const returnButton = page.getByRole('button', { name: /Return to last page/i });
		await expect(returnButton).toBeVisible({ timeout: 5000 });
		await returnButton.click();

		// Return button should disappear after clicking
		await expect(returnButton).not.toBeVisible({ timeout: 2000 });
	});
});

test.describe('Book Deletion', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.evaluate(() => {
			localStorage.clear();
			indexedDB.deleteDatabase('sveltereader');
		});
		await page.reload();
		await page.waitForLoadState('networkidle');
	});

	test('can delete a book from library', async ({ page }) => {
		// Import a book first
		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles(SAMPLE_EPUB);
		await expect(page.locator('[href^="/book/"]')).toBeVisible({ timeout: 20000 });

		// Book card should be visible
		const bookCard = page.locator('[href^="/book/"]').first();
		await expect(bookCard).toBeVisible();

		// Hover to reveal menu button
		await bookCard.hover();

		// Click the menu button (three dots)
		await page.getByRole('button', { name: /Book options/i }).click();

		// Click delete
		await page.getByRole('button', { name: /Delete/i }).click();

		// Book should be gone, empty state should show
		await expect(page.getByText('No books yet')).toBeVisible();
	});
});
