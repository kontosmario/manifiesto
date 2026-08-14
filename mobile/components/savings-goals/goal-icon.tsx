import { Image, StyleSheet, type StyleProp, type TextStyle } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { CATEGORY_ICONS } from '@/components/category/category-icon-registry'
import { isGoalStickerKey } from '@/features/savings-goals/goal-icon'

interface GoalIconProps {
  /**
   * Valor guardado en `SavingsGoal.emoji`: un emoji literal o la KEY de
   * un sticker del registry (ej. "metas/playa"). Ver
   * `features/savings-goals/goal-icon.ts` para el discriminador.
   */
  value: string
  /** Lado del ícono en px (alto del sticker / fontSize del emoji). */
  size?: number
  /** Estilo extra para el emoji de texto (ignorado para stickers). */
  emojiStyle?: StyleProp<TextStyle>
}

/**
 * Renderea el ícono de una meta de ahorro: si `value` es la key de un
 * sticker del registry → `<Image>` del PNG; sino → el emoji como
 * `<Text>`. Una sola fuente de verdad para no repetir el branch en cada
 * surface (card de meta, summary del wizard, etc.).
 */
export function GoalIcon({ value, size = 28, emojiStyle }: GoalIconProps) {
  if (isGoalStickerKey(value)) {
    return (
      <Image
        source={CATEGORY_ICONS[value]}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    )
  }
  return (
    <Text
      style={[styles.emoji, { fontSize: Math.round(size * 0.84), lineHeight: Math.round(size * 1) }, emojiStyle]}
    >
      {value}
    </Text>
  )
}

const styles = StyleSheet.create({
  emoji: { textAlign: 'center' },
})
