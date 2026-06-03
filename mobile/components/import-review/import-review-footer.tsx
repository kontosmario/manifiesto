import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'

interface Props {
  expensesCount: number
  incomesCount: number
  canConfirm: boolean
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ImportReviewFooter({
  expensesCount,
  incomesCount,
  canConfirm,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const { theme } = useAppTheme()

  const label = busy
    ? 'Cargando…'
    : expensesCount + incomesCount === 0
      ? 'Nada para cargar'
      : `Confirmar ${expensesCount} gasto${expensesCount === 1 ? '' : 's'} + ${incomesCount} ingreso${incomesCount === 1 ? '' : 's'}`

  return (
    <View style={styles.stack}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !canConfirm || busy }}
        disabled={!canConfirm || busy}
        onPress={onConfirm}
        style={({ pressed }) => [
          styles.primary,
          {
            backgroundColor: theme.colors.primary,
            opacity: !canConfirm || busy ? 0.55 : pressed ? 0.9 : 1,
          },
        ]}
      >
        <Text style={styles.primaryText} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={onCancel}
        style={styles.cancel}
      >
        <Text style={[styles.cancelText, { color: theme.colors.textMuted }]}>
          Cancelar
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  primary: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryText: { fontSize: 15, fontWeight: '900', color: '#0F2D06', letterSpacing: -0.2 },
  cancel: { paddingVertical: 6, alignItems: 'center' },
  cancelText: { fontSize: 13, fontWeight: '700' },
})
