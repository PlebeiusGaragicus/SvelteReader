# Testing

This project uses **Vitest** for unit tests and **Playwright** for end-to-end (E2E) tests.

## Test Types

| Type | Tool | Purpose | Speed |
|------|------|---------|-------|
| Unit | Vitest | Test isolated functions, stores, utilities | Fast (ms) |
| E2E | Playwright | Test full user flows in real browser | Slow (seconds) |

## Running Tests

From the `frontend/` directory:

```bash
# Run unit tests
npm test

# Run unit tests in watch mode
npm run test:watch

# Run E2E tests
npm run test:e2e

# Run E2E with interactive UI
npm run test:e2e:ui

# Run E2E with visible browser
npm run test:e2e:headed

# Run ALL tests (unit + E2E)
npm run test:all
```

### Useful Commands

```bash
# Run specific unit test file
npx vitest run src/lib/stores/books.test.ts

# Run specific E2E test file
npx playwright test e2e/library.test.ts

# Run tests matching a pattern
npx vitest run -t "addBook"
npx playwright test -g "empty state"

# View E2E test report
npx playwright show-report
```

## Writing Unit Tests

Unit tests live alongside source files: `src/lib/**/*.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('myFunction', () => {
  it('should do something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });
});
```

### Mocking

```typescript
// Mock a module
vi.mock('$app/environment', () => ({ browser: true }));

// Mock a function
const mockFn = vi.fn();
mockFn.mockReturnValue('mocked');
```

## Writing E2E Tests

E2E tests live in `frontend/e2e/`. Each file should end with `.test.ts`.

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    // Navigate
    await page.goto('/');

    // Find elements
    const button = page.getByRole('button', { name: /Import/i });

    // Assert
    await expect(button).toBeVisible();

    // Interact
    await button.click();

    // Assert result
    await expect(page).toHaveURL('/some-path');
  });
});
```

### Common Patterns

**Find elements:**
```typescript
page.getByRole('button', { name: /Submit/i })  // By role + text
page.getByText('Hello')                         // By text content
page.locator('.my-class')                       // By CSS selector
page.locator('[data-testid="foo"]')            // By test ID
```

**Wait for things:**
```typescript
await expect(element).toBeVisible();
await expect(element).toBeVisible({ timeout: 10000 });
await page.waitForURL('/dashboard');
```

**Clear state before tests:**
```typescript
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    indexedDB.deleteDatabase('sveltereader');
  });
});
```

## Test Files

### Unit Tests (`src/lib/`)

| File | Tests |
|------|-------|
| `stores/books.test.ts` | Add/remove books, progress, annotations |
| `types/index.test.ts` | AppError class, error messages |

### E2E Tests (`e2e/`)

| File | Tests |
|------|-------|
| `library.test.ts` | Empty state, import button, theme |
| `reader.test.ts` | Import, open, navigate, TOC, delete |

## Tips

- Use `test:watch` for unit tests during development
- Use `test:e2e:ui` for E2E—visual debugging is helpful
- Add `.only` to run a single test while debugging
- E2E screenshots saved on failure in `test-results/`
- Keep tests independent—don't rely on order
- E2E import tests run with `--workers=1` to avoid conflicts
