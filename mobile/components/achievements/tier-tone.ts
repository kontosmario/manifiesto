import type { AchievementTier } from '@/features/achievements/use-achievements'
import { pastelDarkSolid } from '@/theme/neo-tokens'
import type { ResolvedThemeMode } from '@/theme/palette'

export interface NeoTierTone {
  /** Fill sólido del tile/medallón — reemplaza al material raised del tema. */
  fill: string
  /** Tinta sobre `fill`: chip del tier y glifos propios del tier. */
  ink: string
  /** Capa extra de `boxShadow` (halo estático) de los tiers premium. */
  glow: string
}

/**
 * Paleta de tiers, única para la grilla de la galería y el sheet de detalle.
 *
 * El fill vive en la familia de `neoCategoryPastels`: un tile de medalla es el
 * mismo objeto visual que un tile de categoría, y el relieve —no un borde ni un
 * metálico saturado— es lo que separa la superficie del fondo. En oscuro el
 * pastel pasa por `pastelDarkSolid()` para conservar el matiz sin lavarse.
 *
 * Las tintas están elegidas por contraste sobre su propio fill: en claro
 * 5.79:1 (gold, la más ajustada) a 7.33:1 (legendary); en oscuro 6.00:1
 * (bronze) a 8.43:1 (silver). El endpoint gold claro de la V1 (`#9E7C12`,
 * 2.90:1) no llegaba a AA como texto.
 */
const LIGHT_FILL: Record<AchievementTier, string> = {
  bronze: '#F7E3CF',
  silver: '#E3E6EC',
  gold: '#F2ECC9',
  legendary: '#E2EDD2',
}

const DARK_FILL: Record<AchievementTier, string> = {
  bronze: pastelDarkSolid(LIGHT_FILL.bronze),
  silver: pastelDarkSolid(LIGHT_FILL.silver),
  gold: pastelDarkSolid(LIGHT_FILL.gold),
  legendary: pastelDarkSolid(LIGHT_FILL.legendary),
}

const LIGHT_INK: Record<AchievementTier, string> = {
  bronze: '#8F3A12',
  silver: '#4A5164',
  gold: '#6F5709',
  legendary: '#1F5429',
}

const DARK_INK: Record<AchievementTier, string> = {
  bronze: '#F0B486',
  silver: '#CBD2DE',
  gold: '#F2D173',
  legendary: '#B6F0A0',
}

const LIGHT_GLOW: Record<AchievementTier, string> = {
  bronze: '0 0 16px rgba(184,64,20,0.28)',
  silver: '0 0 16px rgba(92,99,118,0.24)',
  gold: '0 0 16px rgba(191,148,20,0.38)',
  legendary: '0 0 16px rgba(46,124,57,0.34)',
}

const DARK_GLOW: Record<AchievementTier, string> = {
  bronze: '0 0 16px rgba(240,180,134,0.26)',
  silver: '0 0 16px rgba(203,210,222,0.24)',
  gold: '0 0 16px rgba(242,209,115,0.32)',
  legendary: '0 0 16px rgba(164,227,166,0.30)',
}

export function tierTone(tier: AchievementTier, mode: ResolvedThemeMode): NeoTierTone {
  const isDark = mode === 'dark'
  return {
    fill: (isDark ? DARK_FILL : LIGHT_FILL)[tier],
    ink: (isDark ? DARK_INK : LIGHT_INK)[tier],
    glow: (isDark ? DARK_GLOW : LIGHT_GLOW)[tier],
  }
}
