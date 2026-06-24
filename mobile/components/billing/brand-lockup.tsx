import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'
import { FernMark } from '@/components/billing/fern-mark'

/**
 * Ancla de marca: helecho + "Manifiesto · Hogar". `tone` adapta los colores
 * a la superficie: sobre crema (claro) o sobre forest/oscuro (hero).
 */
export interface BrandLockupProps {
  tone?: 'onCream' | 'onForest'
}

export const BrandLockup = memo(function BrandLockup({
  tone = 'onCream',
}: BrandLockupProps) {
  const { theme } = useAppTheme()
  const onForest = tone === 'onForest'
  const wordColor = onForest ? theme.colors.heroText : theme.colors.text
  const tagColor = onForest ? theme.colors.heroText : theme.colors.textMuted
  return (
    <View style={styles.row}>
      <FernMark variant={onForest ? 'cream' : 'forest'} size={17} />
      <Text style={[styles.word, { color: wordColor }]}>Manifiesto</Text>
      <Text style={[theme.typography.eyebrow, styles.tag, { color: tagColor }]}>
        Hogar
      </Text>
    </View>
  )
})

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  word: { fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },
  tag: { marginLeft: 1, marginBottom: 1 },
})
