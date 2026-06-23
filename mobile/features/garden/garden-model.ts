// Derivación PURA del jardín (sin React, sin Supabase). La madurez del
// brote depende de la ANTIGÜEDAD del día (no de la posición). Días
// salteados NO rompen el jardín (decisión "sin culpa"): se muestran como
// brote tenue. Refleja la lógica del prototipo de diseño (renderVals()).

export type BroteStage = 'pre' | 'pending' | 'missed' | 'seed' | 'germ' | 'fern'

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
  days: Array<{ letter: string; registered: boolean }>
}

export const GARDEN_COLS = 7
export const GARDEN_ROWS = 5
export const GARDEN_CELLS = GARDEN_COLS * GARDEN_ROWS // 35

export function fernSizeForAge(ageDays: number): number {
  return Math.round(24 + Math.min((ageDays - 14) * 0.5, 8))
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
 * Estado del brote por antigüedad (días salteados no rompen). Días futuros de
 * la semana en curso y previos al primer registro = 'pre' (tile tenue).
 */
export function deriveGardenCells(
  activityIso: ReadonlySet<string>,
  todayIso: string,
  firstActivityIso: string | null,
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
    const isToday = n === todayN
    const isFuture = ageDays < 0
    const isPre = firstActivityIso !== null && iso < firstActivityIso
    let stage: BroteStage
    if (isFuture || isPre) stage = 'pre'
    else if (isToday && !logged) stage = 'pending'
    else if (!logged) stage = 'missed'
    else if (ageDays <= 6) stage = 'seed'
    else if (ageDays <= 13) stage = 'germ'
    else stage = 'fern'
    cells.push({
      iso,
      ageDays,
      stage,
      fernSize: stage === 'fern' ? fernSizeForAge(ageDays) : 26,
      isToday,
    })
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
      label: 'Semana perfecta',
      title: 'Tu jardín floreció.',
      sub: 'Registraste los 7 días. Cada brote llegó a su máximo.',
    }
  if (score >= 5)
    return {
      stage: 'fern',
      bloom: false,
      label: 'Gran semana',
      title: 'Casi pleno.',
      sub: 'La mayoría de tus brotes maduraron. Te faltó poco para el jardín completo.',
    }
  if (score >= 3)
    return {
      stage: 'germ',
      bloom: false,
      label: 'Semana en marcha',
      title: 'Vas tomando ritmo.',
      sub: 'Tus brotes están creciendo. Una semana más así y maduran del todo.',
    }
  if (score >= 1)
    return {
      stage: 'seed',
      bloom: false,
      label: 'Semana tranquila',
      title: 'Unos pocos brotes.',
      sub: 'Asomaron algunas semillas. Sin culpa — la próxima arrancás con todo.',
    }
  return {
    stage: 'none',
    bloom: false,
    label: 'Una pausa',
    title: 'Esta semana, descanso.',
    sub: 'No registraste días, y está bien. Tu jardín te espera intacto.',
  }
}

/** `weekDayIso(i)` devuelve el ISO del día i de la semana (0=Lunes..6=Domingo). */
export function deriveWeekClose(
  activityIso: ReadonlySet<string>,
  weekDayIso: (dayIndexMonday0: number) => string,
): WeekClose {
  const letters = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
  const days = letters.map((letter, i) => ({
    letter,
    registered: activityIso.has(weekDayIso(i)),
  }))
  const score = days.filter((d) => d.registered).length
  const copy = weekCloseCopy(score)
  return { score, ...copy, days }
}

// ── Tira semanal (widget de Home) ──────────────────────────────────────
export type WeekDayState = 'logged' | 'pending' | 'missed' | 'future'

export interface WeekStripDay {
  letter: string
  iso: string
  state: WeekDayState
  isToday: boolean
}

/**
 * Semana calendario L→D para el widget de Home. Cada día: registrado (logged),
 * hoy-sin-registrar (pending), pasado-sin-registrar (missed), o futuro (future).
 * `weekDayIso(i)` devuelve el ISO del día i (0=Lunes..6=Domingo). Los ISO
 * `YYYY-MM-DD` se comparan lexicográficamente = cronológicamente.
 */
export function deriveWeekStrip(
  activityIso: ReadonlySet<string>,
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
    else if (iso > todayIso) state = 'future'
    else if (iso === todayIso) state = 'pending'
    else state = 'missed'
    return { letter, iso, state, isToday: iso === todayIso }
  })
}
