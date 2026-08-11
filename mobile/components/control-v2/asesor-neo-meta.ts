import { neoInk } from '@/theme/neo-ink'
import {
  neoCategoryPastels,
  neoParticlePresets,
  neoTokens,
  pastelDark,
  type NeoTokens,
} from '@/theme/neo-tokens'
import type { ResolvedThemeMode } from '@/theme/palette'
import type { BubbleType } from './asesor-bubble-meta'

/**
 * Material neumórfico de las superficies del asesor (Asistente, Modo
 * guiado). `asesor-bubble-meta` deriva la SEMÁNTICA de una señal (tipo,
 * headline, chip de impacto); este módulo traduce ese tipo al vocabulario
 * del rediseño: qué pastel pinta su tile, qué tinta lleva su acento y con
 * qué partículas respira la hoja.
 *
 * Vive aparte porque las dos superficies del asesor comparten la misma
 * lectura visual y tienen que verse iguales sin copiarse valores.
 */

/**
 * Tile de ícono por tipo de señal. El handoff pinta los tiles de ícono
 * como pastel de categoría plano (`screens/3c.html` L44-62); acá se elige
 * el pastel cuyo matiz codifica el tipo: salmón para crítico, durazno
 * para advertencia, verde para refuerzo, verde agua para insight.
 */
export const TYPE_PASTEL: Record<BubbleType, string> = {
  critical: neoCategoryPastels.transferencia,
  warning: neoCategoryPastels.comida,
  positive: neoCategoryPastels.hogar,
  insight: neoCategoryPastels.mascotas,
}

/**
 * Fondo del tile por tipo. En claro es el pastel plano; en oscuro el
 * mismo pastel va translúcido (`pastelDark`, 14%) para que el matiz se
 * lea sin encender la card. El glifo encima usa `neo.text` en los dos
 * temas (≥ 7.7:1 en toda la tabla).
 */
export function typeTileBackground(type: BubbleType, isDark: boolean): string {
  const pastel = TYPE_PASTEL[type]
  return isDark ? pastelDark(pastel) : pastel
}

/**
 * Tinta del acento positivo. En claro NO se usa `neo.green` (#2E7C39):
 * sobre el pozo claro da 4.29:1 y estos son valores de 11-16px en
 * negrita, que necesitan 4.5:1. `greenDeep` es un token del mismo sistema
 * y llega a ~7:1. En oscuro el par se invierte y `green` (#A4E3A6) es el
 * correcto — el mismo criterio que resuelve `neoInk`.
 */
export function positiveInk(neo: NeoTokens, isDark: boolean): string {
  return isDark ? neo.green : neo.greenDeep
}

/**
 * Tinta del acento por tipo de señal: rojo-tierra para lo crítico,
 * advertencia para lo que hay que corregir, verde para refuerzo e
 * insight. Todas salen de `neoInk`, que ya está corregido por contraste
 * en los dos temas.
 */
export function typeInk(type: BubbleType, mode: ResolvedThemeMode): string {
  const ink = neoInk(mode)
  if (type === 'critical') return ink.danger
  if (type === 'warning') return ink.warn
  return ink.accent
}

/** Opacidad base de las partículas de fondo, por tema. */
export function starOpacityScale(isDark: boolean): number {
  return isDark ? 0.55 : 0.45
}

/**
 * Partículas del fondo de la hoja. En oscuro es literal el preset `hero`
 * del handoff; en claro NO se puede usar el mismo, porque esos tres tonos
 * (#C9F3C6 / #FBD9BC / #EFF6E2) están pensados para caer sobre el hero
 * verde y sobre la hoja crema (#F0EFE3) desaparecerían. La versión clara
 * usa los acentos del MISMO sistema, que sí contrastan contra la hoja.
 */
const LIGHT_STAR_COLORS: readonly string[] = (() => {
  const neo = neoTokens('light')
  return [neo.green, neo.warm, neo.textTertiary]
})()

export function starColors(_neo: NeoTokens, isDark: boolean): readonly string[] {
  // Constante por tema, no un literal nuevo: el campo de estrellas está
  // memoizado y un array fresco por render lo derrota.
  return isDark ? neoParticlePresets.hero.colors : LIGHT_STAR_COLORS
}
