// Persona inference — derives a coarse user profile from interaction
// stats so copy and ranking can adapt. While the Memory Layer migration
// is pending, this module always falls back to the `'planner'` default
// (the safest, most analytical framing). Once `advisor_interactions`
// rows exist, the inference rules in v2 §17.3 kick in.
//
// Design notes:
//  - Pure function — no side effects, deterministic on input.
//  - Stays small: 4 personas, 3 framings. The copy variants live in
//    `control-signals-copy.ts` (added gradually, opt-in per signal).
//  - Default to `'planner'` for cold-start because analytical / neutral
//    framing has the lowest risk of irritating power users; the
//    avoiders / firefighters get re-classified as soon as we have ≥10
//    `shown_only` interactions.

import type { InteractionStats } from '@/features/insights/use-interaction-stats'

export type UserPersona = 'planner' | 'firefighter' | 'avoider' | 'optimizer'

export type CopyFraming = 'loss' | 'gain' | 'neutral'

export interface PersonaProfile {
  framing: CopyFraming
  /** Short label used in `/settings/asistente` copy. */
  label: string
  /** One-line description shown to the user. */
  description: string
}

export const PERSONA_PROFILES: Record<UserPersona, PersonaProfile> = {
  planner: {
    framing: 'neutral',
    label: 'Planificador',
    description: 'Priorizo análisis sobre alertas. Datos primero.',
  },
  firefighter: {
    framing: 'loss',
    label: 'Reactivo',
    description: 'Te aviso cuando hay algo urgente; el resto del tiempo, pocas interrupciones.',
  },
  avoider: {
    framing: 'gain',
    label: 'Conservador',
    description: 'Tono suave y enfoque en pequeñas mejoras posibles.',
  },
  optimizer: {
    framing: 'gain',
    label: 'Optimizador',
    description: 'Busco oportunidades de ahorro y momentum positivo.',
  },
}

/** Signals classified as CRITICAL for the persona inference. */
const CRITICAL_FAMILIES = new Set([
  'recovery-hard',
  'recovery-soft',
  'fijos-ratio',
  'velocity',
  'income-missing',
  'forecast-payday-gap',
  'forecast-storm-week',
  'super-perfect-storm',
  'cap',
])

/** Signals classified as INSIGHT (analytical patterns).
 *  Family names match `signalFamilyOf()` output: payload-bearing ids
 *  collapse to their prefix (`causal`, `duplicate`, `cat-dominance`,
 *  `member-imbalance`), atomics stay as their full id. */
const INSIGHT_FAMILIES = new Set([
  'small-leaks',
  'night-impulse',
  'cat-dominance',
  'weekly-pattern',
  'duplicate',
  'cat-accel',
  'super-hidden-drain',
  'causal',
  'member-imbalance',
])

/** Signals classified as POSITIVE (reinforcement / opportunities). */
const POSITIVE_FAMILIES = new Set([
  'streak-ok',
  'cat-win',
  'positive-forecast',
  'savings-over',
  'savings-milestone',
  'super-savings-momentum',
])

function avgCtrFor(
  stats: InteractionStats,
  families: Set<string>,
): { ctr: number; sample: number } {
  let actedSum = 0
  let shownSum = 0
  for (const [family, s] of Object.entries(stats.perFamily)) {
    if (!families.has(family)) continue
    actedSum += s.acted
    shownSum += s.shown
  }
  return {
    ctr: shownSum > 0 ? Math.min(1, actedSum / shownSum) : 0,
    sample: shownSum,
  }
}

/**
 * Map an `InteractionStats` snapshot to a persona. Defaults to
 * `'planner'` while there's not enough sample (<10 shown interactions).
 *
 * The thresholds match v2 §17.3 — they are deliberately wide so the
 * persona doesn't oscillate between adjacent buckets on every CTR
 * fluctuation.
 */
export function inferPersona(stats: InteractionStats): UserPersona {
  if (stats.overall.totalShown < 10) return 'planner'

  const overallCtr = stats.overall.overallCtr
  if (overallCtr < 0.1) return 'avoider'

  const critical = avgCtrFor(stats, CRITICAL_FAMILIES)
  const insight = avgCtrFor(stats, INSIGHT_FAMILIES)
  const positive = avgCtrFor(stats, POSITIVE_FAMILIES)

  // Firefighter — only acts on critical pages.
  if (
    critical.sample >= 3 &&
    critical.ctr > 0.5 &&
    insight.ctr < 0.15
  ) {
    return 'firefighter'
  }

  // Optimizer — engages with positive / savings signals.
  if (positive.sample >= 3 && positive.ctr > 0.4) {
    return 'optimizer'
  }

  // Default to planner: balanced, insight-leaning.
  return 'planner'
}

/** Return the framing for a given persona. Centralizes the lookup so
 *  builders don't depend on the profile constant directly. */
export function framingFor(persona: UserPersona): CopyFraming {
  return PERSONA_PROFILES[persona].framing
}
