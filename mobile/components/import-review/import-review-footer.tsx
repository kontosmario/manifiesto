import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'
import { loadingLabels } from '@/lib/copy/states'

interface Props {
  /** Zero-indexed current step. */
  stepIndex: number
  totalSteps: number
  /** Number of submittable expenses across the whole import. */
  expensesCount: number
  /** Number of submittable incomes across the whole import. */
  incomesCount: number
  /** Whether confirm is allowed (no invalid steps, has at least one). */
  canConfirm: boolean
  /** Whether the current step is already marked as skipped. */
  isCurrentSkipped: boolean
  busy: boolean
  onPrev: () => void
  onNext: () => void
  onSkip: () => void
  onConfirm: () => void
}

/**
 * Wizard footer. Two rows:
 *
 *   [← Anterior]               [Saltear este]
 *   ┌─────────────────────────────────────────┐
 *   │  Siguiente →   /   Confirmar (N)        │
 *   └─────────────────────────────────────────┘
 *
 * On the last step, the primary CTA flips to "Confirmar N movimientos"
 * — the change in copy is the wizard's "you're at the finish line"
 * signal, paired with the filled progress strip above.
 */
export function ImportReviewFooter({
  stepIndex,
  totalSteps,
  expensesCount,
  incomesCount,
  canConfirm,
  isCurrentSkipped,
  busy,
  onPrev,
  onNext,
  onSkip,
  onConfirm,
}: Props) {
  const { theme } = useAppTheme()
  const isLast = stepIndex >= totalSteps - 1
  const isFirst = stepIndex <= 0

  const totalSubmittable = expensesCount + incomesCount

  const primaryLabel = (() => {
    if (busy) return `${loadingLabels.import}…`
    if (!isLast) return 'Siguiente'
    if (totalSubmittable === 0) return 'Nada para cargar'
    const parts: string[] = []
    if (expensesCount > 0) {
      parts.push(`${expensesCount} gasto${expensesCount === 1 ? '' : 's'}`)
    }
    if (incomesCount > 0) {
      parts.push(`${incomesCount} ingreso${incomesCount === 1 ? '' : 's'}`)
    }
    return `Confirmar ${parts.join(' y ')}`
  })()

  const primaryAction = isLast ? onConfirm : onNext
  const primaryDisabled = isLast ? !canConfirm || busy : busy

  return (
    <View style={styles.stack}>
      <View style={styles.secondaryRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Movimiento anterior"
          disabled={isFirst || busy}
          onPress={onPrev}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { opacity: isFirst || busy ? 0.35 : pressed ? 0.7 : 1 },
          ]}
          hitSlop={8}
        >
          <Text style={[styles.secondaryLabel, { color: theme.colors.textMuted }]}>
            ← Anterior
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isCurrentSkipped ? 'Restaurar este movimiento' : 'Saltear este movimiento'
          }
          disabled={busy}
          onPress={onSkip}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { opacity: busy ? 0.35 : pressed ? 0.7 : 1 },
          ]}
          hitSlop={8}
        >
          <Text style={[styles.secondaryLabel, { color: theme.colors.textMuted }]}>
            {isCurrentSkipped ? 'Restaurar' : 'Saltear este'}
          </Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: primaryDisabled }}
        disabled={primaryDisabled}
        onPress={primaryAction}
        style={({ pressed }) => [
          styles.primary,
          {
            backgroundColor: theme.colors.primary,
            opacity: primaryDisabled ? 0.55 : pressed ? 0.9 : 1,
          },
        ]}
      >
        <Text style={styles.primaryText} numberOfLines={1}>
          {primaryLabel}
          {!isLast ? ' →' : ''}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 6 },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  secondaryBtn: { paddingVertical: 2, paddingHorizontal: 6 },
  secondaryLabel: { fontSize: 12, fontWeight: '700' },
  primary: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F2D06',
    letterSpacing: -0.2,
  },
})
