import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	// Directory containing test files
	testDir: './e2e',

	// Run tests in parallel
	fullyParallel: true,

	// Fail the build on CI if you accidentally left test.only in the source code
	forbidOnly: !!process.env.CI,

	// Retry on CI only
	retries: process.env.CI ? 2 : 0,

	// Opt out of parallel tests on CI
	workers: process.env.CI ? 1 : undefined,

	// Reporter to use
	reporter: [
		['html', { open: 'never' }],
		['list']
	],

	// Shared settings for all projects
	use: {
		// Base URL to use in actions like `await page.goto('/')`
		baseURL: 'http://localhost:5173',

		// Collect trace when retrying the failed test
		trace: 'on-first-retry',

		// Capture screenshot on failure
		screenshot: 'only-on-failure',

		// Record video on failure
		video: 'on-first-retry'
	},

	// Configure projects for major browsers
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
		// Uncomment to add more browsers:
		// {
		// 	name: 'firefox',
		// 	use: { ...devices['Desktop Firefox'] }
		// },
		// {
		// 	name: 'webkit',
		// 	use: { ...devices['Desktop Safari'] }
		// },
		// {
		// 	name: 'Mobile Chrome',
		// 	use: { ...devices['Pixel 5'] }
		// }
	],

	// Run your local dev server before starting the tests
	webServer: {
		command: 'npm run dev',
		url: 'http://localhost:5173',
		reuseExistingServer: !process.env.CI,
		timeout: 120 * 1000
	}
});
