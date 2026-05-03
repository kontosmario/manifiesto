// Asistente Financiero — branding-aligned token set per theme.
//
// Source of truth: tmp/branding-preview-2026-05-02.html (canonical
// brand audit). Splash family is forest `#1F3A2E`, primary mint
// `#A8D89A` (dark) / `#2E8B57` (light), accent peach `#E89070`,
// paper cream `#F5F1E5` / `#F2EAD3`, ink `#14201A`.
//
// The asistente used to be a "branded dark modal" with hard-coded
// hex values regardless of system theme. Now it adapts to
// `useAppTheme().theme.isDark` so the experience matches the rest
// of the app while preserving the brand vocabulary.

import { useMemo } from 'react'
import { useAppTheme } from '@/theme/theme-provider'

export interface AsistenteTokens {
  /** Sheet background gradient (3 stops, subtle vertical fade). */
  shellGradient: readonly [string, string, string]
  /** Header — "Asistente" big title. */
  headerTitle: string
  /** Header subtitle ("X acciones..."). */
  headerSubtitle: string
  /** Aggregate impact pill. */
  pillBg: string
  pillBorder: string
  pillIcon: string
  pillValue: string
  pillSuffix: string
  /** Card surface (the cream/forest InsightCard background). */
  cardBg: string
  cardBorder: string
  cardBorderActive: string // when isActive
  /** Card content. */
  cardTitle: string
  cardBody: string
  /** Color of the small "/" separator etc — derived from cardBody.
   *  Kept distinct so the audit can flag it independently. */
  cardMuted: string
  /** Inline impact line — semantic per signal type. */
  impactPositive: string
  impactWarning: string
  /** Primary CTA pill (Capitalizar / Auditar / etc). */
  ctaBg: string
  ctaText: string
  ctaShadow: string
  /** "Visto" secondary pill. */
  vistoBg: string
  vistoBorder: string
  vistoText: string
  /** Background twinkling stars. */
  starColor: string
  starOpacityScale: number
}

const LIGHT: AsistenteTokens = {
  // Paper cream as the asistente backdrop in light mode. Slightly
  // warmer than pure white so cards (white) read as elevated.
  shellGradient: ['#F5F1E5', '#EFE9D8', '#F5F1E5'] as const,
  headerTitle: '#14201A',
  // Was rgba(20,32,26,0.62) → 4.56:1 — passed AA at the floor. Bumped
  // to 0.70 for AAA-level cushion on the subtle paper bg.
  headerSubtitle: 'rgba(20,32,26,0.70)',
  pillBg: 'rgba(46,139,87,0.10)', // primary @ low alpha on paper
  pillBorder: 'rgba(46,139,87,0.28)',
  pillIcon: '#2E8B57',
  pillValue: '#1F6B43',
  // Was rgba(31,107,67,0.70) — failed AA (2.94:1) for the small
  // 11pt suffix text. Solid #1F6B43 reads as the same hue, the
  // visual hierarchy stays intact via fontSize + weight.
  pillSuffix: '#1F6B43',
  cardBg: '#FFFFFF',
  cardBorder: 'rgba(20,32,26,0.10)',
  cardBorderActive: 'rgba(46,139,87,0.55)',
  cardTitle: '#14201A',
  cardBody: 'rgba(20,32,26,0.74)',
  cardMuted: 'rgba(20,32,26,0.55)',
  impactPositive: '#1F6B43', // sea-green deepened so 4.5:1 on white
  impactWarning: '#B95A2B', // peach deepened for AA on white
  ctaBg: '#2E8B57',
  ctaText: '#FFFFFF',
  ctaShadow: '#2E8B57',
  vistoBg: 'rgba(20,32,26,0.06)',
  vistoBorder: 'rgba(20,32,26,0.18)',
  vistoText: 'rgba(20,32,26,0.74)',
  starColor: '#7A9070', // sage particles from the splash
  starOpacityScale: 0.45,
}

const DARK: AsistenteTokens = {
  // Deep forest matching the splash dark side. Subtle 3-stop fade
  // for visual depth without being dramatic.
  shellGradient: ['#0F1A14', '#13241B', '#0A1410'] as const,
  headerTitle: '#F2EAD3',
  headerSubtitle: 'rgba(242,234,211,0.66)',
  pillBg: 'rgba(168,216,154,0.14)',
  pillBorder: 'rgba(168,216,154,0.32)',
  pillIcon: '#A8D89A',
  pillValue: '#A8D89A',
  pillSuffix: 'rgba(168,216,154,0.72)',
  cardBg: '#1A2A22',
  cardBorder: 'rgba(168,216,154,0.16)',
  cardBorderActive: 'rgba(168,216,154,0.72)',
  cardTitle: '#F2EAD3',
  cardBody: 'rgba(242,234,211,0.78)',
  cardMuted: 'rgba(242,234,211,0.55)',
  impactPositive: '#A8D89A', // primary mint reads well on #1A2A22
  impactWarning: '#E89070', // accent peach (brand)
  ctaBg: '#A8D89A',
  ctaText: '#0F1A14',
  ctaShadow: 'rgba(168,216,154,0.40)',
  vistoBg: 'rgba(242,234,211,0.06)',
  vistoBorder: 'rgba(242,234,211,0.20)',
  vistoText: 'rgba(242,234,211,0.78)',
  starColor: '#A8D89A',
  starOpacityScale: 0.55,
}

export function useAsistenteTheme(): AsistenteTokens {
  const { theme } = useAppTheme()
  return useMemo(() => (theme.isDark ? DARK : LIGHT), [theme.isDark])
}

/** Exposed for unit tests / contrast audits. */
export const ASISTENTE_TOKENS = { light: LIGHT, dark: DARK } as const
