import { neoTokens } from './neo-tokens'
import type { ResolvedThemeMode } from './palette'

/**
 * Tintas de acento del rediseño neumórfico, corregidas por contraste.
 *
 * Los tokens de `neoTokens()` son colores de MATERIAL: están calibrados para
 * pintar superficies, no para leerse como texto o glifos chicos sobre ellas. En
 * tema claro tres de ellos no llegan a AA cuando se usan como tinta:
 *
 *   · `green`  #2E7C39 sobre el pozo claro → 4.29:1 (texto necesita 4.5:1)
 *   · `warm`   #C96F3F sobre el pozo claro → 2.99:1 (un glifo necesita 3:1)
 *   · `danger` #C25B33 tampoco alcanza a 4.5:1 como texto
 *
 * En oscuro pasa lo contrario: los verdes profundos serían ilegibles y hay que
 * usar los claros. Por eso la tinta es mode-aware y NO es el mismo valor que el
 * material del mismo nombre.
 *
 * `#A84A2F` no es un color inventado: es el rojo-tierra de "excedido" del propio
 * rediseño (`neoCalendar.light.excess.text`), que da 4.72:1. Se usa para danger
 * y para warn en claro — el vocabulario claro no tiene un naranja de alerta que
 * pase AA como tinta, así que ambos comparten el rojo-tierra y la diferencia se
 * comunica por ícono y copy, no por color.
 *
 * Nació al migrar Ajustes (2026-08-05), replicando el criterio que ya aplicaban
 * a mano `expense-categories-screen` y `expense-filters-screen`.
 */
export interface NeoInk {
  /** Acento positivo / seleccionado (texto, glifos, valores). */
  accent: string
  /** Destructivo (borrar cuenta, salir del hogar, errores). */
  danger: string
  /** Advertencia blanda (avisos reversibles). */
  warn: string
}

function buildInk(mode: ResolvedThemeMode): NeoInk {
  const neo = neoTokens(mode)
  const isDark = mode === 'dark'

  return {
    accent: isDark ? neo.green : neo.greenDeep,
    danger: isDark ? neo.danger : '#A84A2F',
    warn: isDark ? neo.warm : '#A84A2F',
  }
}

/**
 * Singletons por modo, no un literal nuevo por llamada: los worklets de
 * Reanimated capturan el OBJETO raíz en su `__closure` y comparan las deps por
 * identidad, así que devolver un objeto fresco por render rearma el mapper en
 * cada frame de render.
 */
const INK: Record<ResolvedThemeMode, NeoInk> = {
  light: buildInk('light'),
  dark: buildInk('dark'),
}

export function neoInk(mode: ResolvedThemeMode): NeoInk {
  return INK[mode]
}
