// Impact composition for the "Momentum positivo" super-signal
// (`super-savings-momentum`).
//
// Background: the previous composition computed
//   `positive.impactRaw + reinforcer.impactRaw * 12`
// which mixed two incompatible scopes — `positive-forecast` carries
// a cycle-scoped one-time excedente (e.g. $50k projected leftover at
// cycle close) while the reinforcer (`cat-win` / `savings-over`)
// carries a *monthly* delta. Multiplying the monthly figure × 12
// turned a $60k/mes delta into a $720k "annual" projection and the
// sum read like "+$770k a favor" with no time horizon — a fantasy
// headline that collapsed user trust the moment they did the math.
//
// New rule: the headline number is the cycle-scoped excedente from
// `positive-forecast`, full stop. The reinforcer (cat-win or
// savings-over) is supporting evidence in the body, not in the
// headline magnitude. Time horizon is explicit in the label
// ("a favor en el ciclo") so the user can never mistake it for
// annual or recurring.

import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'

export interface MomentumImpact {
  /** Raw amount used for ranking + total impact banner. */
  impactRaw: number
  /** Time horizon — drives `annualizedImpact()` ranking math. */
  impactScope: 'monthly' | 'oneTime' | 'cycle'
  /** User-facing string. Always carries an explicit time anchor. */
  label: string
}

function fmt(n: number): string {
  return '$' + Math.round(Math.abs(n)).toLocaleString('es-AR')
}

export function composeMomentumImpact(
  positive: ControlAdvisorTask,
  _reinforcer: ControlAdvisorTask,
): MomentumImpact {
  // Reinforcer is intentionally ignored for the headline — its role
  // is body copy, not magnitude. Keeping it as a parameter so the
  // call site stays expressive and future revisions (e.g. picking
  // the larger of two cycle-scoped figures) don't have to change
  // the signature.
  const impactRaw = Math.max(0, Math.round(positive.impactRaw))
  const impactScope = positive.impactScope ?? 'oneTime'
  const label = `+${fmt(impactRaw)} a favor en el ciclo`
  return { impactRaw, impactScope, label }
}
