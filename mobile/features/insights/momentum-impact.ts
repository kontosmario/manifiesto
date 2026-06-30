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
import { getIntlLocale } from '@/lib/i18n/active-locale'
import i18n from '@/lib/i18n'
import { isFiniteNumber } from '@/features/insights/signal-guards'

export interface MomentumImpact {
  /** Raw amount used for ranking + total impact banner. */
  impactRaw: number
  /** Time horizon — drives `annualizedImpact()` ranking math. */
  impactScope: 'monthly' | 'oneTime' | 'cycle'
  /** User-facing string. Always carries an explicit time anchor. */
  label: string
}

function fmt(n: number): string {
  // Guard: a non-finite `n` (NaN/±Infinity) would render "$NaN"/"$Infinity"
  // in the headline. Coerce to 0 so fmt() always produces a valid currency
  // string ("dato válido o ausente, nunca errático").
  const safe = isFiniteNumber(n) ? n : 0
  return '$' + Math.round(Math.abs(safe)).toLocaleString(getIntlLocale())
}

export function composeMomentumImpact(positive: ControlAdvisorTask): MomentumImpact {
  // Guard: `Math.max(0, Math.round(NaN/Infinity))` is still NaN, so a poisoned
  // upstream `impactRaw` would propagate into the ranking total + banner.
  // Reject non-finite or negative input → zero-impact headline (the module's
  // "no surplus to show" shape). Negative surplus is nonsensical for a
  // positive-momentum signal, so it also clamps to 0.
  const impactRaw = isFiniteNumber(positive.impactRaw)
    ? Math.max(0, Math.round(positive.impactRaw))
    : 0
  const impactScope = positive.impactScope ?? 'oneTime'
  const label = i18n.t('insights:signals.superSavings.impact', { amount: fmt(impactRaw) })
  return { impactRaw, impactScope, label }
}
