/**
 * URLs legales / soporte expuestos en-app.
 *
 * Single source of truth para Privacy, Terms y contacto. Si cambia el
 * dominio o el inbox, se actualiza aquí y se propaga a welcome, signup,
 * settings y la Delete Account confirmation sheet.
 *
 * Las URLs apuntan a `manifiestoapp.com` (dominio del producto comprado
 * 2026-06-09 vía Cloudflare Registrar). Confirmar que esos paths estén
 * publicados antes de mandar build a App Review — Apple revisa que la
 * URL de Privacy declarada en App Store Connect abra una página válida.
 */

import i18n from '@/lib/i18n'

export const PRIVACY_POLICY_URL = 'https://manifiestoapp.com/privacy/'
export const TERMS_OF_SERVICE_URL = 'https://manifiestoapp.com/terms/'

export const SUPPORT_EMAIL = 'soporte@manifiestoapp.com'

/** App Store Connect app id (mismo `ascAppId` de eas.json). */
export const APP_STORE_ID = '6776033487'

/** Página del producto en App Store. */
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`

/**
 * Deep link al compositor de reseña de App Store — fallback del prompt
 * nativo (`StoreReview.requestReview`), que iOS racionea (~3/año) y
 * puede no mostrarse. El deep link SIEMPRE abre algo.
 */
export const APP_STORE_REVIEW_URL = `${APP_STORE_URL}?action=write-review`

/**
 * Construye el `mailto:` con subject + body pre-poblados para
 * que el usuario llegue al inbox con contexto mínimo de triage
 * (versión + plataforma). user_id se agrega en el caller cuando
 * se tiene la sesión disponible.
 */
export function buildSupportMailto(params: {
  subject?: string
  appVersion?: string | null
  buildNumber?: string | null
  platform?: string | null
  userId?: string | null
}): string {
  const subject = encodeURIComponent(
    params.subject ?? i18n.t('settings:about.supportMailto.subject'),
  )
  const versionValue = `${params.appVersion ?? '?'}${
    params.buildNumber ? ` (${params.buildNumber})` : ''
  }`
  const lines = [
    i18n.t('settings:about.supportMailto.intro'),
    '',
    '',
    i18n.t('settings:about.supportMailto.doNotDelete'),
    i18n.t('settings:about.supportMailto.version', { value: versionValue }),
    i18n.t('settings:about.supportMailto.platform', { value: params.platform ?? '?' }),
  ]
  if (params.userId) {
    lines.push(i18n.t('settings:about.supportMailto.user', { value: params.userId }))
  }
  const body = encodeURIComponent(lines.join('\n'))
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`
}
