import type { AchievementTier } from './use-achievements'

export interface TierTone {
  bg: string
  fg: string
  border: string
}

/**
 * Colores por tier (single source of truth, compartido entre la galería y el
 * sheet de detalle). En dark se usan los tonos LUMINOSOS (los endpoints oscuros
 * se hundían en la card `surfaceMuted`); bg/border son tints translúcidos.
 */
export function tierTone(tier: AchievementTier, isDark: boolean): TierTone {
  switch (tier) {
    case 'bronze':
      return {
        bg: isDark ? 'rgba(240,180,134,0.16)' : 'rgba(242,181,138,0.22)',
        fg: isDark ? '#F0B486' : '#B84014',
        border: isDark ? 'rgba(240,180,134,0.45)' : 'rgba(242,181,138,0.55)',
      }
    case 'silver':
      return {
        bg: isDark ? 'rgba(203,210,222,0.16)' : 'rgba(170,178,196,0.22)',
        fg: isDark ? '#CBD2DE' : '#5C6376',
        border: isDark ? 'rgba(203,210,222,0.45)' : 'rgba(170,178,196,0.55)',
      }
    case 'gold':
      return {
        bg: isDark ? 'rgba(242,209,115,0.18)' : 'rgba(244,210,107,0.26)',
        fg: isDark ? '#F2D173' : '#9E7C12',
        border: isDark ? 'rgba(242,209,115,0.48)' : 'rgba(244,210,107,0.55)',
      }
    case 'legendary':
      return {
        bg: isDark ? 'rgba(166,239,143,0.18)' : 'rgba(166,239,143,0.26)',
        fg: isDark ? '#B6F0A0' : '#1F590D',
        border: isDark ? 'rgba(166,239,143,0.50)' : 'rgba(166,239,143,0.65)',
      }
  }
}

export function tierShort(tier: AchievementTier): string {
  switch (tier) {
    case 'bronze':
      return 'BRONCE'
    case 'silver':
      return 'PLATA'
    case 'gold':
      return 'ORO'
    case 'legendary':
      return 'LEYENDA'
  }
}

/** Los tiers gold/legendary merecen un glow extra al estar desbloqueados. */
export function tierIsPremium(tier: AchievementTier): boolean {
  return tier === 'gold' || tier === 'legendary'
}

export function formatEarnedDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}
