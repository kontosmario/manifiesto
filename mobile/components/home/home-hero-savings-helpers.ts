// Pure helpers for the "Apartando ahorro" chip in the Home hero card.
//
// The hero already shows `availableToday`, but that figure folds the
// configured savings target back into the disponible (it bumps the
// number up when the user starts overspending). Without surfacing the
// target, the user can't tell that part of "lo disponible" is meant to
// stay set aside. This chip closes that gap with a single read-only
// line that mutates by state:
//
//   • healthy  → the savings buffer for this cycle is intact.
//   • partial  → some of the buffer was consumed by overspend.
//   • consumed → the entire monthly savings target was eaten — the
//     most actionable signal because variable spending has now
//     pierced the safety net.
//
// The helper is pure (no RN deps) so the state machine can be unit
// tested without rendering.

import { formatMoney, formatMoneyShort } from '@/utils/money'

export type SavingsHeroChipKind = 'healthy' | 'partial' | 'consumed'

export interface SavingsHeroChip {
  kind: SavingsHeroChipKind
  /** Pre-rendered Spanish label for the Text node. */
  label: string
  /** Composite a11y string — single sentence for screen readers. */
  a11y: string
}

export interface ComputeArgs {
  /** From `family_finance.savings_goal` (monthly target). 0 when not
   *  configured — chip should not render. */
  savingsGoal: number
  /** From the dashboard model: target minus what overspending already
   *  consumed in the current cycle. Clamped to ≥ 0 by the model. */
  savingsRemaining: number
  /** From `family_finance.savings_goal_percent`. Optional — when 0 we
   *  hide the "% del ingreso" suffix instead of rendering "· 0%". */
  savingsGoalPercent: number
  /** Reuses the hero's gate: when income isn't configured the entire
   *  savings model collapses to zero — never surface the chip. */
  incomeConfigured: boolean
}

/**
 * Build the chip payload. Returns null when there is no signal to
 * surface (income missing, savings target unset, or savings target ≤ 0).
 */
export function computeSavingsHeroChip(args: ComputeArgs): SavingsHeroChip | null {
  if (!args.incomeConfigured) return null
  const target = Math.max(0, Math.round(args.savingsGoal))
  if (target <= 0) return null

  const remaining = Math.max(0, Math.min(target, Math.round(args.savingsRemaining)))
  const percent = Math.max(0, Math.round(args.savingsGoalPercent ?? 0))
  const percentSuffix = percent > 0 ? ` · ${percent}%` : ''

  if (remaining <= 0) {
    return {
      kind: 'consumed',
      label: 'Te comiste el ahorro de este mes',
      a11y: `Aviso: tus gastos consumieron los ${formatMoney(target)} de ahorro previstos para este mes.`,
    }
  }

  if (remaining >= target) {
    return {
      kind: 'healthy',
      label: `Apartando ${formatMoneyShort(target)}${percentSuffix}`,
      a11y: `Estás apartando ${formatMoney(target)} de ahorro este mes${percent > 0 ? `, equivalente al ${percent} por ciento del ingreso` : ''}.`,
    }
  }

  return {
    kind: 'partial',
    label: `Apartando ${formatMoneyShort(remaining)} de ${formatMoneyShort(target)}${percentSuffix}`,
    a11y: `Estás apartando ${formatMoney(remaining)} de ${formatMoney(target)} previstos para este mes${percent > 0 ? `, ${percent} por ciento del ingreso` : ''}.`,
  }
}
