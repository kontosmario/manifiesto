import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { NeoButton } from '@/components/ui/neo-button'
import { motionDurations } from '@/lib/motion/tokens'
import { triggerHaptic } from '@/lib/haptics'
import { cssGradient, neoRadii } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { formatMissingFields } from '@/lib/form-missing-fields'
import { useImportReviewNeo } from './import-review-neo'

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
 * Wizard footer. Anterior + Saltear son tiles extruidos con icono + label
 * (no texto fantasma), cada uno con 44pt de alto táctil, para que se vea de
 * un vistazo qué se puede tocar. El CTA primario domina abajo a todo el
 * ancho.
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
  const { neo, ink } = useImportReviewNeo()
  const { t } = useTranslation()
  const isFirst = stepIndex <= 0
  const isLastMovement = !isSummary && stepIndex >= totalSteps - 1
  const totalSubmittable = expensesCount + incomesCount

  const primaryLabel = (() => {
    if (busy) return `${t('states:loading.import')}…`
    if (isSummary) {
      // All-skipped: the CTA now closes (the sheet routes this to onClose),
      // so it must read as a real action, not an inert "nada para cargar".
      if (totalSubmittable === 0) return t('common:actions.close')
      const parts: string[] = []
      if (expensesCount > 0) {
        parts.push(t('gastos:import.summary.expensesCount', { count: expensesCount }))
      }
      if (incomesCount > 0) {
        parts.push(t('gastos:import.summary.incomesCount', { count: incomesCount }))
      }
      return t('gastos:import.footer.confirmWith', { parts: parts.join(t('gastos:import.summary.and')) })
    }
    if (isLastMovement) return t('gastos:import.footer.reviewAndConfirm')
    return t('common:actions.next')
  })()

  const primaryIcon: keyof typeof MaterialIcons.glyphMap = (() => {
    if (isSummary) return totalSubmittable === 0 ? 'close' : 'check'
    return 'arrow-forward'
  })()

  // Visual-only disabled: the CTA stays tappable even when "disabled"
  // so a tap can route to the sheet's "bump highlightToken" branch
  // instead of advancing. The caller's `onPrimary` decides what each
  // press means. `lookDisabled` hunde el botón sin bloquearlo; `busy`
  // sí bloquea (durante el roundtrip de red) porque ahí un segundo tap
  // es un bug.
  // All-skipped → the CTA is a live "Cerrar", not a pending/disabled state.
  const lookDisabled = isSummary
    ? totalSubmittable > 0 && !canConfirm
    : !canAdvanceCurrent

  const showMissingHelper =
    !isSummary && !canAdvanceCurrent && missingFields.length > 0

  return (
    <View style={styles.stack}>
      <View style={styles.secondaryRow}>
        <SecondaryButton
          icon="chevron-left"
          label={isSummary ? t('gastos:import.footer.backToEdit') : t('gastos:import.footer.previous')}
          onPress={onPrev}
          disabled={isFirst || busy}
        />
        {isSummary ? (
          <View style={styles.secondarySpacer} />
        ) : (
          <SecondaryButton
            icon={isCurrentSkipped ? 'restore' : 'block'}
            label={isCurrentSkipped ? t('gastos:import.footer.restore') : t('gastos:import.footer.skipThis')}
            onPress={onSkip}
            disabled={busy}
          />
        )}
      </View>

      <NeoButton
        label={primaryLabel}
        onPress={onPrimary}
        lookDisabled={lookDisabled}
        busy={busy}
        fullWidth
        // La tinta del glifo sigue a la del label: hundido lee sobre el pozo
        // (`neo.text`), y en relieve sobre el fill radial (`neo.ctaText`).
        icon={
          <MaterialIcons
            name={primaryIcon}
            size={20}
            color={lookDisabled ? neo.text : neo.ctaText}
          />
        }
      />

      {showMissingHelper ? (
        <View style={styles.helperRow}>
          <MaterialIcons name="error-outline" size={14} color={ink.warn} />
          <Text style={[styles.helperText, { color: ink.warn }]} numberOfLines={2}>
            {formatMissingFields(missingFields)}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

interface SecondaryButtonProps {
  icon: keyof typeof MaterialIcons.glyphMap
  label: string
  disabled?: boolean
  onPress: () => void
}

/**
 * Tile extruido del vocabulario (`raisedSm`) que se HUNDE al quedar inactivo,
 * en vez de bajar de opacidad: `opacity` aplana el subárbol y desvanece fill y
 * tinta contra el mismo material.
 *
 * La tinta es `neo.text` y no `textMuted` — a 13px el muted se queda en 3.73:1
 * sobre el material extruido, y acá da 10.41:1 en claro / 13.77:1 en oscuro.
 * El estado inactivo sí usa `textMuted` (3.73:1): un control deshabilitado
 * está exento de WCAG 1.4.3.
 */
function SecondaryButton({ icon, label, disabled = false, onPress }: SecondaryButtonProps) {
  const { neo, wellFallback } = useImportReviewNeo()
  const pressScale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }))

  const tint = disabled ? neo.textMuted : neo.text
  const material = disabled
    ? [{ backgroundColor: neo.well, boxShadow: neo.shadows.insetSm }, wellFallback]
    : [
        {
          ...cssGradient(neo.raisedGradientCss, neo.surface),
          boxShadow: neo.shadows.raisedSm,
        },
      ]

  return (
    <Animated.View style={[styles.secondaryWrap, animatedStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
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
        style={[styles.secondaryBtn, ...material]}
        hitSlop={6}
      >
        <MaterialIcons color={tint} name={icon} size={16} />
        <Text style={[styles.secondaryLabel, { color: tint }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  )
}

// El `fontFamily` viaja con el peso: cada peso de Nunito es un face estático
// propio, así que sin él el 800 se renderiza como regular.
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
    borderRadius: neoRadii.chip,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryLabel: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.1,
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
    fontFamily: nunitoFamily('700'),
    letterSpacing: -0.1,
    textAlign: 'center',
    flexShrink: 1,
  },
})
