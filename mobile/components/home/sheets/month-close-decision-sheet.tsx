import { useMemo, useState } from 'react'
import type { ComponentProps } from 'react'
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import { NeoSurface } from '@/components/ui/neo-surface'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
import { triggerHaptic } from '@/lib/haptics'
import { formatMoney } from '@/utils/money'
import type {
  ApplyDecisionInput,
  PendingDecision,
} from '@/features/month-close/use-month-close-decision'

type OptionId = 'meta' | 'acumular' | 'reserva'

interface Props {
  visible: boolean
  pending: PendingDecision
  activeGoal: { id: string; title: string; emoji: string } | null
  /** Fecha ISO (YYYY-MM-DD) que se seteará como cycle anchor cuando el
   *  user elija `acumular`. La calcula el parent desde el ciclo actual. */
  nextCycleAnchor: string
  onApply: (input: ApplyDecisionInput) => Promise<void> | void
  onSkip: () => Promise<void> | void
  onClose: () => void
  isApplying: boolean
}

export function MonthCloseDecisionSheet({
  visible,
  pending,
  activeGoal,
  nextCycleAnchor,
  onApply,
  onSkip,
  onClose,
  isApplying,
}: Props) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const { t } = useTranslation()
  const [selected, setSelected] = useState<OptionId | null>(null)

  // `period_label` viene formateado por el backend ("Mayo 2026" o
  // "20 may → 19 jun" según cycle_type). Lo usamos tal cual.
  const subtitle = t('home:monthClose.subtitle', { period: pending.periodLabel })

  const handlePickOption = (id: OptionId) => {
    void triggerHaptic('selection')
    setSelected(id)
  }

  const handleConfirm = async () => {
    if (!selected) return
    if (selected === 'meta') {
      if (!activeGoal) return
      await onApply({
        monthlySummaryId: pending.monthlySummaryId,
        decision: 'meta',
        metaGoalId: activeGoal.id,
      })
      return
    }
    if (selected === 'acumular') {
      await onApply({
        monthlySummaryId: pending.monthlySummaryId,
        decision: 'acumular',
        newCycleAnchor: nextCycleAnchor,
      })
      return
    }
    await onApply({
      monthlySummaryId: pending.monthlySummaryId,
      decision: 'reserva',
    })
  }

  const canConfirm =
    selected !== null &&
    !isApplying &&
    (selected !== 'meta' || activeGoal !== null)

  return (
    <ModalCard
      skin="neo"
      onClose={onClose}
      subtitle={subtitle}
      title={t('home:monthClose.title', { amount: formatMoney(pending.sobrante) })}
      visible={visible}
    >
      <View style={styles.stack}>
        <OptionCard
          icon="track-changes"
          title={
            activeGoal
              ? t('home:monthClose.metaTitleWithGoal', { goal: activeGoal.title })
              : t('home:monthClose.metaTitle')
          }
          subtitle={
            activeGoal
              ? t('home:monthClose.metaSubtitleActive')
              : t('home:monthClose.metaSubtitleEmpty')
          }
          selected={selected === 'meta'}
          disabled={!activeGoal}
          onPress={() => activeGoal && handlePickOption('meta')}
        />
        <OptionCard
          icon="trending-up"
          title={t('home:monthClose.accumulateTitle')}
          subtitle={t('home:monthClose.accumulateSubtitle')}
          selected={selected === 'acumular'}
          onPress={() => handlePickOption('acumular')}
        />
        <OptionCard
          icon="savings"
          title={t('home:monthClose.reserveTitle')}
          subtitle={t('home:monthClose.reserveSubtitle')}
          selected={selected === 'reserva'}
          onPress={() => handlePickOption('reserva')}
        />
        {/* `NeoButton` dispara el háptico 'selection' antes de `onPress`,
            igual que hacía el `AppButton` primario. `style` sólo conserva
            la altura de 52px del botón V1 (el neo mide por padding). */}
        <NeoButton
          variant="primary"
          block
          style={styles.confirmBtn}
          label={t('home:monthClose.confirm')}
          disabled={!canConfirm}
          busy={isApplying}
          onPress={() => void handleConfirm()}
        />
        <Pressable
          onPress={() => void onSkip()}
          accessibilityRole="button"
          style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.5 }]}
        >
          <Text style={[styles.skipText, { color: neo.textMuted }]}>
            {t('home:monthClose.decideLater')}
          </Text>
        </Pressable>
      </View>
    </ModalCard>
  )
}

/**
 * Opción del cierre de mes. En neo el estado seleccionado NO es un borde de
 * acento: es relieve — `ringSelected` (inset + anillo verde 2.5px) sobre el
 * tinte canónico `selectedTint`, contra el material `raisedMd` de las no
 * seleccionadas. El `accent` que recibía por prop desapareció: las tres
 * opciones usaban el MISMO color, y en el rediseño ese color es el verde de
 * acción del sistema (`neo.green`), que el componente ya resuelve solo.
 *
 * El `Pressable` queda por FUERA de la superficie a propósito: la opacidad de
 * press/disabled tiene que atenuar también el relieve de la card, y un
 * `opacity` aplicado al hijo dejaría el fondo y la sombra a pleno.
 */
function OptionCard({
  icon,
  title,
  subtitle,
  selected,
  disabled = false,
  onPress,
}: {
  icon: ComponentProps<typeof MaterialIcons>['name']
  title: string
  subtitle: string
  selected: boolean
  disabled?: boolean
  onPress: () => void
}) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)

  // Android < API 28/29 descarta el `boxShadow` EN SILENCIO. Sin él la card
  // pierde el anillo que marca la selección y el pozo del ícono queda en
  // `neo.well` sobre el gradiente raised (~1.05:1, invisible). En ese piso
  // ambos caen a un contorno: verde en la opción elegida, divisor en el resto.
  // (El radio de la derecha ya da la señal redundante de selección.)
  const cardFallback = useMemo<ViewStyle | null>(
    () =>
      SUPPORTS_INSET_SHADOW
        ? null
        : { borderWidth: 1.5, borderColor: selected ? neo.green : neo.sheetDivider },
    [neo, selected],
  )
  const wellFallback = useMemo<ViewStyle | null>(
    () =>
      SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: neo.sheetDivider },
    [neo],
  )

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => ({
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <NeoSurface
        variant={selected ? 'ringSelected' : 'raisedMd'}
        radius={neoRadii.tile}
        // Sin `backgroundColor` la variante `raisedMd` pinta el gradiente
        // 145deg del tema; la seleccionada lleva el tinte del sistema.
        backgroundColor={selected ? neo.selectedTint : undefined}
        style={[styles.option, cardFallback]}
      >
        <NeoSurface
          variant="insetSm"
          radius={neoRadii.chip}
          backgroundColor={neo.well}
          style={[styles.optionIcon, wellFallback]}
        >
          <MaterialIcons name={icon} size={20} color={neo.green} />
        </NeoSurface>
        <View style={styles.optionText}>
          <Text style={[styles.optionTitle, { color: neo.text }]}>{title}</Text>
          <Text
            style={[styles.optionSubtitle, { color: neo.textMuted }]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        </View>
        {/* El radio apagado se queda en `textMuted` y NO baja a
            `textTertiary`: es un control, no texto decorativo, y en el tema
            claro el terciario (#9AA694) sobre el material raised da 2.25:1
            — por debajo del 3:1 que WCAG pide para componentes de UI.
            `textMuted` da 3.98:1 en claro y 5.2:1 en oscuro. */}
        <MaterialIcons
          name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
          size={20}
          color={selected ? neo.green : neo.textMuted}
        />
      </NeoSurface>
    </Pressable>
  )
}

// El `fontFamily` viaja SIEMPRE con el peso: cada peso de Nunito es un face
// estático propio, así que un `fontWeight` suelto no cambia la face.
const styles = StyleSheet.create({
  stack: { gap: 12 },
  // Radio y relieve los pone `NeoSurface`; acá queda sólo la caja.
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  optionIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { flex: 1 },
  optionTitle: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    marginBottom: 2,
  },
  optionSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
  confirmBtn: { height: 52, paddingVertical: 0 },
  skipBtn: { alignSelf: 'center', padding: 8 },
  skipText: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
})
