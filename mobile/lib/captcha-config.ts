// hCaptcha configuration. Sprint B · B3.
//
// El owner debe (a) crear un site en hCaptcha (https://dashboard.hcaptcha.com),
// (b) cargar la site key en EAS secrets como `EXPO_PUBLIC_HCAPTCHA_SITE_KEY`,
// y (c) habilitar el captcha del lado de Supabase:
//   Auth → Settings → Bot and Abuse Protection → Enable hCaptcha →
//   pegar la SECRET key correspondiente.
//
// Mientras la key no esté cargada (env vacío), los flows de
// `signUpWithCaptcha` / `resetWithCaptcha` SKIPEAN el widget — es lo
// que queremos en dev. En __DEV__ + sin key emitimos un warning visible
// en console para que nadie haga merge a producción pensando que está
// protegido cuando no lo está.
//
// Sprint G · G-Auth2: prod kill-switch. Antes el `__DEV__` warning era
// el ÚNICO signal de que la key faltaba, y en builds de producción
// (donde __DEV__=false) la app shippeaba silenciosamente sin captcha.
// Ahora emitimos un `console.error` de severidad alta en cualquier build
// non-dev sin site key, y exponemos `getCaptchaBootError()` para que el
// root layout muestre un banner si quiere. NO tiramos un throw para no
// romper builds de preview (que también corren con __DEV__=false), pero
// el error queda visible en Crashlytics/Sentry futuro y, más
// importante, en `getCaptchaBootError()` para que el shell pueda
// reaccionar.

export const HCAPTCHA_SITE_KEY: string =
  process.env.EXPO_PUBLIC_HCAPTCHA_SITE_KEY ?? ''

// Base URL del widget. hCaptcha hostea el dispatch en su CDN; este es
// el endpoint estándar usado por `@hcaptcha/react-native-hcaptcha`.
export const HCAPTCHA_BASE_URL = 'https://hcaptcha.com'

/** Devuelve true si hay site key configurada (siempre debería ser true
 *  en producción una vez que el owner cargue la secret en EAS). */
export function isCaptchaConfigured(): boolean {
  return HCAPTCHA_SITE_KEY.length > 0
}

let cachedBootError: string | null = null

/**
 * Sprint G · G-Auth2. Returns a non-null message when this build is a
 * non-dev binary (App Store / TestFlight / EAS production) but the
 * captcha site key is empty. Root layout / boot code can call this to
 * decide whether to surface an in-app warning banner. Memoised because
 * the value is fixed at module-load time (env vars are immutable).
 */
export function getCaptchaBootError(): string | null {
  return cachedBootError
}

// Module-load assertion. We DO NOT throw — a hard crash on boot would
// brick preview / staging builds where the owner intentionally tests
// without captcha. A high-severity log is loud enough to flag in any
// crash reporter and survives prod minification (console.error is kept
// in RN release bundles).
if (!__DEV__ && HCAPTCHA_SITE_KEY.length === 0) {
  cachedBootError =
    'EXPO_PUBLIC_HCAPTCHA_SITE_KEY is empty in a non-dev build. ' +
    'Sign-up / password-reset will ship without bot protection. ' +
    'Load the site key into EAS secrets before submitting to App Store.'
  console.error('[captcha-config] ' + cachedBootError)
}
