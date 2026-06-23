import {
  REASK_DAYS,
  REASK_DAYS_AFTER_HIGH,
  SOFT_FLAG_STREAK,
  HARD_FLAG_STREAK,
  USAGE_SCORE,
  NEGATIVE_SCORE_THRESHOLD,
} from './usage-checkin.constants'
import type { UsageLevel } from './types'

const DAY_MS = 86_400_000

/**
 * Una entrada del payload server-side `subscription_checkins` (home_snapshot),
 * mapeada a camelCase. Derivada SIN ventana de ciclo (invariantes 2/3 del spec):
 * el trigger se ancla a `lastPaymentAt` (ledger durable) vs `lastAuditAt`, nunca
 * al expense del pago (que se archiva/purga).
 */
export interface SubscriptionCheckin {
  fixedExpenseId: string
  name: string
  amount: number
  /** MAX(fixed_expense_payments.paid_at) — sin filtro de ciclo. */
  lastPaymentAt: string | null
  /** MAX(fixed_expense_usage_audit.created_at) del usuario. */
  lastAuditAt: string | null
  /** Últimos ~3 levels por created_at DESC (más reciente primero). */
  recentLevels: UsageLevel[]
  /** Hay un fixed_expense_action_intent 'cancel' abierto. */
  hasOpenCancelIntent: boolean
}

export interface UsageScore {
  shouldAsk: boolean
  /** 'pay' = check-in post-pago; 'reask' = re-pregunta por timer. */
  prompt: 'pay' | 'reask'
  flag: 'none' | 'soft' | 'hard'
  /** Respuestas negativas (score>=0.5) consecutivas desde la más reciente. */
  negativeStreak: number
}

function scoreOf(level: UsageLevel): number {
  // Robusto a filas legacy 'YYYY-MM' / niveles desconocidos (invariante 8):
  // un level fuera del mapa cae a 0 (no cuenta como negativo).
  return (USAGE_SCORE as Record<string, number>)[level] ?? 0
}

/**
 * Decide si toca preguntar por el uso de una sub y con qué tono. Pura y
 * wall-clock (invariante 4): el re-ask por timer NO depende de payments, así
 * que es robusto a un cierre de ciclo intermedio.
 */
export function scoreSubscriptionUsage(
  checkin: SubscriptionCheckin,
  now: Date,
): UsageScore {
  const nowMs = now.getTime()
  const lastAuditMs = checkin.lastAuditAt ? Date.parse(checkin.lastAuditAt) : NaN
  const lastPayMs = checkin.lastPaymentAt ? Date.parse(checkin.lastPaymentAt) : NaN

  // Racha negativa consecutiva desde la respuesta más reciente.
  let negativeStreak = 0
  let casiNuncaStreak = 0
  for (const level of checkin.recentLevels) {
    if (scoreOf(level) >= NEGATIVE_SCORE_THRESHOLD) {
      negativeStreak++
      casiNuncaStreak = level === 'casi_nunca' ? casiNuncaStreak + 1 : 0
    } else {
      break // 'mucho' (o legacy score 0) corta la racha
    }
  }

  const lastWasMucho = checkin.recentLevels[0] === 'mucho'
  const reaskDays = lastWasMucho ? REASK_DAYS_AFTER_HIGH : REASK_DAYS

  let flag: UsageScore['flag'] = 'none'
  if (negativeStreak >= HARD_FLAG_STREAK || casiNuncaStreak >= 2) flag = 'hard'
  else if (negativeStreak >= SOFT_FLAG_STREAK) flag = 'soft'

  // Condición 1: ask-al-pagar (pago sin responder).
  const paidUnanswered =
    !Number.isNaN(lastPayMs) &&
    (Number.isNaN(lastAuditMs) || lastPayMs > lastAuditMs)

  // Condición 2: re-ask por timer (independiente de payments → cross-ciclo safe).
  const reaskDue =
    !Number.isNaN(lastAuditMs) && nowMs - lastAuditMs >= reaskDays * DAY_MS

  const shouldAsk = paidUnanswered || reaskDue
  const prompt: 'pay' | 'reask' = paidUnanswered ? 'pay' : 'reask'

  return { shouldAsk, prompt, flag, negativeStreak }
}
