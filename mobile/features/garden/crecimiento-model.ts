// Modelo de CRECIMIENTO del brote (§3 del plan del rediseño de "Mi jardín",
// 2026-08-11). Derivación PURA: sin React, sin Supabase, sin i18n.
//
// El brote ya maduraba con el reloj (garden-model: seed 0–1d, germ 2–6d,
// fern ≥7d). Acá esa misma curva se mide en HORAS y se le puede ADELANTAR
// tiempo: cada gasto que registrás le regala horas, y un día sin gastos le
// regala dos días enteros. El modelo es estrictamente ADITIVO — con
// `adelanto = 0` devuelve exactamente la misma etapa que hoy, a cualquier
// hora, porque los dos umbrales (48/168) caen sobre múltiplos exactos de 24.
// Ningún brote puede verse más chico que antes del rediseño.
//
// El cupo diario NO entra en el porcentaje (entra como TONO, §3.3): un bonus
// por cupo se evalúa contra `spentToday`, que cambia durante el día, así que
// el cuarto gasto grande haría BAJAR el aro justo al registrar — castigando el
// acto que el modelo premia. Sin cupo, el aro nunca baja por registrar.

import { isoDay } from './garden-model'

// §3 — El brote crece con el reloj (24 h/día) y registrar adelanta horas.
export const HORAS_POR_DIA = 24
export const AGUA_POR_REGISTRO = 6     // cada gasto registrado
export const ADELANTO_MAX = 24         // 4 registros = un día entero de adelanto
export const BONO_CALMA = 48           // D4: el día sin gastos crece el DOBLE del techo
export const UMBRAL_GERM_HORAS = 48    // = 2 días, idéntico al umbral actual
export const UMBRAL_FERN_HORAS = 168   // = 7 días, idéntico al umbral actual
const HORA_RIESGO = 20
const DIAS_CORTADA_VISIBLE = 7
const MS_DIA = 86_400_000
const WEEK_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const

export type EtapaCrecimiento = 'seed' | 'germ' | 'fern'
export type DayRingState = 'pre' | 'future' | 'today' | 'planted' | 'calma' | 'missed' | 'recovered'
export type RingTone = 'green' | 'amber' | 'water'
export interface DayRing {
  iso: string; letter: string; state: DayRingState; pct: number; tone: RingTone
  noSpend: boolean; stage: EtapaCrecimiento; brotSize: number; isToday: boolean
}
export type HeroState = 'empezar' | 'aTiempo' | 'plantado' | 'floreciendo' | 'enRiesgo' | 'cortada'
export interface CountsPorDia { todos: Map<string, number>; discrecionales: Map<string, number> }

export function horasDeCrecimiento(a: { ageDays: number; horaLocal: number; adelanto: number }): number {
  return HORAS_POR_DIA * a.ageDays + a.horaLocal + a.adelanto
}

export function etapaPorHoras(h: number): EtapaCrecimiento {
  if (h < UMBRAL_GERM_HORAS) return 'seed'
  if (h < UMBRAL_FERN_HORAS) return 'germ'
  return 'fern'
}

/** Espejo horario de fernSizeForAge (0.4 px/día = 1/60 px/hora). No alimenta la UI
 *  —el tamaño en pantalla lo da brotSizeForHours—: existe como PRUEBA EJECUTABLE de
 *  que el modelo horario reproduce la curva de tamaño actual, y como fuente para
 *  cualquier superficie futura que quiera la escala original de 24→32 px. */
export function fernSizeForHours(h: number): number {
  return Math.round(24 + Math.min(Math.max((h - UMBRAL_FERN_HORAS) / 60, 0), 8))
}

/** Tamaño del Brot en el pozo de 28: CONTINUO en horas (rango 15–20 de ringDay).
 *  Continuo y no por etapa para que el adelanto se vea como crecimiento sostenido
 *  y no se pierda dentro de una banda de 120 h. */
export function brotSizeForHours(horas: number): number {
  const t = Math.min(Math.max(horas / UMBRAL_FERN_HORAS, 0), 1)
  return Math.round((15 + t * 5) * 10) / 10
}

/** El día en calma vale el doble SOLO si de verdad no hubo gastos discrecionales:
 *  el server acepta marcar con `force` un día que ya tiene gastos (y el FAB y el
 *  calendario ofrecen ese camino), y en ese caso el día no es "en calma". */
export function deriveAdelanto(a: {
  registros: number
  marcadoSinGastos: boolean
  discrecionales?: number
}): number {
  const enCalma = a.marcadoSinGastos && (a.discrecionales ?? 0) === 0
  if (enCalma) return BONO_CALMA                   // D4: el único que supera el techo
  if (a.marcadoSinGastos) return ADELANTO_MAX      // marcado con force: día completo, no calma
  if (a.registros <= 0) return 0
  return Math.min(ADELANTO_MAX, AGUA_POR_REGISTRO * a.registros)
}

/** Counts por día local. `todos` es el espejo EXACTO del filtro de familyActivityDays
 *  (incluye pagos de fijos, excluye created_by null). `discrecionales` excluye además
 *  commitment_id — es la definición de "sin gastos" del server (mark_no_expense_day). */
export function agrupaGastosPorDia(
  expenses: ReadonlyArray<{ created_at: string; created_by: string | null; commitment_id?: string | null }>,
  tz: string,
): CountsPorDia {
  const todos = new Map<string, number>()
  const discrecionales = new Map<string, number>()
  for (const e of expenses) {
    if (!e.created_by) continue
    const iso = isoDay(new Date(e.created_at), tz)
    todos.set(iso, (todos.get(iso) ?? 0) + 1)
    if (!e.commitment_id) discrecionales.set(iso, (discrecionales.get(iso) ?? 0) + 1)
  }
  return { todos, discrecionales }
}

export function deriveDayRings(a: {
  counts: CountsPorDia
  markedDaysIso: readonly string[]
  recoveredIso: ReadonlySet<string>
  todayIso: string
  horaLocal: number
  tone: RingTone
  /** primer día del jardín (alta de la cuenta): antes de esto nada es "perdido" */
  startIso: string | null
  weekDayIso: (i: number) => string
}): DayRing[] {
  const marked = new Set(a.markedDaysIso)
  const todayN = Math.round(Date.parse(`${a.todayIso}T00:00:00Z`) / MS_DIA)
  return WEEK_LETTERS.map((letter, i) => {
    const iso = a.weekDayIso(i)
    const isToday = iso === a.todayIso
    const registros = a.counts.todos.get(iso) ?? 0
    const discrecionales = a.counts.discrecionales.get(iso) ?? 0
    const marcado = marked.has(iso)
    const planted = registros > 0 || marcado
    const noSpend = marcado && discrecionales === 0
    const adelanto = deriveAdelanto({ registros, marcadoSinGastos: marcado, discrecionales })
    const ageDays = todayN - Math.round(Date.parse(`${iso}T00:00:00Z`) / MS_DIA)
    const horas = horasDeCrecimiento({ ageDays, horaLocal: a.horaLocal, adelanto })
    const stage = etapaPorHoras(horas)

    let state: DayRingState
    let pct: number
    if (iso > a.todayIso) { state = 'future'; pct = 0 }
    else if (a.startIso !== null && iso < a.startIso) { state = 'pre'; pct = 0 }
    // HOY conserva su estado propio (pozo con tinte + label HOY del handoff), pero
    // `noSpend` viaja aparte para que el día marcado se dibuje en calma también hoy.
    else if (isToday) { state = 'today'; pct = Math.min(1, adelanto / ADELANTO_MAX) }
    // Orden logged-first, espejo de deriveGardenCells:166-169
    else if (planted) { state = noSpend ? 'calma' : 'planted'; pct = 1 }
    else if (a.recoveredIso.has(iso)) { state = 'recovered'; pct = 1 }
    else { state = 'missed'; pct = 0 }

    return { iso, letter, state, pct, tone: a.tone, noSpend, stage, brotSize: brotSizeForHours(horas), isToday }
  })
}

export function deriveHeroState(a: {
  currentStreak: number
  isBroken: boolean
  streakBrokenAt: string | null
  plantedToday: boolean
  hourLocal: number
  todayIso: string
}): HeroState {
  if (a.plantedToday) return a.currentStreak >= 7 ? 'floreciendo' : 'plantado'
  if (a.isBroken) {
    // streakBrokenAt null = rama heurística de isBroken (use-streak.ts:251-256):
    // el cron aún no estampó la rotura ⇒ es la más fresca posible.
    if (!a.streakBrokenAt) return 'cortada'
    const brokenMs = Date.parse(a.streakBrokenAt)
    const todayMs = Date.parse(`${a.todayIso}T00:00:00Z`)
    const reciente = Number.isFinite(brokenMs) && todayMs - brokenMs <= DIAS_CORTADA_VISIBLE * MS_DIA
    return reciente ? 'cortada' : 'empezar'
  }
  if (a.currentStreak <= 0) return 'empezar'
  // 00–04: el día NUEVO recién arranca. La banda `critical` de resolveAtRiskIntensity
  // cubre 20–04 para el copy de Home; acá el riesgo se corta a medianoche.
  return a.hourLocal >= HORA_RIESGO ? 'enRiesgo' : 'aTiempo'
}
