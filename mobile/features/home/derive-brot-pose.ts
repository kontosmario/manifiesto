/**
 * Pose reactiva del Brot en el header de la Home rediseñada — FASE 2 del
 * cableado (plan `design/home-final-2026-07/PLAN-CABLEADO.md` §F2.3).
 *
 * Regla del handoff (README:53-54): "la racha manda sobre el horario, nunca
 * dos reacciones a la vez". Derivación PURA: recibe señales ya resueltas
 * (nada de hooks ni `Date.now()` — el caller pasa `hour`), sin Intl.
 *
 * Precedencia EXACTA del plan:
 *   love (registró hoy) > cheer (semana perfecta) > sad (cortada) >
 *   worried (at_risk urgent/critical) > idle (at_risk calm/gentle) >
 *   pose del momento del día.
 *
 * DECISIÓN DOCUMENTADA (sleep nocturno): README:53 pide `sleep` de noche
 * SOLO si ya registró, y README:54 pide `love` si registró hoy. Con la
 * precedencia estricta, `sleep` sería inalcanzable (registró ⇒ `love`
 * siempre). Resolución: el slot 1 ("registró hoy") resuelve POR MOMENTO —
 * de día `love` (reacción), de noche `sleep` (día completado, saludo
 * nocturno del catálogo). Sin registrar, la noche NUNCA muestra `sleep`
 * (cae a `worried`/`idle` por at_risk, o a `idle` como fallback del
 * momento noche).
 *
 * Bandas horarias — DECISIÓN DOCUMENTADA: mandan las de `getGreeting`
 * (`home-dashboard-model.ts:110-115`: <6 noche · <13 mañana · <20 tarde ·
 * ≥20 noche) para NO cambiar el saludo actual de la app. El emoji-set del
 * mockup sugería bandas distintas (metrics-model §13) — se alinea acá.
 * Coinciden además con las bandas de `resolveAtRiskIntensity`
 * (`use-streak.ts:433-438`): la noche (≥20 o <6) sin registrar es
 * `critical` → `worried`, nunca un `idle` nocturno incoherente.
 */

import type { BrotPose } from '@/components/brot/brot-mascot'
import type { AtRiskIntensity } from '@/features/streaks/use-streak'
import type { HomeMoment } from '@/components/redesign/home/home-spec'

/** Niveles REALES de `use-streak.ts` (`AtRiskIntensity`) + 'none' (sin
 *  riesgo: racha activa ya registrada, usuario nuevo sin racha, etc.). */
export type HomeBrotAtRiskLevel = 'none' | AtRiskIntensity

/** Subconjunto de `BROT_POSES` que la Home puede emitir (compile-time check
 *  contra el catálogo real de `brot-mascot.tsx`). */
export type HomeBrotPose = Extract<
  BrotPose,
  'love' | 'cheer' | 'sad' | 'worried' | 'idle' | 'wave' | 'sleep'
>

export interface DeriveHomeBrotPoseInput {
  /** `use-streak.ts` — `last_logged_date === todayIso`. */
  hasLoggedToday: boolean
  /** 7/7 orgánico de la semana VIVA (`weekStrip` todo `logged` — el escudo
   *  NO fabrica floración, y `weekClose` es la semana PASADA: usarlo dejaba
   *  la floración pegada 7 días de más y pisaba broken/at-risk). */
  isPerfectWeek: boolean
  /** `use-streak.ts:250-258` — server-authoritative + heurística cliente. */
  isBroken: boolean
  /** `deriveStreak().atRiskIntensity` cuando status === 'at_risk';
   *  'none' en cualquier otro caso. */
  atRiskLevel: HomeBrotAtRiskLevel
  /** Hora local 0-23 (`new Date().getHours()` del caller — acá no hay
   *  `Date.now()`). */
  hour: number
}

/**
 * Momento del día para el saludo del header (emoji + copy vía
 * `HOME_MOMENTS`, `home-spec.ts`) y para el fallback de pose. Bandas =
 * `getGreeting` (ver header del módulo). Entrada no finita → 'tarde'
 * (estado base del mockup aprobado).
 */
export function deriveHomeMoment(hour: number): HomeMoment {
  if (!Number.isFinite(hour)) return 'tarde'
  if (hour < 6) return 'noche'
  if (hour < 13) return 'manana'
  if (hour < 20) return 'tarde'
  return 'noche'
}

/** Pose base por momento cuando NINGUNA reacción de racha aplica. `noche`
 *  cae a `idle` (no `sleep`): el sleep nocturno exige haber registrado
 *  (README:53) y ese caso ya lo resuelve el slot 1 de la precedencia. */
const MOMENT_FALLBACK_POSE: Record<HomeMoment, HomeBrotPose> = {
  manana: 'wave',
  tarde: 'idle',
  noche: 'idle',
}

export function deriveHomeBrotPose(input: DeriveHomeBrotPoseInput): HomeBrotPose {
  const { hasLoggedToday, isPerfectWeek, isBroken, atRiskLevel, hour } = input
  const moment = deriveHomeMoment(hour)

  // 1 · Registró hoy — love de día, sleep de noche (ver decisión arriba).
  if (hasLoggedToday) return moment === 'noche' ? 'sleep' : 'love'
  // 2 · Semana perfecta (7/7 orgánico).
  if (isPerfectWeek) return 'cheer'
  // 3 · Racha cortada.
  if (isBroken) return 'sad'
  // 4-5 · En riesgo (sin registrar hoy), por intensidad horaria.
  if (atRiskLevel === 'urgent' || atRiskLevel === 'critical') return 'worried'
  if (atRiskLevel === 'calm' || atRiskLevel === 'gentle') return 'idle'
  // 6 · Sin reacción de racha → pose del momento del día.
  return MOMENT_FALLBACK_POSE[moment]
}
