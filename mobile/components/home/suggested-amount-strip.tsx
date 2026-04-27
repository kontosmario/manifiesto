import { Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'

interface SuggestedAmountStripProps {
  amounts: number[]
  currentAmount: number
  onAdd: (delta: number) => void
  onClear: () => void
}

export function SuggestedAmountStrip({
  amounts,
  currentAmount,
  onAdd,
  onClear,
}: SuggestedAmountStripProps) {
  const { theme } = useAppTheme()

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {amounts.map((v) => (
        <Pressable
          key={v}
          onPress={() => onAdd(v)}
          accessibilityRole="button"
          accessibilityLabel={`Sumar ${v}`}
          style={[
            styles.chip,
            { backgroundColor: theme.colors.creamSoft, borderColor: theme.colors.line },
          ]}
        >
          <Text style={[styles.chipText, { color: theme.colors.text }]}>
            +${v / 1000}k
          </Text>
        </Pressable>
      ))}
      {currentAmount > 0 ? (
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel="Borrar monto"
          style={[styles.chipDashed, { borderColor: theme.colors.line }]}
        >
          <Text style={[styles.chipText, { color: theme.colors.textMuted }]}>
            Borrar
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: {
    gap: 6,
    paddingRight: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipDashed: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
})
