/**
 * Parsea el `hint` que genera `check_rate_limit` (`retry_after_<seconds>`)
 * y lo convierte a copy humano. Si no matchea el shape esperado, devuelve
 * null. CR Sprint B #4.
 */
function parseRateLimitMessage(
  message: string,
  hint: string | undefined,
): string | null {
  if (!message.includes('rate_limit_exceeded')) return null
  if (!hint) return 'Espera un rato antes de volver a intentar.'

  const match = /retry_after_(\d+)/.exec(hint)
  if (!match) return 'Espera un rato antes de volver a intentar.'

  const seconds = parseInt(match[1]!, 10)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 'Espera un rato antes de volver a intentar.'
  }

  if (seconds < 60) return `Prueba de nuevo en ${seconds} segundos.`
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `Prueba de nuevo en ${minutes} min.`
  const hours = Math.ceil(minutes / 60)
  return `Prueba de nuevo en ${hours}h.`
}

/**
 * Returns true if `error` looks like a `check_rate_limit` RAISE
 * (errcode `P0001` + message containing `rate_limit_exceeded`). Sprint
 * L · Audit #5 L-Med2 — surfaces let callers branch their copy when a
 * generic "try again" is the wrong message (e.g. "your deletion is
 * still scheduled, this is OK"). Stays loose on shape because Supabase
 * surfaces RPC errors with several field combos.
 */
export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    if (error instanceof Error) {
      return error.message.includes('rate_limit_exceeded')
    }
    return false
  }

  const candidate = error as {
    code?: unknown
    message?: unknown
    details?: unknown
    hint?: unknown
  }

  const code = typeof candidate.code === 'string' ? candidate.code : ''
  const message = typeof candidate.message === 'string' ? candidate.message : ''
  const details = typeof candidate.details === 'string' ? candidate.details : ''
  const hint = typeof candidate.hint === 'string' ? candidate.hint : ''

  if (code === 'P0001' && (message.includes('rate_limit_exceeded') || hint.startsWith('retry_after_'))) {
    return true
  }

  return (
    message.includes('rate_limit_exceeded') ||
    details.includes('rate_limit_exceeded') ||
    hint.startsWith('retry_after_')
  )
}

export function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error) {
    // Si el mensaje viene de un RPC con rate_limit_exceeded sin `hint`
    // (Error es plain), igual mostramos copy amistoso.
    const friendly = parseRateLimitMessage(error.message, undefined)
    if (friendly) return friendly
    return error.message
  }

  if (error && typeof error === 'object') {
    const candidate = error as {
      message?: unknown
      details?: unknown
      hint?: unknown
    }

    const message = typeof candidate.message === 'string' ? candidate.message : ''
    const hint = typeof candidate.hint === 'string' ? candidate.hint : undefined

    // CR Sprint B #4: parsear rate_limit_exceeded + retry_after hint antes
    // de fallar al concat genérico de message/details/hint.
    const friendly = parseRateLimitMessage(message, hint)
    if (friendly) return friendly

    const parts = [candidate.message, candidate.details, candidate.hint].filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    )

    if (parts.length > 0) {
      return parts.join(' ')
    }
  }

  return fallbackMessage
}
