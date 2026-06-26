// Persona-aware copy variants for critical signals.
//
// The default body in each builder uses neutral framing (analytical /
// data-forward), which is what the `'planner'` persona (default and
// majority bucket) responds to best. For users inferred as
// `'firefighter'`, `'avoider'` or `'optimizer'` we substitute one of
// the variants below — same data, different psychological framing.
//
// We start narrow: only the three critical builders (recovery-hard,
// velocity, fijos-ratio) and the high-signal positive (positive-
// forecast). Other signals continue using their default body until we
// have evidence they're worth segmenting too.

import i18n from '@/lib/i18n'
import type { CopyFraming } from '@/features/insights/persona'

interface RecoveryHardCopyArgs {
  newCupo: string
  diasRestantes: number
  overspend: string
}

export function recoveryHardBody(
  framing: CopyFraming,
  args: RecoveryHardCopyArgs,
): string {
  return i18n.t(`insights:copy.recoveryHard_${framing}`, {
    newCupo: args.newCupo,
    diasRestantes: args.diasRestantes,
    overspend: args.overspend,
  })
}

interface VelocityCopyArgs {
  forecast: string
  momentumPct: number
  faster: boolean
  over: string | null
}

export function velocityBody(
  framing: CopyFraming,
  args: VelocityCopyArgs,
): string {
  // `over` = cuántos pesos de más vas a gastar respecto a lo planeado (o null).
  if (!args.faster) {
    return args.over
      ? i18n.t('insights:copy.velocitySlowerOver', { over: args.over })
      : i18n.t('insights:copy.velocitySlower')
  }
  const suffix = args.over ? '_over' : ''
  return i18n.t(`insights:copy.velocityFaster_${framing}${suffix}`, {
    over: args.over ?? '',
  })
}

interface FijosRatioCopyArgs {
  ratioPct: number
  excess: string
  comprometidoPct: number
}

export function fijosRatioBody(
  framing: CopyFraming,
  args: FijosRatioCopyArgs,
): string {
  return i18n.t(`insights:copy.fijosRatio_${framing}`, { excess: args.excess })
}

interface PositiveForecastCopyArgs {
  sobra: string
  proposed: string | null
  goalTitle: string | null
  diasRestantes: number
}

export function positiveForecastBody(
  framing: CopyFraming,
  args: PositiveForecastCopyArgs,
): string {
  if (args.goalTitle && args.proposed) {
    return i18n.t(`insights:copy.positiveForecastGoal_${framing}`, {
      sobra: args.sobra,
      proposed: args.proposed,
      goalTitle: args.goalTitle,
    })
  }
  return i18n.t(`insights:copy.positiveForecast_${framing}`, { sobra: args.sobra })
}
