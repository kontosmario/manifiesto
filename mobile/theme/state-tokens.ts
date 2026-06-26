// Single source of truth for "how the app expresses state" — green
// (good), yellow (watch), red (act), gray (no signal yet). Every
// surface that needs to communicate severity (state pills, urgency
// stripes, advisor card tones, gauge tints, chart bars) should pull
// its color + icon + canonical label from here so the user learns
// ONE pattern across the whole product.
//
// Before this module the app had 7 distinct vocabularies (ok/warn/
// critical, good/fine/warn/critical, green/yellow/red/null, alta/
// media/baja, fuerte/leve/plano, etc.) and 3 incompatible color
// systems (theme.colors.*, controlV2Tokens, hex literals in chart
// bars). The result was the same conceptual state surfacing as two
// or three different colors within a single screen — hence the
// "intermediate" / "unclear" complaint.
//
// Rule: any new feature MUST use `getStateTokens(state, theme)`.
// Hardcoding hex for state-bearing surfaces is now a code-review
// rejection.

import type { ComponentProps } from 'react'
import type { MaterialIcons } from '@expo/vector-icons'
import type { AppTheme } from '@/theme/palette'
import i18n from '@/lib/i18n'

/**
 * Four universal states. Pick one — there is no fifth.
 *  - `positive`  → user is doing well, nothing to do.
 *  - `caution`   → something changed, worth a look, not urgent.
 *  - `critical`  → action recommended now.
 *  - `neutral`   → no signal yet (cycle just started, awaiting data).
 *
 * Note: `caution` covers what the legacy code called "warn" / "media"
 * / "yellow" / "leve". `critical` covers "alta" / "red" / "fuerte" /
 * "critical". `positive` covers "good" / "ok" / "green" / "baja"
 * (when used as positive reinforcement). `neutral` covers "null" and
 * "plano" (no opinion yet).
 */
export type SemanticState = 'positive' | 'caution' | 'critical' | 'neutral'

type IconName = ComponentProps<typeof MaterialIcons>['name']

export interface StateTokens {
  /** Foreground color — primary identifier. Use for label, icon,
   *  state pill text, urgency stripe, gauge stroke. */
  fg: string
  /** Soft tinted background — usable for state pills, callout boxes
   *  and any "filled but understated" surface. */
  bg: string
  /** Border color — fg with low alpha. Pairs with `bg` for
   *  full state-styled surfaces. */
  border: string
  /** A "lighter sister" of fg, used for chart fills, gauge tints,
   *  and accent gradients. Same hue, more luminous. */
  fillSoft: string
  /** Canonical icon for this state. */
  icon: IconName
  /** Canonical 2-word label, e.g. "Vas bien". Cards may add a
   *  sub-label after a · separator with the contextual nuance. */
  label: string
}

/**
 * Build the tokens for a given state. The output respects the
 * current theme (light/dark) so the same call site reads identically
 * in both modes.
 */
export function getStateTokens(state: SemanticState, theme: AppTheme): StateTokens {
  switch (state) {
    case 'positive':
      return {
        fg: theme.colors.success,
        bg: hexAlpha(theme.colors.success, 0.14),
        border: hexAlpha(theme.colors.success, 0.35),
        fillSoft: hexAlpha(theme.colors.success, 0.55),
        icon: 'check-circle',
        label: i18n.t('states:semantic.positive'),
      }
    case 'caution':
      return {
        fg: theme.colors.warning,
        bg: hexAlpha(theme.colors.warning, 0.14),
        border: hexAlpha(theme.colors.warning, 0.35),
        fillSoft: hexAlpha(theme.colors.warning, 0.55),
        icon: 'priority-high',
        label: i18n.t('states:semantic.caution'),
      }
    case 'critical':
      return {
        fg: theme.colors.danger,
        bg: hexAlpha(theme.colors.danger, 0.14),
        border: hexAlpha(theme.colors.danger, 0.35),
        fillSoft: hexAlpha(theme.colors.danger, 0.55),
        icon: 'error-outline',
        label: i18n.t('states:semantic.critical'),
      }
    case 'neutral':
      return {
        fg: theme.colors.textMuted,
        bg: hexAlpha(theme.colors.textMuted, 0.10),
        border: hexAlpha(theme.colors.textMuted, 0.20),
        fillSoft: hexAlpha(theme.colors.textMuted, 0.40),
        icon: 'schedule',
        // Reusa la key canónica del empty-state "Sin datos" (states:empty.noData.title).
        label: i18n.t('states:empty.noData.title'),
      }
  }
}

/**
 * Maps the legacy 3-tier urgency used by the advisor signal engine
 * to the unified state system. `alta` → critical, `media` → caution,
 * `baja` → neutral (informational by default). Callers should
 * promote to `positive` when the task is genuinely a celebratory
 * reinforcement (streak-ok, cat-win, savings-over) using the
 * `REINFORCEMENT_TASK_IDS` set.
 */
export function urgencyToState(
  urgency: 'alta' | 'media' | 'baja',
): SemanticState {
  switch (urgency) {
    case 'alta':
      return 'critical'
    case 'media':
      return 'caution'
    case 'baja':
      return 'neutral'
  }
}

/**
 * IDs of advisor signals that are positive reinforcement — they
 * should render in `positive` (green) regardless of their `baja`
 * urgency tag. Without this set the Asesor card has no green at all.
 */
export const REINFORCEMENT_TASK_IDS: ReadonlySet<string> = new Set([
  'streak-ok',
  'cat-win',
  'savings-over',
  'positive-forecast',
])

/** Hex `#RRGGBB` (or `#RGB`) → `rgba(r, g, b, a)`. */
export function hexAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const expanded =
    clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean
  if (expanded.length !== 6) return hex
  const r = parseInt(expanded.slice(0, 2), 16)
  const g = parseInt(expanded.slice(2, 4), 16)
  const b = parseInt(expanded.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
