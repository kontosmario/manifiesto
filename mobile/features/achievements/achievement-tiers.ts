import i18n from '@/lib/i18n'
import { getIntlLocale } from '@/lib/i18n/active-locale'
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
  return i18n.t(`achievements:tierShort.${tier}`)
}

/**
 * Copy de celebración (título/cuerpo) por logro, resuelto desde el bundle del
 * cliente (`achievements:catalog.<code>.*`). El `title`/`body` que viaja en el
 * catálogo de la DB se pasa como `defaultValue` → sigue siendo el fallback si
 * el code no está en el bundle todavía. Las columnas de la DB se conservan
 * justamente para esto. Se usa `i18n.t` (no el hook) para que funcione también
 * fuera de render — p.ej. el path de unlock realtime que compone el view item
 * desde el catálogo cacheado.
 */
export function achievementTitle(code: string, fallback?: string): string {
  return i18n.t(`achievements:catalog.${code}.title`, { defaultValue: fallback ?? '' })
}

export function achievementBody(code: string, fallback?: string): string {
  return i18n.t(`achievements:catalog.${code}.body`, { defaultValue: fallback ?? '' })
}

/** Los tiers gold/legendary merecen un glow extra al estar desbloqueados. */
export function tierIsPremium(tier: AchievementTier): boolean {
  return tier === 'gold' || tier === 'legendary'
}

export function formatEarnedDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(getIntlLocale(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}
