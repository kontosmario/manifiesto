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

export function broteStageForDay(
  ageDays: number,
  logged: boolean,
  isPreTracking: boolean,
): BroteStage {
  if (isPreTracking) return 'pre'
  if (ageDays === 0 && !logged) return 'pending'
  if (!logged) return 'missed'
  if (ageDays <= 6) return 'seed'
  if (ageDays <= 13) return 'germ'
  return 'fern'
}

/**
 * 35 celdas, índice 0 = 34 días atrás (más viejo), índice 34 = hoy.
 * `dayIsoAtOffset(offset)` devuelve el ISO del día `offset` días atrás
 * (offset 0 = hoy) en el timezone local del usuario.
 */
export function deriveGardenCells(
  activityIso: ReadonlySet<string>,
  todayIso: string,
  dayIsoAtOffset: (offset: number) => string,
  firstActivityIso: string | null,
): GardenCell[] {
  const cells: GardenCell[] = []
  for (let i = 0; i < GARDEN_CELLS; i++) {
    const ageDays = GARDEN_CELLS - 1 - i // i=34 → age 0 (hoy)
    const iso = dayIsoAtOffset(ageDays)
    const logged = activityIso.has(iso)
    const isPreTracking = firstActivityIso !== null && iso < firstActivityIso
    const stage = broteStageForDay(ageDays, logged, isPreTracking)
    cells.push({
      iso,
      ageDays,
      stage,
      fernSize: stage === 'fern' ? fernSizeForAge(ageDays) : 26,
      isToday: iso === todayIso,
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
