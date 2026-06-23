// Map del tier de un logro → intensidad de la celebración "Floración".
// La celebración siempre va sobre fondo verde profundo (#163A1E), así que
// la paleta es fija (no depende del theme claro/oscuro). Tiers más altos =
// más luciérnagas + más flores coral, manteniendo la familia visual.

export type AchievementTierKey = 'bronze' | 'silver' | 'gold' | 'legendary'

export interface FloracionTone {
  /** Color del número/acentos de la floración (menta → verde claro). */
  accent: string
  /** Cantidad de luciérnagas (CardParticles). */
  particleCount: number
  /** Flores coral pegadas al helecho. */
  blooms: number
}

export function floracionToneForTier(tier: AchievementTierKey): FloracionTone {
  switch (tier) {
    case 'legendary':
      return { accent: '#9FE08A', particleCount: 20, blooms: 2 }
    case 'gold':
      return { accent: '#9FE08A', particleCount: 16, blooms: 2 }
    case 'silver':
      return { accent: '#B7DD8E', particleCount: 13, blooms: 1 }
    case 'bronze':
    default:
      return { accent: '#CBD79F', particleCount: 10, blooms: 1 }
  }
}
