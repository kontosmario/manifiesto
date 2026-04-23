import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'

/**
 * Authenticated smoke test for the V1 Cuaderno Gastos redesign —
 * logs in, navigates to the Gastos tab, waits for the hero to render,
 * and captures a full-page screenshot.
 */

const TEST_EMAIL = 'kontosmario@gmail.com'
const TEST_PASSWORD = 'marito78'

interface CaptureResult {
  consoleErrors: string[]
  pageErrors: string[]
}

function captureErrors(page: Page): CaptureResult {
  const result: CaptureResult = { consoleErrors: [], pageErrors: [] }
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') result.consoleErrors.push(msg.text())
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
  /props\.pointerEvents is deprecated/i,
  /Failed to load resource.*status of (400|404)/i,
]

function filterNoise(messages: string[]): string[] {
  return messages.filter((m) => !IGNORED_ERROR_PATTERNS.some((re) => re.test(m)))
}

test.describe('Authenticated Gastos', () => {
  test('login → gastos V1 Cuaderno renders without crash', async ({ page }) => {
    const capture = captureErrors(page)

    await page.goto('/login', { waitUntil: 'networkidle' })
    const emailField = page.locator('input[type="email"]').first()
    await emailField.waitFor({ state: 'visible', timeout: 20_000 })
    await emailField.fill(TEST_EMAIL)
    await page.locator('input[type="password"]').first().fill(TEST_PASSWORD)
    await page.getByRole('button', { name: /^Entrar$/ }).first().click()

    // Wait for home to settle then navigate to Gastos via the tab.
    await page.waitForURL(/(\/home|\/\(app\)|\/$)/, { timeout: 30_000 }).catch(() => {})
    await expect(page.getByText('DISPONIBLE HOY')).toBeVisible({ timeout: 30_000 })
    await page.goto('/expenses', { waitUntil: 'networkidle' })

    // The Gastos screen has a unique "TOTAL VISIBLE" eyebrow on the hero.
    await expect(page.getByText('TOTAL VISIBLE')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('FILTRAR POR CATEGORÍA')).toBeVisible({ timeout: 10_000 })

    const pageErrors = filterNoise(capture.pageErrors)
    const consoleErrors = filterNoise(capture.consoleErrors)
    expect(pageErrors, `Uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([])
    expect(
      consoleErrors,
      `Console errors:\n${consoleErrors.join('\n')}`,
    ).toEqual([])

    await page.waitForTimeout(2500)
    await page.screenshot({
      path: 'test-results/gastos-v1-cuaderno-rendered.png',
      fullPage: true,
    })
  })
})
