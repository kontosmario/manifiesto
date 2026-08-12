// Derivación PURA del jardín (sin React, sin Supabase). La madurez del
// brote depende de la ANTIGÜEDAD del día (no de la posición). Días
// salteados NO rompen el jardín (decisión "sin culpa"): se muestran como
// brote tenue. Refleja la lógica del prototipo de diseño (renderVals()).

import i18n from '@/lib/i18n'
// Type-only: `crecimiento-model` importa `isoDay` de ACÁ, así que un import de
// valor cerraría el ciclo. `import type` se borra en compilación (tsc y Babel),
// así que el grafo de módulos en runtime sigue siendo unidireccional.
import type { CountsPorDia } from './crecimiento-model'

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

/**
 * Las 4 variantes del cierre de semana del rediseño 2026-08 (§5 del plan).
 * Espejo del tipo del kit (`redesign/jardin/cierre-screen` y `jardin-screen`,
 * que son unions de strings idénticas): vive ACÁ, igual que `HistoryDot`, para
 * que el modelo puro y el hook no importen un módulo de componentes (que
 * arrastra Skia) sólo por un tipo. Al ser una union estructural, lo que el
 * modelo devuelve entra tal cual en `SemanaPasadaVM.variant` y en
 * `CierreVM.variant` — si alguna de las tres listas se desalinea, tsc lo caza
 * en el cableado (`garden-screen`).
 */
export type WeekCloseVariant = 'perfecta' | 'buena' | 'floja' | 'cortada'

export interface WeekCloseDay {
  letter: string
  registered: boolean
  recovered: boolean
  /**
   * Día EN CALMA: marcado sin gastos y sin un solo gasto discrecional (misma
   * regla que `deriveDayRings` y que el historial). `registered` no alcanza
   * para saberlo — `familyActivityDays` funde marcas y gastos en un solo set,
   * así que sin esto un día marcado es indistinguible de uno con compras.
   */
  calma: boolean
}

export interface WeekClose {
  score: number
  /** El tramo del cierre (4 variantes). Ver `weekCloseCopy`. */
  variant: WeekCloseVariant
  /**
   * Madurez del jardín de esa semana en la escala VIEJA (5 tramos por score).
   * Se conserva —igual que `bloom`— porque lo consumen la celebración legacy y
   * el preview de la intro pre-auth (`INTRO_WEEK_CLOSE`); la vista nueva del
   * cierre se guía por `variant`.
   */
  stage: 'none' | 'seed' | 'germ' | 'fern'
  bloom: boolean
  label: string
  title: string
  sub: string
  days: WeekCloseDay[]
}

/** Opciones de `deriveWeekClose` (todas opcionales: sin ellas el resultado es
 *  el de siempre, con `calma: false` en los 7 días). */
export interface WeekCloseOptions {
  /**
   * Racha VIVA al momento de mirar el cierre (`!isBroken && currentStreak > 0`).
   * Es la guarda del tramo `cortada`: un score ≤1 NO implica racha cortada — si
   * la única actividad de la semana fue el domingo, la racha cruza viva al
   * lunes y decir "Tu racha se cortó" sería mentir.
   */
  streakAlive?: boolean
  /** Días marcados "sin gastos" del hogar (`useStreak.markedDaysIso`). */
  markedDaysIso?: readonly string[] | ReadonlySet<string>
  /** Gastos DISCRECIONALES por día (`familyActivityWithCounts`): un día marcado
   *  con `force` sobre compras es un día completo, nunca un día en calma. */
  discrecionalesPorDia?: ReadonlyMap<string, number>
}

export const GARDEN_COLS = 7
export const GARDEN_ROWS = 5
export const GARDEN_CELLS = GARDEN_COLS * GARDEN_ROWS // 35

/**
 * Día local `YYYY-MM-DD` en la tz dada — el MISMO corte de día que usa
 * el server (`family_local_timezone` en el trigger). en-CA + IANA tz;
 * NO usar UTC (un gasto a la noche local caía en el día siguiente).
 * Fuente única: antes vivía copiado en use-streak y use-garden.
 */
export function isoDay(d: Date, timeZone: string): string {
  return d.toLocaleDateString('en-CA', { timeZone })
}

/** Tz IANA del dispositivo, con el fallback del proyecto. */
export function resolveDeviceTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz && tz.length > 0 ? tz : 'America/Argentina/Buenos_Aires'
  } catch {
    return 'America/Argentina/Buenos_Aires'
  }
}

/**
 * Set de días-con-actividad DEL HOGAR (jardín familiar, 2026-07-08):
 * el gasto de CUALQUIER miembro ∪ los días marcados sin-gasto plantan
 * el brote del día para toda la familia. No filtra por CUÁL miembro —
 * ese es el punto del cambio — pero SÍ excluye created_by NULL (autor
 * de cuenta borrada): el trigger del server, recompute_family_streak y
 * el weekActivity de use-streak los ignoran; sin este espejo el jardín
 * pintaba brotes en días que la racha cuenta como huecos.
 */
export function familyActivityDays(
  expenses: ReadonlyArray<{ created_at: string; created_by: string | null }>,
  markedDaysIso: readonly string[],
  tz: string,
): Set<string> {
  return familyActivityWithCounts(expenses, markedDaysIso, tz).activity
}

/**
 * El set de actividad del hogar Y los conteos por día, en UNA sola pasada.
 *
 * El aro de crecimiento (§3 del rediseño 2026-08) necesita cuántos gastos tuvo
 * cada día; la racha necesita si tuvo alguno. Derivarlos por separado sobre el
 * mismo cache abría la puerta a que divergieran (dos filtros que hay que
 * mantener iguales a mano): acá el filtro es LITERALMENTE el mismo recorrido.
 *
 *  · `activity`             → días plantados: gasto de cualquier miembro con
 *                             `created_by` no-null ∪ días marcados sin-gasto.
 *  · `counts.todos`         → espejo exacto de ese filtro, contando (pagos de
 *                             fijos incluidos).
 *  · `counts.discrecionales`→ además excluye `commitment_id`: es la definición
 *                             de "día sin gastos" del server
 *                             (`mark_no_expense_day`), la que decide si un día
 *                             marcado es de verdad un día EN CALMA.
 *
 * Los días marcados entran a `activity` pero NO a los counts: no son gastos.
 */
export function familyActivityWithCounts(
  expenses: ReadonlyArray<{
    created_at: string
    created_by: string | null
    commitment_id?: string | null
  }>,
  markedDaysIso: readonly string[],
  tz: string,
): { activity: Set<string>; counts: CountsPorDia } {
  const activity = new Set<string>(markedDaysIso)
  const todos = new Map<string, number>()
  const discrecionales = new Map<string, number>()
  for (const e of expenses) {
    if (!e.created_by) continue
    const iso = isoDay(new Date(e.created_at), tz)
    activity.add(iso)
    todos.set(iso, (todos.get(iso) ?? 0) + 1)
    if (!e.commitment_id) discrecionales.set(iso, (discrecionales.get(iso) ?? 0) + 1)
  }
  return { activity, counts: { todos, discrecionales } }
}

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

/**
 * Score 0–7 de la semana L→D → variante del cierre (§5, rediseño 2026-08):
 *
 *   7        → `perfecta`   (la única que florece)
 *   6, 5     → `buena`
 *   4, 3, 2  → `floja`
 *   1, 0     → `cortada`, salvo que la racha siga VIVA → `floja`
 *
 * La guarda de la racha viva no es un detalle de copy: el score cuenta los días
 * de la semana CERRADA, y una semana cuya única actividad fue el domingo deja
 * la racha cruzando viva al lunes. Anunciar "Tu racha se cortó" ahí sería
 * mentir sobre el dato que la pantalla misma muestra al lado.
 */
export function weekCloseVariant(score: number, opts?: WeekCloseOptions): WeekCloseVariant {
  if (score >= 7) return 'perfecta'
  if (score >= 5) return 'buena'
  if (score >= 2) return 'floja'
  return opts?.streakAlive ? 'floja' : 'cortada'
}

/**
 * Variante + copy + la madurez legacy (`stage`/`bloom`, conservada para la
 * celebración vieja y el preview de la intro; sus cortes NO cambiaron).
 */
export function weekCloseCopy(
  score: number,
  opts?: WeekCloseOptions,
): {
  variant: WeekCloseVariant
  stage: WeekClose['stage']
  bloom: boolean
  label: string
  title: string
  sub: string
} {
  const variant = weekCloseVariant(score, opts)
  // Escala vieja de madurez, intacta: fern ≥5 · germ ≥3 · seed ≥1 · none 0.
  const stage: WeekClose['stage'] =
    score >= 5 ? 'fern' : score >= 3 ? 'germ' : score >= 1 ? 'seed' : 'none'
  return {
    variant,
    stage,
    bloom: score >= 7,
    label: i18n.t(`garden:weekClose.${variant}.label`),
    title: i18n.t(`garden:weekClose.${variant}.title`),
    sub: i18n.t(`garden:weekClose.${variant}.sub`),
  }
}

/**
 * `weekDayIso(i)` devuelve el ISO del día i de la semana (0=Lunes..6=Domingo).
 * `opts` trae la guarda de racha viva y las dos fuentes que hacen falta para
 * marcar los días EN CALMA (ver `WeekCloseOptions`).
 */
export function deriveWeekClose(
  activityIso: ReadonlySet<string>,
  recoveredIso: ReadonlySet<string>,
  weekDayIso: (dayIndexMonday0: number) => string,
  opts?: WeekCloseOptions,
): WeekClose {
  const letters = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
  const marked = new Set<string>(opts?.markedDaysIso ?? [])
  const discrecionales = opts?.discrecionalesPorDia
  const days: WeekCloseDay[] = letters.map((letter, i) => {
    const iso = weekDayIso(i)
    const registered = activityIso.has(iso)
    return {
      letter,
      registered,
      // Día recuperado por un escudo: NO es actividad orgánica, pero tampoco un
      // salteado — se muestra distinto (coral) en la celebración.
      recovered: !registered && recoveredIso.has(iso),
      // MISMA regla que `deriveDayRings` y `historyDotFor`: marcado y sin un
      // solo gasto discrecional. Un marcado con `force` sobre un día con
      // compras es un día completo, no un día en calma.
      calma: marked.has(iso) && (discrecionales?.get(iso) ?? 0) === 0,
    }
  })
  // El score cuenta SOLO días orgánicos: 6 orgánicos + 1 recuperado es "gran
  // semana" (6/7), nunca "perfecta" — el escudo salva la racha, no fabrica una
  // floración (la floración sigue exigiendo 7/7 orgánico en deriveGardenCells).
  const score = days.filter((d) => d.registered).length
  const copy = weekCloseCopy(score, opts)
  return { score, ...copy, days }
}

// ── Historial de semanas anteriores (rediseño 2026-08) ─────────────────

/**
 * Dot de una semana pasada en el resumen de la card y en el sheet de
 * historial. Espejo del `HistoryDot` del kit (`redesign/jardin/jardin-screen`);
 * vive acá para que el hook no tenga que importar un módulo de componentes
 * (que arrastra Skia) sólo por un tipo.
 */
export type HistoryDot = 'full' | 'calma' | 'missed' | 'recovered' | 'pre'

/** El resumen muestra 2 filas y el sheet hasta 4 semanas (README:56). */
export const HISTORY_MAX_WEEKS = 4

interface HistoryDotInput {
  activityIso: ReadonlySet<string>
  markedDaysIso: ReadonlySet<string>
  discrecionalesPorDia: ReadonlyMap<string, number>
  recoveredIso: ReadonlySet<string>
  startIso: string | null
}

/**
 * Un día del historial. El orden es el MISMO de `deriveDayRings` y de
 * `deriveGardenCells` (logged-first): primero "sin culpa" (previo al primer
 * brote), después la calma, después lo plantado, después el escudo, y recién
 * ahí lo perdido. Sin el orden, un día recuperado por escudo que después
 * recibió un gasto back-dateado se pintaría coral en vez de verde.
 */
function historyDotFor(iso: string, a: HistoryDotInput): HistoryDot {
  // Sin ningún brote todavía no hay jardín que juzgar: todo es previo.
  if (a.startIso === null || iso < a.startIso) return 'pre'
  const marcado = a.markedDaysIso.has(iso)
  if (marcado && (a.discrecionalesPorDia.get(iso) ?? 0) === 0) return 'calma'
  if (a.activityIso.has(iso)) return 'full'
  if (a.recoveredIso.has(iso)) return 'recovered'
  return 'missed'
}

/**
 * Hasta `HISTORY_MAX_WEEKS` semanas calendario ANTERIORES a la vigente, L→D.
 * `rows[0]` es la semana pasada (más reciente primero, como el sheet del
 * handoff). Con `weeksShown <= 1` no hay historial: devuelve `[]` y el
 * llamador manda `null` al VM (matriz ②9, "primera semana").
 */
export function deriveHistoryWeeks(
  a: HistoryDotInput & { todayIso: string; weeksShown: number },
): HistoryDot[][] {
  const weeks = Math.min(HISTORY_MAX_WEEKS, Math.max(0, a.weeksShown - 1))
  if (weeks <= 0) return []
  const currentMonday = utcDays(a.todayIso) - dowMonday0(a.todayIso)
  const rows: HistoryDot[][] = []
  for (let w = 1; w <= weeks; w++) {
    const monday = currentMonday - w * GARDEN_COLS
    const row: HistoryDot[] = []
    for (let d = 0; d < GARDEN_COLS; d++) {
      row.push(historyDotFor(isoFromUtcDays(monday + d), a))
    }
    rows.push(row)
  }
  return rows
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
