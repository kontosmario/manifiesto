import type { AtRiskIntensity, StreakStatus } from '@/features/streaks/use-streak'

export interface StatusTone {
  fg: string
  soft: string
  /** Top-of-sheet gradient color that fades into the canvas. */
  heroWash: string
  cardBg: string
  cardBorder: string
}

/**
 * Status tone helper — generates theme-aware palette with a gentle
 * top wash so the hero reads distinct without a hard background block.
 */
export function getStatusTone(
  status: StreakStatus,
  intensity: AtRiskIntensity | null,
  isDark: boolean,
): StatusTone {
  switch (status) {
    case 'active':
      return {
        fg: isDark ? '#A6EF8F' : '#297811',
        soft: isDark ? 'rgba(166,239,143,0.72)' : 'rgba(41,120,17,0.72)',
        heroWash: isDark ? 'rgba(73,214,31,0.22)' : 'rgba(73,214,31,0.18)',
        cardBg: isDark ? 'rgba(73,214,31,0.10)' : 'rgba(73,214,31,0.08)',
        cardBorder: isDark ? 'rgba(73,214,31,0.28)' : 'rgba(73,214,31,0.24)',
      }
    case 'at_risk':
      return getAtRiskTone(intensity ?? 'calm', isDark)
    case 'broken':
      return {
        fg: isDark ? '#D4E8DF' : '#3B6D57',
        soft: isDark ? 'rgba(184,201,190,0.72)' : 'rgba(107,117,102,0.72)',
        heroWash: isDark ? 'rgba(138,138,138,0.18)' : 'rgba(138,138,138,0.12)',
        cardBg: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
        cardBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
      }
  }
}

/**
 * Progressive at-risk palette: green → yellow → orange → red as the
 * day advances in the user's local timezone. The progression is the
 * primary visual signal of urgency (paired with the time-aware copy
 * built in `use-streak.ts`). Each band keeps the same channel layout
 * (fg / soft / heroWash / cardBg / cardBorder) so the rest of the
 * sheet only needs to swap the four numbers — no conditional layout.
 */
export function getAtRiskTone(intensity: AtRiskIntensity, isDark: boolean): StatusTone {
  switch (intensity) {
    case 'calm':
      // Green — passes WCAG AA on cream/canvas in both themes.
      return {
        fg: isDark ? '#A6EF8F' : '#297811',
        soft: isDark ? 'rgba(166,239,143,0.72)' : 'rgba(41,120,17,0.72)',
        heroWash: isDark ? 'rgba(73,214,31,0.22)' : 'rgba(73,214,31,0.18)',
        cardBg: isDark ? 'rgba(73,214,31,0.10)' : 'rgba(73,214,31,0.08)',
        cardBorder: isDark ? 'rgba(73,214,31,0.28)' : 'rgba(73,214,31,0.24)',
      }
    case 'gentle':
      // Amber/yellow — desaturated in dark mode so it doesn't glow.
      return {
        fg: isDark ? '#F3BA57' : '#9A5E04',
        soft: isDark ? 'rgba(243,186,87,0.72)' : 'rgba(154,94,4,0.72)',
        heroWash: isDark ? 'rgba(243,186,87,0.22)' : 'rgba(243,186,87,0.20)',
        cardBg: isDark ? 'rgba(243,186,87,0.12)' : 'rgba(243,186,87,0.14)',
        cardBorder: isDark ? 'rgba(243,186,87,0.32)' : 'rgba(243,186,87,0.36)',
      }
    case 'urgent':
      // Orange — original at_risk tone; afternoon/evening alert.
      return {
        fg: isDark ? '#F8D1C3' : '#B84014',
        soft: isDark ? 'rgba(248,209,195,0.72)' : 'rgba(184,64,20,0.72)',
        heroWash: isDark ? 'rgba(242,167,140,0.28)' : 'rgba(242,167,140,0.22)',
        cardBg: isDark ? 'rgba(242,167,140,0.12)' : 'rgba(242,167,140,0.10)',
        cardBorder: isDark ? 'rgba(242,167,140,0.35)' : 'rgba(242,167,140,0.32)',
      }
    case 'critical':
      // Red — final stretch before midnight. Higher saturation in
      // dark mode so the hero wash reads as alarmed rather than dull.
      return {
        fg: isDark ? '#E88A70' : '#C03A2A',
        soft: isDark ? 'rgba(232,138,112,0.78)' : 'rgba(192,58,42,0.78)',
        heroWash: isDark ? 'rgba(224,85,85,0.34)' : 'rgba(224,85,85,0.24)',
        cardBg: isDark ? 'rgba(224,85,85,0.16)' : 'rgba(224,85,85,0.10)',
        cardBorder: isDark ? 'rgba(224,85,85,0.42)' : 'rgba(224,85,85,0.32)',
      }
  }
}
