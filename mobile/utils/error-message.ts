export function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error) {
    return error.message
  }

  if (error && typeof error === 'object') {
    const candidate = error as {
      message?: unknown
      details?: unknown
      hint?: unknown
    }

    const parts = [candidate.message, candidate.details, candidate.hint].filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    )

    if (parts.length > 0) {
      return parts.join(' ')
    }
  }

  return fallbackMessage
}
