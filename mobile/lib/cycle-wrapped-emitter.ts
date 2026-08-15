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

  // ── Rediseño "La Edición" (design/wrapped-2026-08) ───────────────────
  /** Días del ciclo cerrado (period_end − period_start). Para el chip de
   *  portada ("30 DÍAS") y el promedio por día de la pantalla 02. */
  cycleDays: number
  /** Rango display SIEMPRE presente ("20 jun → 19 jul") — la portada y el
   *  sello lo muestran aunque el ciclo sea calendario. `periodRange` (arriba)
   *  conserva su semántica null-si-calendario para los consumidores viejos. */
  periodRangeDisplay: string
  /** Línea del sello ("JUNIO → JULIO 2026" / "JUNIO 2026") — meses en
   *  palabra, como la dibuja el handoff (HTML:52). */
  selloRango: string
  /** Ordinal de la edición ("Nº 3") por conteo de ciclos cerrados de la
   *  familia. Null si no se pudo derivar (falla de red / edición más vieja
   *  que la ventana del conteo) → el sello degrada al rango. */
  editionNumber?: number | null
  /** Top 3 categorías del ciclo, orden desc por monto. `share` recalculado
   *  en cliente contra `total_spent` (el pct del server usa la base
   *  variable y lo consume Control — no se toca). */
  topCategories?: Array<{ name: string; amount: number; share: number }>
  /** Fijos pagados en el ciclo + su monto (strip de la pantalla 03).
   *  Null si el select no los trajo → el strip se oculta. Sin denominador
   *  ("de 16") hasta la migración de `fixed_total_count` (V1.5). */
  fixedPaidCount?: number | null
  totalFixedSpent?: number | null
  /** Saldo firmado del ciclo ANTERIOR, para el sub del veredicto
   *  ("Mejor cierre que mayo"). Null si es la primera edición. */
  previousCycle?: { label: string; saldo: number } | null
  /** Reserva disponible del hogar — opción "cubrir con la reserva" del
   *  plan de recuperación (EXCEDIDO). Null/0 → la opción se oculta. */
  reserveAvailable?: number | null
  /** Estantería de la contratapa: hasta 2 ediciones anteriores + el
   *  acumulado honesto (Σ sobrantes decididos a reserva/meta — NO la suma
   *  ingenua de saldos, que doble-cuenta los arrastres de `acumular`). */
  shelf?: {
    previous: Array<{ label: string; saldo: number }>
    accumulatedSaved: number | null
    totalEditions: number
  } | null
  /** ¿Este usuario puede confirmar la decisión del paso 06? El RPC es
   *  owner-only: un miembro ve las opciones en modo lectura con el aviso
   *  de pedírselo al dueño, en vez de un error genérico al confirmar. */
  canDecide?: boolean
  /** Plan de recuperación (EXCEDIDO) — "cubrir con la reserva": inyecta
   *  la reserva al presupuesto del ciclo nuevo (`apply_reserve_decision`
   *  target='cycle'). Sin el callback, la opción no se ofrece. */
  onApplyReserve?: (input: { amount: number }) => Promise<void>
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
  /** Meta activa para la opción "A tu meta". Null si user no tiene.
   *  `currentAmount`/`goalAmount` alimentan la barra de progreso de la
   *  opción (pantalla 06 del rediseño); opcionales para compat con los
   *  callers que todavía no los pasan → la barra se oculta. */
  activeGoal?: {
    id: string
    title: string
    emoji: string
    currentAmount?: number
    goalAmount?: number
  } | null
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
