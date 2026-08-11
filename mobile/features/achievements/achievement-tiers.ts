import i18n from '@/lib/i18n'
import { getIntlLocale } from '@/lib/i18n/active-locale'
import type { AchievementTier } from './use-achievements'

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
