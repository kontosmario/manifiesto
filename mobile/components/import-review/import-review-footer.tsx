import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { motionDurations } from '@/lib/motion/tokens'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { loadingLabels } from '@/lib/copy/states'

interface Props {
  /** Zero-indexed current step. Last index = summary step. */
  stepIndex: number
  /** Total review rows (NOT counting the summary step). */
  totalSteps: number
  /** When true, the wizard is showing the final summary. */
  isSummary: boolean
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

const EASE_IOS = Easing.bezier(0.32, 0.72, 0, 1)

/**
 * Wizard footer rebuilt for clarity. Anterior + Saltear are visible
 * outlined pill buttons with icon + label (not ghost text), each at
 * 44pt min touch height so a confused user can tell what's tappable at
 * a glance. The primary CTA stays as the dominant full-width action
 * below.
 *
 * On the summary step the layout simplifies: Saltear disappears
 * (nothing to skip from a summary), Anterior becomes "Volver a editar",
 * and the primary CTA flips to "Confirmar".
 */
export function ImportReviewFooter({
  stepIndex,
  totalSteps,
  isSummary,
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
  const isFirst = stepIndex <= 0
  const isLastMovement = !isSummary && stepIndex >= totalSteps - 1
  const totalSubmittable = expensesCount + incomesCount

  const primaryLabel = (() => {
    if (busy) return `${loadingLabels.import}…`
    if (isSummary) {
      if (totalSubmittable === 0) return 'Nada para cargar'
      const parts: string[] = []
      if (expensesCount > 0) {
        parts.push(
          `${expensesCount} gasto${expensesCount === 1 ? '' : 's'}`,
        )
      }
      if (incomesCount > 0) {
        parts.push(
          `${incomesCount} ingreso${incomesCount === 1 ? '' : 's'}`,
        )
      }
      return `Confirmar ${parts.join(' y ')}`
    }
    if (isLastMovement) return 'Revisar y confirmar'
    return 'Siguiente'
  })()

  const primaryIcon: keyof typeof MaterialIcons.glyphMap = (() => {
    if (busy) return 'hourglass-empty'
    if (isSummary) return 'check'
    return 'arrow-forward'
  })()

  const primaryAction = isSummary ? onConfirm : onNext
  const primaryDisabled = isSummary ? !canConfirm || busy : busy

  return (
    <View style={styles.stack}>
      <View style={styles.secondaryRow}>
        <SecondaryButton
          icon="chevron-left"
          label={isSummary ? 'Volver a editar' : 'Anterior'}
          onPress={onPrev}
          disabled={isFirst || busy}
          theme={theme}
        />
        {isSummary ? (
          <View style={styles.secondarySpacer} />
        ) : (
          <SecondaryButton
            icon={isCurrentSkipped ? 'restore' : 'block'}
            label={isCurrentSkipped ? 'Restaurar' : 'Saltear este'}
            helper={isCurrentSkipped ? undefined : 'no se carga'}
            onPress={onSkip}
            disabled={busy}
            tone="warning"
            theme={theme}
          />
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={primaryLabel}
        accessibilityState={{ disabled: primaryDisabled }}
        disabled={primaryDisabled}
        onPress={() => {
          void triggerHaptic(isSummary ? 'success' : 'selection')
          primaryAction()
        }}
        style={({ pressed }) => [
          styles.primary,
          {
            backgroundColor: theme.colors.primary,
            opacity: primaryDisabled ? 0.45 : pressed ? 0.92 : 1,
            transform: pressed && !primaryDisabled ? [{ scale: 0.98 }] : undefined,
          },
        ]}
      >
        <Text style={styles.primaryText} numberOfLines={1}>
          {primaryLabel}
        </Text>
        <MaterialIcons name={primaryIcon} size={20} color="#0F2D06" />
      </Pressable>
    </View>
  )
}

interface SecondaryButtonProps {
  icon: keyof typeof MaterialIcons.glyphMap
  label: string
  helper?: string
  disabled?: boolean
  tone?: 'default' | 'warning'
  onPress: () => void
  theme: ReturnType<typeof useAppTheme>['theme']
}

function SecondaryButton({
  icon,
  label,
  helper,
  disabled = false,
  tone = 'default',
  onPress,
  theme,
}: SecondaryButtonProps) {
  const pressScale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }))

  const tint =
    tone === 'warning' ? theme.colors.warning : theme.colors.textMuted
  const border = disabled ? theme.colors.line : tint

  return (
    <Animated.View style={[styles.secondaryWrap, animatedStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={helper ? `${label}, ${helper}` : label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPressIn={() => {
          if (disabled) return
          pressScale.value = withTiming(0.95, {
            duration: motionDurations.micro,
            easing: EASE_IOS,
          })
        }}
        onPressOut={() => {
          pressScale.value = withTiming(1, {
            duration: motionDurations.micro,
            easing: EASE_IOS,
          })
        }}
        onPress={() => {
          void triggerHaptic('light')
          onPress()
        }}
        style={[
          styles.secondaryBtn,
          {
            borderColor: border,
            opacity: disabled ? 0.4 : 1,
          },
        ]}
        hitSlop={6}
      >
        <MaterialIcons name={icon} size={16} color={tint} />
        <View style={styles.secondaryLabelCol}>
          <Text style={[styles.secondaryLabel, { color: tint }]}>{label}</Text>
          {helper ? (
            <Text style={[styles.secondaryHelper, { color: theme.colors.textSoft }]}>
              {helper}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  secondaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryWrap: { flex: 1 },
  secondarySpacer: { flex: 1 },
  secondaryBtn: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondaryLabelCol: { flex: 1 },
  secondaryLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  secondaryHelper: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  primary: {
    minHeight: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    gap: 8,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F2D06',
    letterSpacing: -0.2,
  },
})
