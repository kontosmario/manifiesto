import { Image, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native'
import {
  pickIconForCategory,
  pickIconForFixedExpenseCategory,
} from '@/features/gastos/category-icons'
import { CATEGORY_ICONS } from './category-icon-registry'
import { resolveCategoryIconKey, type CategoryIconScope } from './category-icon-map'

interface CategoryIconProps {
  /** Nombre CRUDO de la categoría (no el localizado). */
  name: string
  scope?: CategoryIconScope
  /** Lado del ícono en px. */
  size?: number
  /** Estilo extra para el emoji de fallback (categorías sin sticker mapeado). */
  emojiStyle?: StyleProp<TextStyle>
}

/**
 * Ícono de categoría: sticker (PNG asset) si hay uno mapeado para el slug, sino
 * cae al emoji actual (`pickIconForCategory`/`pickIconForFixedExpenseCategory`).
 * El sticker se resuelve por slug estable, nunca por el nombre localizado.
 */
export function CategoryIcon({ name, scope = 'expense', size = 28, emojiStyle }: CategoryIconProps) {
  const key = resolveCategoryIconKey(name, scope)
  const source = key ? CATEGORY_ICONS[key] : undefined

  if (source) {
    return (
      <Image
        source={source}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
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
