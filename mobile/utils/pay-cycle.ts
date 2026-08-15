import { DAY_MS } from '@/utils/time'
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'

export interface PayCycle {
  start: Date
  end: Date
  weeks: number
  days: number
  /**
   * Fin NOMINAL de la ventana (el payday configurado), EXCLUSIVO.
   *
   * Igual a `end` salvo que el ciclo esté ESTIRADO (`cycle_model='extended'`
   * + cobro sin confirmar): ahí `end` se corre hasta hoy+1 y `nominalEnd`
   * conserva el día 5 (o el que sea) que el usuario tiene configurado.
   * Espejo del `nominal_period_end` que `close_monthly_cycle` archiva.
   *
   * OPCIONAL a propósito: hay tests que construyen literales `PayCycle`.
   * Usar `isCycleExtended()` / `getCycleExtensionDays()` en vez de
   * compararlo a mano.
   */
  nominalEnd?: Date
}

export function normalizeToStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function capitalizeText(value: string): string {
  if (!value) return value
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

/** Parse YYYY-MM-DD a Date local anclado a medianoche. Evita el off-by-one
 *  por tz de `new Date("YYYY-MM-DD")` que UTC-parsea. */
export function parseLocalDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/**
 * Build the calendar date for a given pay day. We treat `paymentDay` as
 * a literal day-of-month: if the user says "25", payday is the 25th.
 *
 * Previously this also called `moveToNextBusinessDay` to shift
 * weekend paydays to Monday. That looked clever but caused two
 * problems:
 *   1. `daysUntilPayday` computed `target` from the raw day, so
 *      the FamilyStrip pill said "Sueldo en 29 días" while the
 *      hero day chip said "día 33 de 33" — a payday on Sat 25
 *      would silently shift to Mon 27 inside the cycle math but
 *      not in the countdown.
 *   2. The user's mental model is the calendar day, not "first
 *      business day on or after". Empirically payments arrive on
 *      the calendar day for most setups; if the user wants a
 *      different day, they can pick it.
 *
 * Keeping it raw aligns every consumer (cycle math, countdown,
 * anchors) on the same day.
 */
export function buildPayDate(year: number, month: number, paymentDay: number): Date {
  const monthLastDay = new Date(year, month + 1, 0).getDate()
  const normalizedPaymentDay = Math.min(Math.max(1, paymentDay), monthLastDay)
  return normalizeToStartOfDay(new Date(year, month, normalizedPaymentDay))
}

/**
 * Contexto del modelo de ciclo (2026-08, feature "ciclo extendido").
 *
 * `'nominal'` es el modelo histórico: pasado el día de cobro sin confirmar, la
 * ventana se CONGELA en el payday y todo gasto posterior queda en un limbo —
 * se guarda pero no resta de ningún saldo visible.
 *
 * `'extended'` implementa la decisión del owner: **no cobraste ⇒ no hay ciclo
 * nuevo**. La plata que gastás sale de lo que quedaba del ciclo actual, que se
 * ESTIRA hasta que confirmes. El ciclo siguiente arranca en la fecha de
 * confirmación, así que los ciclos quedan contiguos y cada gasto pertenece a
 * exactamente uno.
 *
 * El flag vive en `family_finance.cycle_model` y lo activa este build al
 * confirmar el cobro. El servidor lo espeja en `close_monthly_cycle`,
 * `cycle_disponible` y `home_snapshot` (migraciones 20260813120000-120300).
 */
export interface ExtendedCycleContext {
  cycleModel: 'nominal' | 'extended'
  /** `current_cycle_anchor` (YYYY-MM-DD): fecha en que se confirmó el cobro
   *  que ABRIÓ el ciclo vigente. Es la frontera compartida con el servidor. */
  currentCycleAnchor: string | null
}

function toPayCycle(start: Date, end: Date, nominalEnd?: Date): PayCycle {
  const cycleDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS))
  return {
    start,
    end,
    weeks: Math.max(1, Math.ceil(cycleDays / 7)),
    days: cycleDays,
    nominalEnd: nominalEnd ?? end,
  }
}

/** ¿La ventana está ESTIRADA? (modelo extendido + cobro sin confirmar). */
export function isCycleExtended(cycle: Pick<PayCycle, 'end' | 'nominalEnd'>): boolean {
  return cycle.nominalEnd != null && cycle.nominalEnd.getTime() < cycle.end.getTime()
}

/** Días de EXTENDIDO de la ventana: 0 si no está estirada. */
export function getCycleExtensionDays(
  cycle: Pick<PayCycle, 'end' | 'nominalEnd'>,
): number {
  if (cycle.nominalEnd == null) return 0
  return Math.max(
    0,
    Math.round((cycle.end.getTime() - cycle.nominalEnd.getTime()) / DAY_MS),
  )
}

function parseAnchorDate(anchor: string | null | undefined): Date | null {
  if (typeof anchor !== 'string' || anchor.trim() === '') return null
  const parsed = parseLocalDateKey(anchor)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function computeMonthAnchored(
  today: Date,
  paymentDay: number,
  freezeUntilSalaryConfirmation: boolean,
  extended?: ExtendedCycleContext,
): PayCycle {
  const todayNormalized = normalizeToStartOfDay(today)
  const currentMonthPayDate = buildPayDate(
    todayNormalized.getFullYear(),
    todayNormalized.getMonth(),
    paymentDay,
  )

  const cycleStart =
    freezeUntilSalaryConfirmation && todayNormalized >= currentMonthPayDate
      ? buildPayDate(todayNormalized.getFullYear(), todayNormalized.getMonth() - 1, paymentDay)
      : todayNormalized >= currentMonthPayDate
        ? currentMonthPayDate
        : buildPayDate(todayNormalized.getFullYear(), todayNormalized.getMonth() - 1, paymentDay)

  const cycleEnd =
    freezeUntilSalaryConfirmation && todayNormalized >= currentMonthPayDate
      ? currentMonthPayDate
      : buildPayDate(cycleStart.getFullYear(), cycleStart.getMonth() + 1, paymentDay)

  // MODELO EXTENDIDO. Espejo exacto de la rama `is_extended` del SQL
  // `cycle_disponible` — cualquier divergencia acá desincroniza la app del
  // push "Buen día", que es el bug que el freeze de paridad vino a matar.
  if (extended?.cycleModel === 'extended') {
    const anchor = parseAnchorDate(extended.currentCycleAnchor)
    const isPending = freezeUntilSalaryConfirmation && todayNormalized >= currentMonthPayDate

    if (isPending) {
      // El ciclo arrancó en la confirmación anterior y se estira hasta HOY
      // inclusive. El anchor manda si es coherente con el mes en curso.
      const previousPayDate = buildPayDate(
        todayNormalized.getFullYear(),
        todayNormalized.getMonth() - 1,
        paymentDay,
      )
      const start =
        anchor && anchor >= previousPayDate && anchor <= currentMonthPayDate
          ? anchor
          : previousPayDate
      const stretchedEnd = new Date(todayNormalized)
      stretchedEnd.setDate(stretchedEnd.getDate() + 1)
      // El fin NOMINAL (el payday configurado) se conserva: es lo que
      // separa "el ciclo terminó el 5" de "sigue corriendo de extendido
      // hasta que confirmes". Sin este dato el cliente sólo tenía el fin
      // real y cada superficie elegía uno — de ahí la incoherencia
      // "calendario dice 13 / Fijos dice 5" (QA del owner 2026-08-13).
      return toPayCycle(start, stretchedEnd, currentMonthPayDate)
    }

    // Cobro confirmado: el ciclo arranca en la FECHA DE CONFIRMACIÓN (no en el
    // payday nominal) y termina en el próximo payday configurado.
    const start = anchor && anchor >= cycleStart && anchor < cycleEnd ? anchor : cycleStart
    return toPayCycle(start, cycleEnd)
  }

  return toPayCycle(cycleStart, cycleEnd)
}

function computeRollingN(
  today: Date,
  anchorDate: string,
  lengthDays: number,
): PayCycle {
  const todayNormalized = normalizeToStartOfDay(today)
  const anchor = parseLocalDateKey(anchorDate)
  const diffDays = Math.floor((todayNormalized.getTime() - anchor.getTime()) / DAY_MS)
  // `Math.floor` with negatives gives the right period for anchor-in-future:
  // diff=-8 with length=7 → floor(-1.14)=-2 → start = anchor + (-2*7) = anchor - 14
  const periodIndex = Math.floor(diffDays / lengthDays)
  const start = new Date(anchor)
  start.setDate(start.getDate() + periodIndex * lengthDays)
  const end = new Date(start)
  end.setDate(end.getDate() + lengthDays)
  return {
    start,
    end,
    days: lengthDays,
    weeks: Math.max(1, Math.ceil(lengthDays / 7)),
  }
}

/**
 * Computes the active pay cycle window for any cycle_type.
 *
 * For `monthly`: ancla al día-del-mes (lógica preservada del before-cycle-
 * config refactor). Para los rolling types: encuentra el período activo
 * que contiene `referenceDate`, soportando anchor pasado o futuro.
 *
 * `freezeUntilSalaryConfirmation` solo aplica a monthly — es la lógica
 * de "freeze el ciclo en el límite cuando el sueldo no fue confirmado".
 * Para rolling types es no-op (no tiene sentido conceptual).
 */
export function getCurrentPayCycle(
  referenceDate: Date,
  config: FinanceCycleConfig,
  freezeUntilSalaryConfirmation = false,
  extended?: ExtendedCycleContext,
): PayCycle {
  if (config.cycle_type === 'monthly') {
    return computeMonthAnchored(
      referenceDate,
      config.salary_payment_day,
      freezeUntilSalaryConfirmation,
      extended,
    )
  }
  return computeRollingN(referenceDate, config.cycle_anchor_date, config.cycle_length_days)
}

/**
 * Proyecta el row de `family_finance` al contexto del modelo de ciclo.
 * Defensivo: cualquier valor que no sea exactamente `'extended'` cae en
 * `'nominal'` (el comportamiento histórico).
 */
export function financeToExtendedCycleContext(
  finance:
    | { cycle_model?: string | null; current_cycle_anchor?: string | null }
    | null
    | undefined,
): ExtendedCycleContext {
  return {
    cycleModel: finance?.cycle_model === 'extended' ? 'extended' : 'nominal',
    currentCycleAnchor: finance?.current_cycle_anchor ?? null,
  }
}

/**
 * `true` cuando el cobro mensual de ESTE mes ya llegó (today >= payday) pero el
 * user todavía no lo confirmó (`lastConfirmedAt < payday`). Es el flag que
 * congela el ciclo/ventana de accounting hasta confirmar el cobro. Solo aplica
 * a `monthly`. Fuente única para que el countdown (usePayCycle) y el saldo
 * (useMonthlyAccounting) usen EXACTAMENTE la misma condición y no se
 * desincronicen.
 */
export function computeIsSalaryPendingConfirmation(
  config: FinanceCycleConfig,
  today: Date,
  lastConfirmedAt: string | null,
  incomeMode?: 'fixed' | 'dynamic',
): boolean {
  // Modo dinámico: no hay sueldo que confirmar → nunca pending/freeze.
  // Vive ACÁ (la fuente única de la condición) para que countdown y
  // saldo no puedan divergir por gates duplicados en los hooks.
  if (incomeMode === 'dynamic') return false
  if (config.cycle_type !== 'monthly') return false
  const todayNorm = normalizeToStartOfDay(today)
  const payDate = buildPayDate(
    todayNorm.getFullYear(),
    todayNorm.getMonth(),
    config.salary_payment_day,
  )
  if (todayNorm < payDate) return false
  if (!lastConfirmedAt) return true
  const confirmed = new Date(lastConfirmedAt)
  if (Number.isNaN(confirmed.getTime())) return true
  return normalizeToStartOfDay(confirmed) < payDate
}
