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
import { formatMissingFields } from '@/lib/form-missing-fields'

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
  /** Whether the current movement has every required field filled.
   *  When false, "Siguiente" disables and the helper line below lists
   *  the missing pieces. Always true on the summary step. */
  canAdvanceCurrent: boolean
  /** Human-readable missing field names for the current row
   *  (`['descripción', 'monto', 'categoría']` etc). Empty on summary. */
  missingFields: readonly string[]
  /** Whether the current step is already marked as skipped. */
  isCurrentSkipped: boolean
  busy: boolean
  onPrev: () => void
  onSkip: () => void
  /** Single handler for the primary CTA. The sheet routes it
   *  contextually: advance on a valid step, confirm on the summary,
   *  or bump the row's highlightToken on a disabled tap so the row
   *  marks its missing fields with `warning`. Footer stays dumb. */
  onPrimary: () => void
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
  canAdvanceCurrent,
  missingFields,
  isCurrentSkipped,
  busy,
  onPrev,
  onSkip,
  onPrimary,
}: Props) {
  const { theme } = useAppTheme()
  const isFirst = stepIndex <= 0
  const isLastMovement = !isSummary && stepIndex >= totalSteps - 1
  const totalSubmittable = expensesCount + incomesCount

  const primaryLabel = (() => {
    if (busy) return `${loadingLabels.import}…`
    if (isSummary) {
      // All-skipped: the CTA now closes (the sheet routes this to onClose),
      // so it must read as a real action, not an inert "nada para cargar".
      if (totalSubmittable === 0) return 'Cerrar'
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
    if (isSummary) return totalSubmittable === 0 ? 'close' : 'check'
    return 'arrow-forward'
  })()

  // Visual-only disabled: the CTA stays tappable even when "disabled"
  // so a tap can route to the sheet's "bump highlightToken" branch
  // instead of advancing. The caller's `onPrimary` decides what each
  // press means. `lookDisabled` controls opacity/affordance; `busy`
  // hard-disables (during the network roundtrip) because we genuinely
  // do not want repeat presses there.
  // All-skipped → the CTA is a live "Cerrar", not a pending/disabled state.
  const lookDisabled = isSummary
    ? totalSubmittable > 0 && !canConfirm
    : !canAdvanceCurrent
  const hardDisabled = busy

  const showMissingHelper =
    !isSummary && !canAdvanceCurrent && missingFields.length > 0

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
            onPress={onSkip}
            disabled={busy}
            theme={theme}
          />
        )}
      </View>

      <PrimaryCTA
        label={primaryLabel}
        icon={primaryIcon}
        lookDisabled={lookDisabled}
        hardDisabled={hardDisabled}
        backgroundColor={lookDisabled ? theme.colors.line : theme.colors.primary}
        foregroundColor={lookDisabled ? theme.colors.textMuted : theme.colors.textOnPrimary}
        onPress={onPrimary}
      />

      {showMissingHelper ? (
        <View style={styles.helperRow}>
          <MaterialIcons
            name="error-outline"
            size={14}
            color={theme.colors.warning}
          />
          <Text
            style={[styles.helperText, { color: theme.colors.warning }]}
            numberOfLines={2}
          >
            {formatMissingFields(missingFields)}
          </Text>
        </View>
      ) : null}
    </View>
  )
}


interface PrimaryCTAProps {
  label: string
  icon: keyof typeof MaterialIcons.glyphMap
  /** Renders the visual disabled affordance (lower opacity, no press
   *  scale) but DOES NOT block the press. Used when required fields
   *  are missing — the sheet wants the press to route to "bump the
   *  row's highlightToken" rather than advance. */
  lookDisabled: boolean
  /** True disabled — no press, no haptic. Reserved for actual
   *  in-flight states (network roundtrip) where re-pressing is a bug. */
  hardDisabled: boolean
  backgroundColor: string
  foregroundColor: string
  onPress: () => void
}

/**
 * Animated.View wrapper around the Pressable so the press scale flows
 * through a Reanimated shared value, not through a `transform` prop
 * that flips between an array and undefined — that pattern crashes
 * iOS at the bridge ("Cannot read property 'forEach' of null").
 */
function PrimaryCTA({
  label,
  icon,
  lookDisabled,
  hardDisabled,
  backgroundColor,
  foregroundColor,
  onPress,
}: PrimaryCTAProps) {
  const pressScale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }))

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: lookDisabled || hardDisabled }}
        disabled={hardDisabled}
        onPressIn={() => {
          if (lookDisabled || hardDisabled) return
          pressScale.value = withTiming(0.98, {
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
        onPress={onPress}
        style={({ pressed }) => [
          styles.primary,
          {
            backgroundColor,
            opacity: hardDisabled ? 0.55 : pressed ? 0.92 : 1,
          },
        ]}
      >
        <Text style={[styles.primaryText, { color: foregroundColor }]} numberOfLines={1}>
          {label}
        </Text>
        <MaterialIcons name={icon} size={20} color={foregroundColor} />
      </Pressable>
    </Animated.View>
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
    letterSpacing: -0.2,
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  helperText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
    textAlign: 'center',
    flexShrink: 1,
  },
})
