import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'

/**
 * Smoke tests for the Expo web bundle.
 *
 * Goal: catch runtime crashes and uncaught exceptions across the main
 * routes without any authentication. Routes that require an authenticated
 * session land the user on /login, which is fine — we're checking that
 * the JS boots, the router mounts, and no unhandled errors blow up the
 * page.
 *
 * Follow-up: a separate suite can inject a mocked Supabase session into
 * localStorage to exercise protected routes (Home, Settings, etc).
 */

interface CaptureResult {
  consoleErrors: string[]
  pageErrors: string[]
}

function captureErrors(page: Page): CaptureResult {
  const result: CaptureResult = { consoleErrors: [], pageErrors: [] }
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      result.consoleErrors.push(msg.text())
    }
  })
  page.on('pageerror', (err) => {
    result.pageErrors.push(`${err.name}: ${err.message}`)
  })
  return result
}

// The Expo bundle writes noisy but benign messages. Filter them out so only
// real crashes show up.
const IGNORED_ERROR_PATTERNS: RegExp[] = [
  /Download the React DevTools/i,
  /React Router Future Flag Warning/i,
  /expo-linear-gradient/i, // known web warnings about native-only props
  /Failed to load resource: the server responded with a status of 404.*favicon/i,
  /\[expo-notifications\]/i, // web doesn't support native notifications
  /CanvasKit is not defined/i, // @shopify/react-native-skia web init, pre-existing
  /PictureRecorder/i,
  // 3rd-party lib internals (@gorhom/bottom-sheet, react-native-gesture-handler)
  /props\.pointerEvents is deprecated/i,
]

function filterNoise(messages: string[]): string[] {
  return messages.filter((m) => !IGNORED_ERROR_PATTERNS.some((re) => re.test(m)))
}

test.describe('Expo web smoke', () => {
  test('root route boots without runtime errors', async ({ page }) => {
    const capture = captureErrors(page)
    await page.goto('/', { waitUntil: 'load' })
    // The app may redirect to /login, /(auth)/login or render a splash.
    // Wait for any root content to mount.
    await page.waitForLoadState('networkidle', { timeout: 20_000 })

    const pageErrors = filterNoise(capture.pageErrors)
    const consoleErrors = filterNoise(capture.consoleErrors)

    expect(pageErrors, `Uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([])
    expect(consoleErrors, `Console errors:\n${consoleErrors.join('\n')}`).toEqual([])
  })

  test('login route renders', async ({ page }) => {
    const capture = captureErrors(page)
    await page.goto('/login', { waitUntil: 'networkidle' })

    // The auth intro shows a branded splash ("Manifiesto"); the form
    // mounts after the entrance animation. For the smoke test we only
    // verify the brand copy is present — it proves the auth layout
    // booted without a crash.
    await expect(page.getByText('Manifiesto').first()).toBeVisible({ timeout: 15_000 })

    const pageErrors = filterNoise(capture.pageErrors)
    expect(pageErrors, `Uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([])
  })

  test('home route mounts (redirects to login if unauthenticated)', async ({ page }) => {
    const capture = captureErrors(page)
    await page.goto('/home', { waitUntil: 'networkidle' })

    // Either the home screen rendered (authenticated session persisted in
    // localStorage) or we were redirected to /login. Both mean the bundle
    // booted successfully.
    const url = page.url()
    expect(url).toMatch(/\/home|\/login|\/\(auth\)\/login/)

    const pageErrors = filterNoise(capture.pageErrors)
    expect(pageErrors, `Uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([])
  })
})
