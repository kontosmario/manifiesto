import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { NeoButton } from '@/components/ui/neo-button'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionDurations } from '@/lib/motion/tokens'
import { triggerHaptic } from '@/lib/haptics'
import { cssGradient, neoRadii } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { formatMissingFields } from '@/lib/form-missing-fields'
import { formatMoney } from '@/features/import-review/format'
import { useImportReviewNeo } from './import-review-neo'

/** Qué está mirando el usuario. El footer NO decide, sólo se adapta. */
export type FooterView = 'receipt' | 'list' | 'edit'

interface Props {
  view: FooterView
  /** Etiqueta del CTA primario ya resuelta por el sheet. */
  expensesCount: number
  incomesCount: number
  /** Plata que se va a cargar. Encabeza el CTA junto al conteo. */
  submittableTotal: number
  /** `false` cuando hay filas incompletas o no hay nada para cargar. */
  canConfirm: boolean
  /** Campos faltantes de la fila abierta (sólo en `edit` y `receipt`). */
  missingFields: readonly string[]
  /** Cuántas filas quedan sin completar (sólo en `list`). */
  missingCount: number
  /** En `edit`: si la fila abierta está marcada como "no cargar". */
  isCurrentSkipped: boolean
  /** En `edit`: hay otra fila incompleta a la que saltar. */
  hasNextPending: boolean
  /** En `list`/`edit` con más de una fila: se puede volver a la bandeja. */
  canGoBack: boolean
  /** Hubo un intento con filas caídas: el CTA pasa a ser un reintento. */
  hasFailures: boolean
  busy: boolean
  onPrimary: () => void
  onBack: () => void
  onEdit: () => void
  /** En `list`: abre la primera fila incompleta. */
  onResolveMissing: () => void
  onNotNow: () => void
  onToggleSkip: () => void
  onNextPending: () => void
}

const EASE_IOS = Easing.bezier(0.32, 0.72, 0, 1)

/**
 * Footer del flujo. Tres formas, una por vista:
 *
 *  - `receipt` → CTA de registrar + [Editar] [Ahora no]
 *  - `list`    → CTA de cargar todo + [Completá los que faltan] / [Ahora no]
 *  - `edit`    → CTA de volver a la raíz + [No cargar este] [Siguiente pendiente]
 *
 * "Ahora no" NUNCA destruye: cierra la hoja dejando lo no decidido
 * pendiente. Descartar un movimiento es "No cargar este", que vive adentro
 * de la edición y es reversible mientras la hoja siga abierta. Antes los dos
 * significados compartían el verbo "Saltear", y en Apple Pay ese verbo
 * borraba la única copia del pago.
 */
export function ImportReviewFooter({
  view,
  expensesCount,
  incomesCount,
  submittableTotal,
  canConfirm,
  missingFields,
  missingCount,
  isCurrentSkipped,
  hasNextPending,
  canGoBack,
  hasFailures,
  busy,
  onPrimary,
  onBack,
  onEdit,
  onResolveMissing,
  onNotNow,
  onToggleSkip,
  onNextPending,
}: Props) {
  const { neo, ink } = useImportReviewNeo()
  const { t } = useTranslation()

  const totalSubmittable = expensesCount + incomesCount

  const countParts = (() => {
    const parts: string[] = []
    if (expensesCount > 0) {
      parts.push(t('gastos:import.summary.expensesCount', { count: expensesCount }))
    }
    if (incomesCount > 0) {
      parts.push(t('gastos:import.summary.incomesCount', { count: incomesCount }))
    }
    return parts.join(t('gastos:import.summary.and'))
  })()

  const primaryLabel = (() => {
    if (busy) return `${t('states:loading.import')}…`
    // Desde la edición se vuelve SIEMPRE a la raíz — pero con un solo
    // movimiento esa raíz es el recibo, no una lista: prometer "volver a la
    // lista" ahí sería mentir sobre a dónde lleva el tap.
    if (view === 'edit') {
      return canGoBack ? t('gastos:import.footer.backToList') : t('common:actions.done')
    }
    if (totalSubmittable === 0) return t('common:actions.close')
    // Después de un fallo el CTA deja de prometer una carga nueva: lo que
    // queda en la hoja es exactamente lo que se cayó.
    if (hasFailures) return t('gastos:import.repair.retry')
    if (view === 'receipt') {
      return incomesCount > 0
        ? t('gastos:import.receipt.confirmIncome')
        : t('gastos:import.receipt.confirmExpense')
    }
    return t('gastos:import.footer.confirmTotal', {
      parts: countParts,
      amount: formatMoney(submittableTotal),
    })
  })()

  const primaryIcon: keyof typeof MaterialIcons.glyphMap = (() => {
    if (view === 'edit') return 'check'
    if (totalSubmittable === 0) return 'close'
    if (hasFailures) return 'refresh'
    return 'check'
  })()

  // Visual-only disabled: el CTA sigue siendo tappable para que el tap
  // pueda enrutar al "marcá lo que falta" en vez de no hacer nada.
  const lookDisabled =
    view === 'edit'
      ? missingFields.length > 0 && !isCurrentSkipped
      : totalSubmittable > 0 && !canConfirm

  const helperLine = (() => {
    if (busy) return null
    if (view === 'list') return null
    if (missingFields.length > 0 && !isCurrentSkipped) {
      return formatMissingFields(missingFields)
    }
    return null
  })()

  return (
    <View style={styles.stack}>
      <View style={styles.secondaryRow}>
        {view === 'edit' ? (
          <>
            <SecondaryButton
              icon={isCurrentSkipped ? 'restore' : 'block'}
              label={
                isCurrentSkipped
                  ? t('gastos:import.footer.loadThis')
                  : t('gastos:import.footer.dontLoad')
              }
              onPress={onToggleSkip}
              disabled={busy}
            />
            {hasNextPending ? (
              <SecondaryButton
                icon="arrow-downward"
                label={t('gastos:import.footer.nextPending')}
                onPress={onNextPending}
                disabled={busy}
              />
            ) : canGoBack ? (
              <SecondaryButton
                icon="chevron-left"
                label={t('gastos:import.footer.backToList')}
                onPress={onBack}
                disabled={busy}
              />
            ) : (
              <View style={styles.spacer} />
            )}
          </>
        ) : view === 'receipt' ? (
          <>
            <SecondaryButton
              icon="edit"
              label={t('gastos:import.footer.edit')}
              onPress={onEdit}
              disabled={busy}
            />
            <SecondaryButton
              icon="schedule"
              label={hasFailures ? t('gastos:import.repair.giveUp') : t('gastos:import.footer.notNow')}
              onPress={onNotNow}
              disabled={busy}
            />
          </>
        ) : (
          <>
            {missingCount > 0 ? (
              <SecondaryButton
                icon="arrow-downward"
                label={t('gastos:import.list.resolveCta', { count: missingCount })}
                onPress={onResolveMissing}
                disabled={busy}
              />
            ) : null}
            <SecondaryButton
              icon="schedule"
              label={hasFailures ? t('gastos:import.repair.giveUp') : t('gastos:import.footer.notNow')}
              onPress={onNotNow}
              disabled={busy}
            />
          </>
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

      {helperLine !== null ? (
        <View style={styles.helperRow}>
          <MaterialIcons name="error-outline" size={14} color={ink.warn} />
          <Text style={[styles.helperText, { color: ink.warn }]} numberOfLines={2}>
            {helperLine}
          </Text>
        </View>
      ) : view !== 'edit' ? (
        <Text style={[styles.footnote, { color: neo.textMuted }]} numberOfLines={2}>
          {t('gastos:import.footer.notNowHint')}
        </Text>
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
  const reduced = useReducedMotion()
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
          // Con Movimiento reducido el press-scale no corre: era uno de los
          // tres press-scale hechos a mano que ignoraban la preferencia.
          if (disabled || reduced) return
          pressScale.value = withTiming(0.95, {
            duration: motionDurations.micro,
            easing: EASE_IOS,
          })
        }}
        onPressOut={() => {
          if (reduced) return
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
  spacer: { flex: 1 },
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
  footnote: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    paddingHorizontal: 8,
  },
})
