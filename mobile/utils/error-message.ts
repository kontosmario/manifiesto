import i18n from '@/lib/i18n'

/**
 * Mapa server-string → key de i18n (`errors:...`).
 *
 * Los RPC plpgsql del backend hacen `RAISE EXCEPTION '<texto en
 * español>'` y ese `<texto>` llega al cliente verbatim como
 * `error.message`. Antes lo mostrábamos crudo (siempre en español).
 * Acá lo traducimos al idioma activo SIN tocar el SQL (cambiar los
 * textos del RAISE rompería este matching exacto).
 *
 * IMPORTANTE: las CLAVES son el string EXACTO que emite el servidor
 * (incluyendo acentos y la variante "vos"/"podés" del backend). Si una
 * migración futura cambia el texto de un RAISE, hay que actualizar la
 * clave acá o el mensaje cae al fallback (que sigue siendo el texto
 * crudo del server, nunca un crash).
 *
 * Solo se mapean errores USER-FACING (admin de hogar, invitaciones,
 * pagos de fijos, aportes a metas). Los guards técnicos internos
 * (`Invalid event`, `Context too large`, etc.) no se traducen: no
 * llegan al usuario normal.
 */
const SERVER_MESSAGE_TO_KEY: Readonly<Record<string, string>> = Object.freeze({
  // ── Admin de hogar / integrantes ──────────────────────────────────
  'Solo el owner puede bloquear miembros.': 'errors:family.ownerOnlyBlock',
  'Solo el owner puede desbloquear miembros.': 'errors:family.ownerOnlyUnblock',
  'Solo el owner puede eliminar miembros.': 'errors:family.ownerOnlyRemove',
  'Solo el owner puede transferir la propiedad.': 'errors:family.ownerOnlyTransfer',
  'Solo el dueño puede pasar la cuenta a individual.': 'errors:family.ownerOnlyGoIndividual',
  'No podés bloquearte a vos mismo.': 'errors:family.cannotBlockSelf',
  'No podés bloquear a otro owner.': 'errors:family.cannotBlockOwner',
  'No podés eliminarte a vos mismo. Transferí la propiedad primero.':
    'errors:family.cannotRemoveSelf',
  'No podés eliminar a otro owner.': 'errors:family.cannotRemoveOwner',
  'No podés transferirte la propiedad a vos mismo.': 'errors:family.cannotTransferToSelf',
  'No podés transferir la propiedad a un miembro bloqueado.':
    'errors:family.cannotTransferToBlocked',
  'Ese usuario no está en tu familia.': 'errors:family.notInFamily',
  'Target user is not in your family': 'errors:family.notInFamily',
  'No estás en una familia.': 'errors:family.notInAFamily',
  'No sos miembro de esta familia': 'errors:family.notAMember',
  'Not a member of this family': 'errors:family.notAMember',
  'Not a family member': 'errors:family.notAMember',
  // ── Invitaciones ──────────────────────────────────────────────────
  'Family code not found': 'errors:family.codeNotFound',
  'Invite code not found': 'errors:family.inviteNotFound',
  'Invite already used': 'errors:family.inviteAlreadyUsed',
  'Invite expired': 'errors:family.inviteExpired',
  'Invite no longer valid': 'errors:family.inviteInvalid',
  'No podés generar invitaciones mientras tu cuenta tenga una baja agendada. Cancelá la baja primero.':
    'errors:family.inviteWhileDeleting',
  'Tu hogar alcanzó el máximo de miembros de tu plan. Pasá al Anual o reducí el hogar para invitar a alguien más.':
    'errors:family.capReached',
  // ── Pagos de fijos / compromisos ──────────────────────────────────
  'Definí una categoría antes de registrar el pago.': 'errors:payment.needsCategory',
  'Necesitás una sesión activa para registrar pagos.': 'errors:payment.noSessionRecord',
  'Necesitás una sesión activa para revertir pagos.': 'errors:payment.noSessionRevert',
  'No tenés permisos para registrar este pago.': 'errors:payment.noPermissionRecord',
  'No tenés permisos para revertir este pago.': 'errors:payment.noPermissionRevert',
  'El monto del pago debe ser mayor a 0.': 'errors:payment.amountPositive',
  'El monto del pago supera el máximo permitido.': 'errors:payment.amountTooHigh',
  'El fijo asociado al pago ya no existe.': 'errors:payment.fixedExpenseGone',
  'Compromiso no encontrado.': 'errors:payment.commitmentNotFound',
  'Este compromiso ya está al día.': 'errors:payment.commitmentAlreadyPaid',
  'Solo podés registrar pagos sobre compromisos activos.': 'errors:payment.commitmentInactive',
  'Pago no encontrado.': 'errors:payment.notFound',
  'payment-already-recorded': 'errors:payment.alreadyRecorded',
  'payment-already-reverted': 'errors:payment.alreadyReverted',
  // ── Metas de ahorro ───────────────────────────────────────────────
  'Solo el owner puede aportar a la meta': 'errors:savings.ownerOnlyContribute',
  'El aporte debe ser mayor a cero': 'errors:savings.contributionPositive',
  'Meta no encontrada': 'errors:savings.goalNotFound',
  'amount exceeds reserve': 'errors:savings.exceedsReserve',
})

/**
 * Si `message` (el string crudo del server) está en el mapa de keys
 * conocidas, devuelve la traducción al idioma activo. Si no, null
 * (el caller cae al texto crudo o al fallback genérico). El match es
 * por string EXACTO — robusto, sin heurísticas frágiles.
 */
export function localizeServerError(message: string): string | null {
  const key = SERVER_MESSAGE_TO_KEY[message.trim()]
  if (!key) return null
  // El value SIEMPRE existe en errors.json (es+en), así que t() no cae
  // a la key cruda; aún así pasamos defaultValue como red de seguridad.
  return i18n.t(key, { defaultValue: '' }) || null
}

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
  if (!hint) return i18n.t('errors:rateLimit.retryGeneric')

  const match = /retry_after_(\d+)/.exec(hint)
  if (!match) return i18n.t('errors:rateLimit.retryGeneric')

  const seconds = parseInt(match[1]!, 10)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return i18n.t('errors:rateLimit.retryGeneric')
  }

  if (seconds < 60) return i18n.t('errors:rateLimit.retrySeconds', { seconds })
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return i18n.t('errors:rateLimit.retryMinutes', { minutes })
  const hours = Math.ceil(minutes / 60)
  return i18n.t('errors:rateLimit.retryHours', { hours })
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
    // Traducir strings de server conocidos (RAISE EXCEPTION verbatim).
    const localized = localizeServerError(error.message)
    if (localized) return localized
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

    // Traducir strings de server conocidos (RAISE EXCEPTION verbatim)
    // antes de concatenar message/details/hint crudos.
    const localized = message ? localizeServerError(message) : null
    if (localized) return localized

    const parts = [candidate.message, candidate.details, candidate.hint].filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    )

    if (parts.length > 0) {
      return parts.join(' ')
    }
  }

  return fallbackMessage
}
