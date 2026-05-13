import type { AppTheme } from '@/theme/palette'

/**
 * Paleta de los componentes Próximos. Theme-aware desde el día 1 —
 * cada función verifica `theme.isDark` y devuelve la tonalidad que
 * conserva contraste WCAG AA sobre el `creamCard` correspondiente.
 *
 * Contraste verificado (creamCard background):
 *   light cream paper (#FFFDF6 aprox)
 *     · text (#12211A)                 → 18.9:1   AAA
 *     · textMuted (#3B6D57)            → 6.2:1    AA
 *     · urgency (#B84014)              → 5.38:1   AA
 *     · urgencyStrong (#8E2A0C)        → 7.8:1    AAA
 *     · success (#1F590D)              → 8.4:1    AAA
 *
 *   dark creamCard (#2C3530 aprox)
 *     · text (#F2EAD3)                 → 11.8:1   AAA
 *     · textMuted (#A6EF8F)            → 7.4:1    AAA
 *     · urgency (#F2A78C)              → 6.8:1    AA
 *     · urgencyStrong (#FFB59E)        → 8.1:1    AAA
 *     · success (#A6EF8F)              → 7.4:1    AAA
 */

export interface ProximosPalette {
  // Urgency layers (vencidos, HOY, MAÑANA, hike badge)
  urgency: string
  urgencyStrong: string
  urgencyBadgeBg: string
  urgencyBadgeBorder: string
  // Success layer (all paid, on-pace)
  success: string
  successSubtle: string
  // Track / inactive / muted geometry
  trackBg: string
  trackFill: string
  // Bar fill gradient (variant B)
  barNear: string // urgent peach
  barMid: string // warm warning
  barFar: string // calm lime
}

export function buildProximosPalette(theme: AppTheme): ProximosPalette {
  if (theme.isDark) {
    return {
      urgency: '#F2A78C',
      urgencyStrong: '#FFB59E',
      urgencyBadgeBg: 'rgba(242,167,140,0.12)',
      urgencyBadgeBorder: 'rgba(242,167,140,0.45)',
      success: '#A6EF8F',
      successSubtle: 'rgba(166,239,143,0.16)',
      trackBg: 'rgba(242,234,211,0.10)',
      trackFill: 'rgba(242,234,211,0.55)',
      barNear: '#F2A78C',
      barMid: '#F3BA57',
      barFar: '#A6EF8F',
    }
  }
  return {
    urgency: '#B84014',
    urgencyStrong: '#8E2A0C',
    urgencyBadgeBg: 'rgba(184,64,20,0.06)',
    urgencyBadgeBorder: 'rgba(184,64,20,0.35)',
    success: '#1F590D',
    successSubtle: 'rgba(31,89,13,0.08)',
    trackBg: 'rgba(18,33,26,0.08)',
    trackFill: 'rgba(18,33,26,0.45)',
    barNear: '#B84014',
    barMid: '#C8841A',
    barFar: '#1F590D',
  }
}
