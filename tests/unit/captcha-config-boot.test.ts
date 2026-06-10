import { describe, expect, it } from 'vitest'

// Sprint G · G-Auth2 — captcha boot kill-switch.
//
// The module is evaluated once at import time and decides whether to
// surface a boot error based on `__DEV__` + presence of
// `EXPO_PUBLIC_HCAPTCHA_SITE_KEY`. The vitest config defines
// `__DEV__ = true`, so under this harness `getCaptchaBootError()`
// MUST return null (we don't want dev runs to surface the warning).
// The real prod assertion is hand-verified at module load time when
// the EAS build minifies __DEV__ to false.

describe('captcha-config — Sprint G · G-Auth2', () => {
  it('getCaptchaBootError() is null in __DEV__ regardless of site key presence', async () => {
    const { getCaptchaBootError } = await import('@/lib/captcha-config')
    expect(getCaptchaBootError()).toBeNull()
  })

  it('isCaptchaConfigured matches the HCAPTCHA_SITE_KEY truthiness', async () => {
    const { isCaptchaConfigured, HCAPTCHA_SITE_KEY } = await import(
      '@/lib/captcha-config'
    )
    expect(isCaptchaConfigured()).toBe(HCAPTCHA_SITE_KEY.length > 0)
  })
})
