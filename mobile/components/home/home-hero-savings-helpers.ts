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
import i18n from '@/lib/i18n'

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

  // Copy compacto — labels cortos para que entren en el chip sin
  // wraparound. El a11y mantiene la versión larga con contexto
  // completo para screen readers.

  if (remaining <= 0) {
    return {
      kind: 'consumed',
      label: i18n.t('home:savingsHero.consumedLabel'),
      a11y: i18n.t('home:savingsHero.consumedA11y', {
        target: formatMoney(target),
      }),
    }
  }

  if (remaining >= target) {
    return {
      kind: 'healthy',
      label: i18n.t('home:savingsHero.healthyLabel', {
        target: formatMoneyShort(target),
      }),
      a11y: i18n.t('home:savingsHero.healthyA11y', {
        context: percent > 0 ? 'withPercent' : undefined,
        target: formatMoney(target),
        percent,
      }),
    }
  }

  // "X de meta Y" en vez de "X de Y" — la palabra "meta" ancla el
  // segundo número como objetivo, sin esto el "1.1 de 1.4" leía como
  // dos números sin relación obvia (owner feedback 2026-06-08).
  return {
    kind: 'partial',
    label: i18n.t('home:savingsHero.partialLabel', {
      remaining: formatMoneyShort(remaining),
      target: formatMoneyShort(target),
    }),
    a11y: i18n.t('home:savingsHero.partialA11y', {
      context: percent > 0 ? 'withPercent' : undefined,
      remaining: formatMoney(remaining),
      target: formatMoney(target),
      percent,
    }),
  }
}
