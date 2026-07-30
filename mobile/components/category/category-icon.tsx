import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native'
import {
  pickIconForCategory,
  pickIconForFixedExpenseCategory,
} from '@/features/gastos/category-icons'
import { CATEGORY_ICONS } from './category-icon-registry'
import { CategorySticker } from './category-sticker'
import { resolveCategoryIconKey, type CategoryIconScope } from './category-icon-map'
import { resolveCategoryHueByName } from '@/theme/category-hues'

interface CategoryIconProps {
  /** Nombre CRUDO de la categoría (no el localizado). */
  name: string
  scope?: CategoryIconScope
  /** Lado del ícono en px. */
  size?: number
  /** Estilo extra para el emoji de fallback (categorías sin sticker mapeado). */
  emojiStyle?: StyleProp<TextStyle>
  /** El caller ya pone el ícono sobre una superficie CLARA (ej. la cápsula del
   *  picker) → el sticker no necesita placa en dark. */
  onLightSurface?: boolean
  /**
   * Color de la placa del sticker en dark. Por defecto sale de `categoryHues`,
   * que es la paleta de badges de gastos. Cuando el caller pinta la superficie
   * con OTRA paleta —los fijos usan `fijos-category-palette`— tiene que pasar
   * su propio color: si no, queda una placa amarilla adentro de un tile
   * violeta, porque los dos sistemas mapean la misma categoría a hues
   * distintos (`Impuestos` → servicios/amarillo en uno, violeta en el otro).
   */
  plateColor?: string
}

/**
 * Ícono de categoría: sticker (PNG asset) si hay uno mapeado para el slug, sino
 * cae al emoji actual (`pickIconForCategory`/`pickIconForFixedExpenseCategory`).
 * El sticker se resuelve por slug estable, nunca por el nombre localizado.
 */
export function CategoryIcon({
  name,
  scope = 'expense',
  size = 28,
  emojiStyle,
  onLightSurface = false,
  plateColor,
}: CategoryIconProps) {
  const key = resolveCategoryIconKey(name, scope)
  const source = key ? CATEGORY_ICONS[key] : undefined

  if (source) {
    // En superficies oscuras (filas) el sticker se apoya sobre el pastel CLARO
    // del hue para resaltarlo. Si el caller ya está sobre fondo claro (picker),
    // `onLightSurface` evita la placa.
    return (
      <CategorySticker
        source={source}
        size={size}
        plateColor={plateColor ?? resolveCategoryHueByName(name).light.surface}
        onLightSurface={onLightSurface}
      />
    )
  }

  const emoji =
    scope === 'fixed_expense' ? pickIconForFixedExpenseCategory(name) : pickIconForCategory(name)
  return (
    <Text style={[styles.emoji, { fontSize: Math.round(size * 0.74) }, emojiStyle]} allowFontScaling={false}>
      {emoji}
    </Text>
  )
}

const styles = StyleSheet.create({
  emoji: { textAlign: 'center' },
})
