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
