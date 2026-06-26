import { useEffect } from 'react'

/**
 * Module-scoped emitter para disparar el "Manifiesto Wrapped" del
 * ciclo recién cerrado.
 *
 * Production flow:
 *   Usuario confirma cobro → upsert family_finance → DB trigger
 *   `trg_family_finance_salary_confirm` → close_monthly_cycle upserta
 *   `monthly_summaries` → mobile invalida `controlIntelligenceQueryKey`
 *   → encuentra el summary recién cerrado → llama
 *   `triggerCycleWrapped(payload)` → Bridge muestra modal.
 *
 * Dev preview flow:
 *   Settings → Desarrollo → "Preview · Cierre de ciclo" →
 *   `triggerCycleWrapped(syntheticPayload)` → mismo Bridge → modal.
 *
 * Same shape, mismo render path. El Bridge no distingue origen.
 *
 * Pattern espejo de `auth-transition-splash` + `achievement-preview-emitter`.
 */

/** Datos derivados del ciclo recién cerrado. Forma minimal — todo
 *  derivado de `monthly_summaries` row + el catálogo de categorías. */
export interface CycleWrappedPayload {
  /** Etiqueta humana del ciclo cerrado (ej: "Marzo 2026"). */
  periodLabel: string
  /** Rango display si el ciclo no es calendario (ej: "15 mar – 14 abr").
   *  Null cuando salary_payment_day = 1. */
  periodRange: string | null
  /** Total gastado en el ciclo (variable + fijos). */
  totalSpent: number
  /** Ingreso del ciclo. */
  monthlyIncome: number
  /** `monthly_income - total_spent`. >0 = ahorraste, <0 = excediste. */
  savingsDelta: number
  /** Cantidad de gastos en el ciclo. */
  expensesCount: number
  /** % vs ciclo anterior. Null si no hay anterior. >0 = gastaste más. */
  deltaVsPreviousPercent: number | null
  /** Categoría con mayor share del ciclo. Null si sparse/no data. */
  topCategory: {
    name: string
    amount: number
    /** 0..1, fracción del total. */
    share: number
  } | null
  /** El gasto individual más caro del ciclo. */
  topExpense: {
    description: string
    price: number
    /** ISO date. */
    occurredAt: string
  } | null
  /** Cantidad de logros desbloqueados durante este ciclo (lookup
   *  achievements_earned con earned_at en el rango del ciclo). 0 si
   *  no hay achievements habilitados o ninguno cayó en el rango. */
  achievementsEarnedInCycle: number
  /** Mood string del rollup ('great' | 'good' | 'ok' | 'tight' |
   *  'over'). Drive copy + tone. Null si el rollup no lo seteó. */
  mood: string | null

  /**
   * Spec B: decisión pendiente sobre el saldo a favor del ciclo que se
   * está mostrando. Cuando viene, la closing scene del modal cambia de
   * "Tienes $X para administrar" a un flujo de selección de 3 opciones
   * (meta / acumular / reserva). El CTA "Empezar el próximo" aplica
   * la decisión seleccionada antes de dismissar.
   *
   * Opcional para preservar compat con el dev preview (Settings) y
   * con replays de cycles viejos desde editions-screen donde no hay
   * decision flow.
   */
  pendingLeftoverDecision?: {
    monthlySummaryId: string
    sobrante: number
  }
  /** Meta activa para la opción "A tu meta". Null si user no tiene. */
  activeGoal?: { id: string; title: string; emoji: string } | null
  /** YYYY-MM-DD del inicio del mes accounting actual (para la opción
   *  "acumular" — se setea como new cycle anchor). */
  nextCycleAnchor?: string
  /** Callback que aplica la decisión vía RPC. Inyectado por home-dashboard
   *  desde useApplyMonthCloseDecision. Si no viene Y pendingLeftoverDecision
   *  viene → la closing scene SE COMPORTA como si no hubiera pending
   *  (compat — no crashea). */
  onApplyLeftoverDecision?: (
    input: import('@/features/month-close/use-month-close-decision').ApplyDecisionInput,
  ) => Promise<void>

  /**
   * Decisión sobre el saldo a favor YA TOMADA para este cycle. Cuando
   * viene, la closing scene muestra el modo read-only: las 3 opciones
   * aparecen pero la elegida está marcada y las otras inertes; el CTA
   * dice "Decidiste: [opción]" en vez de "Confirmar y empezar".
   *
   * Mutuamente exclusivo con `pendingLeftoverDecision`. Si por accidente
   * llegan los dos, prevalece `pastLeftoverDecision`.
   */
  pastLeftoverDecision?: {
    decision: 'meta' | 'acumular' | 'reserva' | 'skip'
    sobrante: number
    /** Nombre de la meta a la que se aportó. Solo cuando decision='meta'. */
    metaGoalTitle?: string | null
    /** ISO timestamp de cuándo se decidió. */
    decidedAt: string
  }
}

type Listener = (payload: CycleWrappedPayload) => void

const listeners = new Set<Listener>()

/** Dispara el Wrapped para el ciclo cerrado. Idempotente — varios
 *  listeners reciben el mismo payload. */
export function triggerCycleWrapped(payload: CycleWrappedPayload): void {
  for (const l of listeners) l(payload)
}

/** Hook para el Bridge — subscribe en mount, unsubscribe en unmount.
 *  Seguro mountar desde varios lugares (cada subscriber recibe cada
 *  evento), aunque en práctica solo el Bridge escucha. */
export function useCycleWrappedListener(callback: Listener): void {
  useEffect(() => {
    listeners.add(callback)
    return () => {
      listeners.delete(callback)
    }
  }, [callback])
}
