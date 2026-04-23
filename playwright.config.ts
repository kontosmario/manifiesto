import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for Expo web smoke / regression tests.
 *
 * The Expo dev server is slow to boot the first time (cold Metro bundle). We
 * give it up to 3 minutes via `webServer.timeout`. After the first boot the
 * cache makes subsequent runs fast.
 *
 * Tests run serially by default — Expo's web bundle is single-process and
 * parallelising just fights for the port.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8081',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 430, height: 932 },
  },
  projects: [
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 430, height: 932 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npm run web -- --port 8081',
    url: 'http://localhost:8081',
    timeout: 180_000,
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'pipe',
    env: { CI: '1' },
  },
})
