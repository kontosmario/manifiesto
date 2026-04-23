import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'

/**
 * Authenticated smoke test — logs in with the project's test account,
 * waits for the Home V1 Cuaderno redesign to render, and asserts zero
 * runtime crashes.
 *
 * The credentials are hard-coded for now because the user asked for
 * this specific flow. For CI this would move to env vars.
 */

const TEST_EMAIL = 'kontosmario@gmail.com'
const TEST_PASSWORD = 'marito78'

interface CaptureResult {
  consoleErrors: string[]
  pageErrors: string[]
  bannedWarnings: string[]
}

/**
 * Warnings we refuse to regress on — these come from code we control,
 * so we guard against them reappearing. If a future change reintroduces
 * the deprecated API, this test fails loudly.
 *
 * Note: we do NOT ban `props.pointerEvents` here because that warning
 * still fires from @gorhom/bottom-sheet and react-native-gesture-handler
 * internals (tracked upstream, not our code). It's filtered as ignored
 * noise instead.
 */
const BANNED_WARNING_PATTERNS: RegExp[] = [
  /"shadow\*?" style props? (?:are|is) deprecated/i,
  /"textShadow\*?" style props? (?:are|is) deprecated/i,
  /Image: style\.resizeMode is deprecated/i,
  /useNativeDriver` is not supported/i,
  /CanvasKit is not defined/i,
  /PictureRecorder/i,
]

function captureErrors(page: Page): CaptureResult {
  const result: CaptureResult = { consoleErrors: [], pageErrors: [], bannedWarnings: [] }
  page.on('console', (msg: ConsoleMessage) => {
    const text = msg.text()
    if (msg.type() === 'error') {
      result.consoleErrors.push(text)
    }
    if (BANNED_WARNING_PATTERNS.some((re) => re.test(text))) {
      result.bannedWarnings.push(text)
    }
  })
  page.on('pageerror', (err) => {
    result.pageErrors.push(`${err.name}: ${err.message}`)
  })
  return result
}

const IGNORED_ERROR_PATTERNS: RegExp[] = [
  /Download the React DevTools/i,
  /React Router Future Flag Warning/i,
  /expo-linear-gradient/i,
  /Failed to load resource: the server responded with a status of 404.*favicon/i,
  /\[expo-notifications\]/i,
  // Library noise we can't control: @gorhom/bottom-sheet and
  // react-native-gesture-handler still pass pointerEvents as a prop
  // internally. Will clear when those libraries update.
  /props\.pointerEvents is deprecated/i,
]

function filterNoise(messages: string[]): string[] {
  return messages.filter((m) => !IGNORED_ERROR_PATTERNS.some((re) => re.test(m)))
}

test.describe('Authenticated home', () => {
  test('login → home V1 Cuaderno renders without runtime crash', async ({ page }) => {
    const capture = captureErrors(page)

    // 1. Start from the login page.
    await page.goto('/login', { waitUntil: 'networkidle' })

    // 2. Wait for the email field to mount (the intro splash animates in first).
    const emailField = page.locator('input[type="email"]').first()
    await emailField.waitFor({ state: 'visible', timeout: 20_000 })

    // 3. Fill credentials and submit.
    await emailField.fill(TEST_EMAIL)
    const passwordField = page.locator('input[type="password"]').first()
    await passwordField.fill(TEST_PASSWORD)

    // The submit button label comes from auth-flow.ts buttonLabel: 'Entrar'.
    const submit = page.getByRole('button', { name: /^Entrar$/ }).first()
    await submit.click()

    // 4. Wait for navigation to land on the app shell. Expo-router can route
    // to /home, /(tabs)/home, or just /. The reliable signal is any of the
    // Home-specific pieces of copy rendering.
    await page.waitForURL(/(\/home|\/\(app\)|\/$)/, { timeout: 30_000 }).catch(() => {})

    // 5. The new Home V1 Cuaderno shows "DISPONIBLE HOY" in the hero.
    // That string is unique to the home redesign, so seeing it proves the
    // new layout mounted end-to-end.
    await expect(page.getByText('DISPONIBLE HOY')).toBeVisible({ timeout: 30_000 })

    // 6. Other redesign markers (at least one must be present).
    const heroAccentVisible = await page
      .getByText(/Margen del mes/i)
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false)
    expect(heroAccentVisible, 'Hero margen line should render').toBe(true)

    // 7. Final crash assertion.
    const pageErrors = filterNoise(capture.pageErrors)
    const consoleErrors = filterNoise(capture.consoleErrors)
    expect(pageErrors, `Uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([])
    expect(
      consoleErrors,
      `Console errors:\n${consoleErrors.join('\n')}`,
    ).toEqual([])
    // Regression guard — none of these deprecation warnings may come back.
    expect(
      capture.bannedWarnings,
      `Banned RN-Web deprecation warnings:\n${capture.bannedWarnings.join('\n')}`,
    ).toEqual([])

    // 8. Save a screenshot for the user to inspect the rendered Home.
    await page.screenshot({
      path: 'test-results/home-v1-cuaderno-rendered.png',
      fullPage: true,
    })
  })
})
