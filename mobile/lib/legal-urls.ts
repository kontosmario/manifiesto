/**
 * URLs legales / soporte expuestos en-app.
 *
 * Single source of truth para Privacy, Terms y contacto. Si cambia el
 * dominio o el inbox, se actualiza acá y se propaga a welcome, signup,
 * settings y la Delete Account confirmation sheet.
 *
 * Las URLs apuntan a `manifiesto.app` (dominio del producto). Confirmar
 * que esos paths estén publicados antes de mandar build a App Review —
 * Apple revisa que la URL de Privacy declarada en App Store Connect
 * abra una página válida.
 */

export const PRIVACY_POLICY_URL = 'https://manifiesto.app/privacy'
export const TERMS_OF_SERVICE_URL = 'https://manifiesto.app/terms'

export const SUPPORT_EMAIL = 'soporte@manifiesto.app'

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
  const subject = encodeURIComponent(params.subject ?? 'Soporte Manifiesto')
  const lines = [
    'Contanos qué pasó:',
    '',
    '',
    '— No borrar ↓ —',
    `Versión: ${params.appVersion ?? '?'}${params.buildNumber ? ` (${params.buildNumber})` : ''}`,
    `Plataforma: ${params.platform ?? '?'}`,
  ]
  if (params.userId) lines.push(`Usuario: ${params.userId}`)
  const body = encodeURIComponent(lines.join('\n'))
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`
}
