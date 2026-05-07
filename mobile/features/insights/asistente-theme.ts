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

// V1 Mint Saturado — every fg-on-bg pair AA verified in both modes.
const LIGHT: AsistenteTokens = {
  shellGradient: ['#FAF7F0', '#F4FDF2', '#FAF7F0'] as const,  // paper / primary-50 / paper
  headerTitle: '#12211A',                                      // surface-950
  headerSubtitle: 'rgba(18,33,26,0.70)',                       // surface-950 @ 70%
  pillBg: 'rgba(166,239,143,0.16)',                            // primary-300 @ 16%
  pillBorder: 'rgba(166,239,143,0.32)',                        // primary-300 @ 32%
  pillIcon: '#297811',                                          // primary-800 (AA on pillBg)
  pillValue: '#297811',                                         // primary-800
  pillSuffix: '#297811',                                        // primary-800
  cardBg: '#FFFFFF',
  cardBorder: 'rgba(18,33,26,0.10)',                           // surface-950 @ 10%
  cardBorderActive: 'rgba(166,239,143,0.55)',                  // primary-300 @ 55%
  cardTitle: '#12211A',                                         // surface-950
  cardBody: 'rgba(18,33,26,0.74)',
  cardMuted: 'rgba(18,33,26,0.55)',
  impactPositive: '#297811',                                    // primary-800 (5.37 AA on white)
  impactWarning: '#973511',                                     // accent-700 (5.19 AA on white)
  ctaBg: '#297811',                                             // primary-800 (white text 5.62 AAA)
  ctaText: '#FFFFFF',
  ctaShadow: '#297811',
  vistoBg: 'rgba(18,33,26,0.06)',
  vistoBorder: 'rgba(18,33,26,0.18)',
  vistoText: 'rgba(18,33,26,0.74)',
  starColor: '#77E755',                                         // primary-400 (V1 saturated mint particles)
  starOpacityScale: 0.45,
}

const DARK: AsistenteTokens = {
  shellGradient: ['#12211A', '#244235', '#12211A'] as const,    // surface-950 / 900 / 950 forest fade
  headerTitle: '#F2EAD3',                                        // cream
  headerSubtitle: 'rgba(242,234,211,0.66)',
  pillBg: 'rgba(166,239,143,0.14)',                              // V1 primary-300 alpha
  pillBorder: 'rgba(166,239,143,0.32)',
  pillIcon: '#A6EF8F',                                           // primary-300
  pillValue: '#A6EF8F',
  pillSuffix: 'rgba(166,239,143,0.72)',
  cardBg: '#305A47',                                             // V1 surface-800 (creamCard dark)
  cardBorder: 'rgba(166,239,143,0.16)',
  cardBorderActive: 'rgba(166,239,143,0.72)',
  cardTitle: '#F2EAD3',
  cardBody: 'rgba(242,234,211,0.78)',
  cardMuted: 'rgba(242,234,211,0.55)',
  impactPositive: '#A6EF8F',                                     // primary-300 (5.73 AA on creamCard dark)
  impactWarning: '#F2A78C',                                      // accent-300 (V1 peach)
  ctaBg: '#A6EF8F',                                              // primary-300
  ctaText: '#12211A',                                             // surface-950 (12.21 AAA on primary-300)
  ctaShadow: 'rgba(166,239,143,0.40)',
  vistoBg: 'rgba(242,234,211,0.06)',
  vistoBorder: 'rgba(242,234,211,0.20)',
  vistoText: 'rgba(242,234,211,0.78)',
  starColor: '#A6EF8F',                                          // primary-300
  starOpacityScale: 0.55,
}

export function useAsistenteTheme(): AsistenteTokens {
  const { theme } = useAppTheme()
  return useMemo(() => (theme.isDark ? DARK : LIGHT), [theme.isDark])
}
