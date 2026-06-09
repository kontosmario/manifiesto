/**
 * Detector de errores de Supabase Auth que indican que el usuario
 * intentó loguearse con un email cuya confirmación todavía está
 * pendiente.
 *
 * Supabase tira variantes según versión:
 *   · `error.code === 'email_not_confirmed'`
 *   · `error.status === 400` + `error.message` con "Email not confirmed"
 *
 * Mantenemos un fallback por substring porque algunas builds antiguas
 * sólo expongan el mensaje en texto plano.
 */

interface MaybeAuthError {
  code?: unknown
  status?: unknown
  message?: unknown
}

export function isEmailNotConfirmedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as MaybeAuthError
  if (typeof e.code === 'string' && e.code === 'email_not_confirmed') {
    return true
  }
  if (typeof e.message === 'string') {
    const msg = e.message.toLowerCase()
    if (msg.includes('email not confirmed')) return true
    if (msg.includes('email link is invalid')) return false
  }
  return false
}
