// Derivación PURA del jardín (sin React, sin Supabase). La madurez del
// brote depende de la ANTIGÜEDAD del día (no de la posición). Días
// salteados NO rompen el jardín (decisión "sin culpa"): se muestran como
// brote tenue. Refleja la lógica del prototipo de diseño (renderVals()).

import i18n from '@/lib/i18n'

export type BroteStage =
  | 'pre'
  | 'pending'
  | 'missed'
  | 'recovered' // día plantado con ayuda (1 escudo) — NO florece
  | 'seed'
  | 'germ'
  | 'fern'
  | 'bloom'

export interface GardenCell {
  iso: string
  ageDays: number
  stage: BroteStage
  fernSize: number
  isToday: boolean
}

export interface WeekClose {
  score: number
  stage: 'none' | 'seed' | 'germ' | 'fern'
  bloom: boolean
  label: string
  title: string
  sub: string
  days: Array<{ letter: string; registered: boolean; recovered: boolean }>
}

export const GARDEN_COLS = 7
export const GARDEN_ROWS = 5
export const GARDEN_CELLS = GARDEN_COLS * GARDEN_ROWS // 35

// El helecho arraiga a los 7 días (1 semana) y sigue engrosando un poco con la
// edad (24→32px) hasta ~3½ semanas. Rebase tras bajar el umbral de 14→7.
export function fernSizeForAge(ageDays: number): number {
  return Math.round(24 + Math.min((ageDays - 7) * 0.4, 8))
}

// ── Helpers de fecha sobre ISO 'YYYY-MM-DD' (UTC, deterministas) ────────────
// La grilla es una secuencia de días calendario; sólo necesitamos sus strings
// de fecha, así que UTC-day arithmetic alcanza (el timezone ya se aplicó al
// armar el set de actividad con isoDay). Lunes = 0.
function utcDays(iso: string): number {
  return Math.round(Date.parse(iso + 'T00:00:00Z') / 86_400_000)
}
function isoFromUtcDays(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10)
}
function dowMonday0(iso: string): number {
  return (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7
}

/**
 * Semanas a mostrar en la grilla: crece desde la semana del PRIMER registro
 * hasta la semana actual, con tope de 5 (después corre como ventana de 5). Sin
 * actividad → 1 (sólo la semana actual). Así una cuenta nueva ve un jardín
 * chiquito que crece, en vez de 5 semanas casi vacías.
 */
export function weeksToShow(firstActivityIso: string | null, todayIso: string): number {
  if (!firstActivityIso) return 1
  const currentMonday = utcDays(todayIso) - dowMonday0(todayIso)
  const firstMonday = utcDays(firstActivityIso) - dowMonday0(firstActivityIso)
  const weeks = Math.floor((currentMonday - firstMonday) / 7) + 1
  return Math.min(GARDEN_ROWS, Math.max(1, weeks))
}

/**
 * Ancla del jardín = el primer brote DESDE que empezaste a usar la app. Clampea
 * el primer registro a `accountCreatedIso` para que back-datear un gasto anterior
 * a tu cuenta NO extienda el jardín hacia atrás (evita semanas de "salteados" que
 * nunca tuviste chance de registrar — "sin culpa"). `sortedActivityIso` debe venir
 * ascendente. Sin fecha de cuenta → el registro más viejo (fallback).
 */
export function gardenFirstActivity(
  sortedActivityIso: string[],
  accountCreatedIso: string | null,
): string | null {
  if (sortedActivityIso.length === 0) return null
  if (!accountCreatedIso) return sortedActivityIso[0]
  return sortedActivityIso.find((iso) => iso >= accountCreatedIso) ?? null
}

/**
 * Grilla DINÁMICA por semanas calendario (L→D). Muestra las últimas
 * `weeksToShow` semanas terminando en la semana actual; cada celda es un día.
 *
 * Madurez del brote (decisión owner 2026-06-25):
 *  - por EDAD del día registrado: semilla 0–1d, creciendo 2–6d, arraigado 7d+
 *    (1 semana para arraigar; días salteados no rompen — "sin culpa").
 *  - por SEMANA: una semana PERFECTA (los 7 días registrados) hace FLORECER
 *    todos sus brotes (`bloom`), sin importar la edad. La edad te lleva hasta
 *    arraigado; florecer requiere una semana completa (esfuerzo, no solo tiempo).
 *
 * Días futuros de la semana en curso y previos al primer registro = 'pre'.
 */
export function deriveGardenCells(
  activityIso: ReadonlySet<string>,
  todayIso: string,
  firstActivityIso: string | null,
  recoveredIso: ReadonlySet<string> = new Set(),
): GardenCell[] {
  const weeks = weeksToShow(firstActivityIso, todayIso)
  const todayN = utcDays(todayIso)
  const startMonday = todayN - dowMonday0(todayIso) - (weeks - 1) * 7
  const cells: GardenCell[] = []
  for (let i = 0; i < weeks * GARDEN_COLS; i++) {
    const n = startMonday + i
    const iso = isoFromUtcDays(n)
    const ageDays = todayN - n
    const logged = activityIso.has(iso)
    const recovered = recoveredIso.has(iso)
    const isToday = n === todayN
    const isFuture = ageDays < 0
    const isPre = firstActivityIso !== null && iso < firstActivityIso
    let stage: BroteStage
    if (isFuture || isPre) stage = 'pre'
    // Orden logged-first (igual que deriveWeekStrip/deriveWeekClose): si un día
    // quedó recuperado por escudo PERO luego back-dateás un gasto real ahí, gana
    // el brote orgánico (el día recuperado nunca se borra de garden_recovered_days).
    else if (recovered && !logged) stage = 'recovered'
    else if (isToday && !logged) stage = 'pending'
    else if (!logged) stage = 'missed'
    else if (ageDays <= 1) stage = 'seed'
    else if (ageDays <= 6) stage = 'germ'
    else stage = 'fern'
    cells.push({
      iso,
      ageDays,
      stage,
      fernSize: stage === 'fern' ? fernSizeForAge(ageDays) : 26,
      isToday,
    })
  }

  // Floración por SEMANA PERFECTA: si los 7 días de una semana están
  // registrados, todos sus brotes florecen. (Una semana sólo puede ser 7/7 si
  // ya está completa — no se pueden registrar días futuros — así que la semana
  // en curso recién florece al cerrar el domingo.)
  for (let w = 0; w < weeks; w++) {
    const base = w * GARDEN_COLS
    let perfect = true
    for (let d = 0; d < GARDEN_COLS; d++) {
      if (!activityIso.has(cells[base + d].iso)) {
        perfect = false
        break
      }
    }
    if (perfect) {
      for (let d = 0; d < GARDEN_COLS; d++) cells[base + d].stage = 'bloom'
    }
  }

  return cells
}

// Score 0–7 de la semana L→D → madurez + copy. Tabla del handoff.
export function weekCloseCopy(score: number): {
  stage: WeekClose['stage']
  bloom: boolean
  label: string
  title: string
  sub: string
} {
  if (score >= 7)
    return {
      stage: 'fern',
      bloom: true,
      label: i18n.t('garden:weekClose.perfect.label'),
      title: i18n.t('garden:weekClose.perfect.title'),
      sub: i18n.t('garden:weekClose.perfect.sub'),
    }
  if (score >= 5)
    return {
      stage: 'fern',
      bloom: false,
      label: i18n.t('garden:weekClose.great.label'),
      title: i18n.t('garden:weekClose.great.title'),
      sub: i18n.t('garden:weekClose.great.sub'),
    }
  if (score >= 3)
    return {
      stage: 'germ',
      bloom: false,
      label: i18n.t('garden:weekClose.going.label'),
      title: i18n.t('garden:weekClose.going.title'),
      sub: i18n.t('garden:weekClose.going.sub'),
    }
  if (score >= 1)
    return {
      stage: 'seed',
      bloom: false,
      label: i18n.t('garden:weekClose.calm.label'),
      title: i18n.t('garden:weekClose.calm.title'),
      sub: i18n.t('garden:weekClose.calm.sub'),
    }
  return {
    stage: 'none',
    bloom: false,
    label: i18n.t('garden:weekClose.pause.label'),
    title: i18n.t('garden:weekClose.pause.title'),
    sub: i18n.t('garden:weekClose.pause.sub'),
  }
}

/** `weekDayIso(i)` devuelve el ISO del día i de la semana (0=Lunes..6=Domingo). */
export function deriveWeekClose(
  activityIso: ReadonlySet<string>,
  recoveredIso: ReadonlySet<string>,
  weekDayIso: (dayIndexMonday0: number) => string,
): WeekClose {
  const letters = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
  const days = letters.map((letter, i) => {
    const iso = weekDayIso(i)
    const registered = activityIso.has(iso)
    // Día recuperado por un escudo: NO es actividad orgánica, pero tampoco un
    // salteado — se muestra distinto (coral) en la celebración.
    return { letter, registered, recovered: !registered && recoveredIso.has(iso) }
  })
  // El score cuenta SOLO días orgánicos: 6 orgánicos + 1 recuperado es "gran
  // semana" (6/7), nunca "perfecta" — el escudo salva la racha, no fabrica una
  // floración (la floración sigue exigiendo 7/7 orgánico en deriveGardenCells).
  const score = days.filter((d) => d.registered).length
  const copy = weekCloseCopy(score)
  return { score, ...copy, days }
}

// ── Tira semanal (widget de Home) ──────────────────────────────────────
export type WeekDayState = 'logged' | 'pending' | 'missed' | 'recovered' | 'future'

export interface WeekStripDay {
  letter: string
  iso: string
  state: WeekDayState
  isToday: boolean
}

/**
 * Semana calendario L→D para el widget de Home. Cada día: registrado (logged),
 * recuperado por un escudo (recovered), hoy-sin-registrar (pending),
 * pasado-sin-registrar (missed), o futuro (future). `weekDayIso(i)` devuelve el
 * ISO del día i (0=Lunes..6=Domingo). Los ISO `YYYY-MM-DD` se comparan
 * lexicográficamente = cronológicamente.
 */
export function deriveWeekStrip(
  activityIso: ReadonlySet<string>,
  recoveredIso: ReadonlySet<string>,
  todayIso: string,
  weekDayIso: (dayIndexMonday0: number) => string,
  startIso?: string | null,
): WeekStripDay[] {
  const letters = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
  return letters.map((letter, i) => {
    const iso = weekDayIso(i)
    let state: WeekDayState
    // Días previos a tu inicio = tenues (no "salteados"): no eras usuario aún.
    if (startIso && iso < startIso) state = 'future'
    else if (activityIso.has(iso)) state = 'logged'
    // Día que un escudo recuperó: coral (ni "logged" orgánico ni "salteado").
    else if (recoveredIso.has(iso)) state = 'recovered'
    else if (iso > todayIso) state = 'future'
    else if (iso === todayIso) state = 'pending'
    else state = 'missed'
    return { letter, iso, state, isToday: iso === todayIso }
  })
}
