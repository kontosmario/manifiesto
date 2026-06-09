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
  if (!hint) return 'Esperá un rato antes de volver a intentar.'

  const match = /retry_after_(\d+)/.exec(hint)
  if (!match) return 'Esperá un rato antes de volver a intentar.'

  const seconds = parseInt(match[1]!, 10)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 'Esperá un rato antes de volver a intentar.'
  }

  if (seconds < 60) return `Probá de nuevo en ${seconds} segundos.`
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `Probá de nuevo en ${minutes} min.`
  const hours = Math.ceil(minutes / 60)
  return `Probá de nuevo en ${hours}h.`
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
