/**
 * Progreso, secretos y medallas de los logros — derivación PURA (sin React,
 * sin Supabase, sin i18n). La pantalla de Logros del rediseño del jardín
 * (§4 y §5 del plan `2026-08-11-jardin-rediseno-integracion.md`) necesita
 * tres cosas que el catálogo de la DB no trae: cuánto falta para cada logro,
 * cuáles se muestran tapados, y qué se dibuja en el pozo de la medalla.
 *
 * Nada de esto toca el schema: el catálogo de 18 sigue igual y el otorgamiento
 * sigue siendo 100% server-side (triggers). Acá sólo se DERIVA lo que ya está
 * en el cliente.
 *
 * ── Barras sólo donde hay fuente confiable ──────────────────────────
 * Se dibuja barra únicamente para las dos familias con una fuente
 * cycle/lifetime correcta en el cliente:
 *  · `streak_*`          ← `currentStreak` (family_streaks, el mismo número
 *                          que el server usa para otorgarlos).
 *  · `no_spend_cycle_*`  ← `home_snapshot.no_spend_days_this_cycle`, la
 *                          ventana canónica del ciclo (la misma que ya usa
 *                          Gastos). NO `markedDaysIso` de `use-streak`: ese
 *                          select viene capado a los últimos 35 días
 *                          distintos (`use-streak.ts` `.limit(105)` + slice)
 *                          y su ventana no es la del ciclo — mostraría un
 *                          número que además puede BAJAR solo.
 *
 * Los otros 9 logros bloqueados salen sin barra (medalla-pozo + título +
 * body). En particular `no_spend_lifetime_50` no tiene fuente lifetime en el
 * cliente por el cap de arriba, y los `goal_*` viven en la meta activa: un
 * porcentaje de la meta de hoy no es el progreso del logro (el logro se
 * otorga por CUALQUIER meta que cruce el umbral, y la meta puede cambiar).
 * Ante la duda, `null` — una barra que miente es peor que no tener barra.
 */

import type { BrotPose } from '@/components/brot'

/** Umbrales que EXISTEN en el catálogo. La lista es explícita a propósito:
 *  parsear cualquier sufijo numérico dibujaría una barra para un code futuro
 *  cuya fuente todavía no cableamos (p. ej. los `garden_N` opcionales de T15). */
export const STREAK_TARGETS = [7, 14, 30, 60, 90] as const
export const NO_SPEND_CYCLE_TARGETS = [3, 7, 15] as const

export interface ProgressSources {
  /** Racha viva del hogar (`useStreak`). `null` mientras no cargó. */
  currentStreak: number | null
  /**
   * Días sin gasto del ciclo vigente (`home_snapshot.no_spend_days_this_cycle`).
   * `null` —nunca `0`— cuando el snapshot todavía no llegó o la RPC vieja no
   * trae el campo (es opcional por back-compat): con `0` se dibujarían barras
   * "0 de 15" falsas, y es justamente `null` lo que manda la fila sin barra.
   */
  cycleNoSpendCount: number | null
}

export interface LogroProgress {
  current: number
  target: number
}

/**
 * Lo que se dibuja en el pozo de una medalla (D3 del plan).
 *
 * `brot` es SÓLO para logros desbloqueados: `BrotMascot` no tiene prop de
 * tinte ni de opacidad y la variante apagada la dispara únicamente la pose
 * `wilted`, así que no existe forma de dibujar un Brot "bloqueado" sin tocar
 * `drawBrot`. Los 4 códigos de Brot, cuando están bloqueados, caen a `icon`.
 *
 * `locked` no lo emite `splitLogros` (una fila bloqueada sin barra muestra su
 * ícono en gris, que dice más que un "?"): existe para el stack de medallas
 * de `LogrosAccessCard` en el jardín, donde el hueco del logro que falta no
 * tiene un code puntual que mostrar.
 */
export type MedalVM =
  | { kind: 'brot'; pose: BrotPose }
  | { kind: 'icon'; code: string; earned: boolean }
  | { kind: 'progress'; current: number }
  | { kind: 'locked' }
  | { kind: 'secret' }

/** Los 4 hitos que SON la metáfora del jardín llevan Brot (D3). El resto usa
 *  el `FilledAchievementIcon` del registry existente. */
const BROT_MEDAL_POSES: Readonly<Record<string, BrotPose>> = {
  first_expense: 'seed', // "El primer brote"
  goal_completed: 'cheer', // "Meta florecida"
  streak_90: 'radiant', // "Leyenda viva"
  no_spend_lifetime_50: 'zen', // la quietud del no-gasto
}

export type LogroStatus = 'unlocked' | 'inProgress' | 'secret'

/**
 * Lo mínimo que `splitLogros` necesita de cada logro. `tier` se tipa `string`
 * —y no `AchievementTier`— porque el valor viene de la DB: `AchievementTier`
 * es asignable, y así el módulo puro no se cae si el catálogo suma un tier.
 */
export interface LogroSource {
  code: string
  tier: string
  earned: boolean
  sort_order: number
}

/**
 * Fila lista para la pantalla. Es genérica sobre la fuente para que el
 * `title`/`body` viajen tal cual vienen (el `AchievementViewItem` real los
 * trae del catálogo, y la pantalla los pisa con el bundle i18n vía
 * `achievementTitle`/`achievementBody`): este módulo no resuelve copy, así
 * que no lo exige en la entrada.
 * `onPress` lo agrega la pantalla —los secretos no abren sheet—.
 */
export type LogroRowVM<T extends LogroSource = LogroSource> = T & {
  status: LogroStatus
  medal: MedalVM
  /** Ausente = fila SIN barra. */
  progress?: LogroProgress
}

export interface LogrosSplit<T extends LogroSource = LogroSource> {
  unlocked: Array<LogroRowVM<T>>
  inProgress: Array<LogroRowVM<T>>
  secret: Array<LogroRowVM<T>>
  /** El logro que la pantalla propone como "próximo". `null` si no queda
   *  ninguno a la vista (colección completa o sólo secretos). */
  nudgeCode: string | null
}

/** Sufijo numérico de `<prefix><n>` si `n` es uno de los targets conocidos. */
function targetFromCode(
  code: string,
  prefix: string,
  targets: readonly number[],
): number | null {
  if (!code.startsWith(prefix)) return null
  const n = Number(code.slice(prefix.length))
  return targets.includes(n) ? n : null
}

/** El avance nunca pasa el objetivo ni baja de 0: una racha de 12 sobre
 *  `streak_7` es "7 de 7", no "12 de 7". */
function clampProgress(value: number | null, target: number): LogroProgress | null {
  if (value === null || !Number.isFinite(value)) return null
  return { current: Math.min(Math.max(value, 0), target), target }
}

/** Progreso de un logro, o `null` si no hay una fuente confiable en el
 *  cliente (ver el docblock del módulo). */
export function deriveAchievementProgress(
  code: string,
  sources: ProgressSources,
): LogroProgress | null {
  const streakTarget = targetFromCode(code, 'streak_', STREAK_TARGETS)
  if (streakTarget !== null) return clampProgress(sources.currentStreak, streakTarget)

  const cycleTarget = targetFromCode(code, 'no_spend_cycle_', NO_SPEND_CYCLE_TARGETS)
  if (cycleTarget !== null) return clampProgress(sources.cycleNoSpendCount, cycleTarget)

  return null
}

/**
 * Los secretos son los `legendary` todavía bloqueados — hoy exactamente dos
 * (`streak_90` y `no_spend_lifetime_50`), los mismos dos del mock. Es una
 * regla derivada del tier y no una lista fija para que un `legendary` nuevo
 * entre solo, sin tocar este archivo ni el schema.
 */
export function isSecretAchievement(a: { tier: string; earned: boolean }): boolean {
  return a.tier === 'legendary' && !a.earned
}

/** Medalla de un logro por su code y su estado (D3). */
export function medalForCode(code: string, earned: boolean): MedalVM {
  const pose = earned ? BROT_MEDAL_POSES[code] : undefined
  if (pose) return { kind: 'brot', pose }
  return { kind: 'icon', code, earned }
}

/**
 * El nudge es el bloqueado MÁS cerca de caer: mayor avance relativo, y a
 * igual avance el de menor `sort_order` (la lista ya viene ordenada, así que
 * el `>` estricto conserva al primero). Si ninguna fila tiene barra, se
 * propone la primera por `sort_order`: sin números para comparar, el orden
 * del catálogo ya es la progresión pensada.
 * Los secretos NUNCA nudgean — anunciarlos los deja de hacer secretos.
 */
function pickNudgeCode<T extends LogroSource>(
  inProgress: ReadonlyArray<LogroRowVM<T>>,
): string | null {
  let bestCode: string | null = null
  let bestRatio = -1
  for (const row of inProgress) {
    if (!row.progress || row.progress.target <= 0) continue
    const ratio = row.progress.current / row.progress.target
    if (ratio > bestRatio) {
      bestRatio = ratio
      bestCode = row.code
    }
  }
  return bestCode ?? inProgress[0]?.code ?? null
}

/**
 * Particiona el catálogo en las tres secciones de la pantalla y resuelve la
 * medalla de cada fila. Es el ÚNICO lugar donde se aplica la regla
 * status → rama de medalla (§5 del plan); ningún componente vuelve a decidir:
 *
 *   unlocked              → `medalForCode(code, true)`  ('brot' | 'icon' earned)
 *   inProgress CON barra  → 'progress'
 *   inProgress SIN barra  → 'icon' con `earned:false`  (incluye los 4 de Brot)
 *   secret                → 'secret'
 */
export function splitLogros<T extends LogroSource>(
  items: readonly T[],
  sources: ProgressSources,
): LogrosSplit<T> {
  const unlocked: Array<LogroRowVM<T>> = []
  const inProgress: Array<LogroRowVM<T>> = []
  const secret: Array<LogroRowVM<T>> = []

  for (const item of items) {
    if (item.earned) {
      unlocked.push({ ...item, status: 'unlocked', medal: medalForCode(item.code, true) })
      continue
    }
    if (isSecretAchievement(item)) {
      secret.push({ ...item, status: 'secret', medal: { kind: 'secret' } })
      continue
    }
    const progress = deriveAchievementProgress(item.code, sources)
    if (progress) {
      inProgress.push({
        ...item,
        status: 'inProgress',
        medal: { kind: 'progress', current: progress.current },
        progress,
      })
    } else {
      // Sin barra: la clave `progress` se OMITE (no `undefined`) — es lo que
      // lee la fila para decidir si dibuja la barra.
      inProgress.push({ ...item, status: 'inProgress', medal: medalForCode(item.code, false) })
    }
  }

  const bySortOrder = (a: LogroRowVM<T>, b: LogroRowVM<T>) => a.sort_order - b.sort_order
  unlocked.sort(bySortOrder)
  inProgress.sort(bySortOrder)
  secret.sort(bySortOrder)

  return { unlocked, inProgress, secret, nudgeCode: pickNudgeCode(inProgress) }
}
