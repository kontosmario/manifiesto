import { useState } from 'react'
import type { ComponentProps } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { useAppTheme } from '@/theme/theme-provider'
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
  const { theme } = useAppTheme()
  const [selected, setSelected] = useState<OptionId | null>(null)

  // `period_label` viene formateado por el backend ("Mayo 2026" o
  // "20 may → 19 jun" según cycle_type). Lo usamos tal cual.
  const subtitle = `Cerraste ${pending.periodLabel} con un saldo a favor. ¿Qué haces con esa plata?`

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
      onClose={onClose}
      subtitle={subtitle}
      title={`Te sobraron ${formatMoney(pending.sobrante)}`}
      visible={visible}
    >
      <View style={styles.stack}>
        <OptionCard
          icon="track-changes"
          title={activeGoal ? `Sumar a ${activeGoal.title}` : 'A una meta'}
          subtitle={activeGoal ? 'Aporte al goal activo' : 'Primero crea una meta en Home'}
          selected={selected === 'meta'}
          disabled={!activeGoal}
          onPress={() => activeGoal && handlePickOption('meta')}
          accent={theme.colors.primary}
        />
        <OptionCard
          icon="trending-up"
          title="Sumar al mes actual"
          subtitle="Queda como disponible extra este mes"
          selected={selected === 'acumular'}
          onPress={() => handlePickOption('acumular')}
          accent={theme.colors.primary}
        />
        <OptionCard
          icon="savings"
          title="Guardar como reserva"
          subtitle="Plata aparte, sin destino concreto"
          selected={selected === 'reserva'}
          onPress={() => handlePickOption('reserva')}
          accent={theme.colors.primary}
        />
        <AppButton
          label="Confirmar"
          disabled={!canConfirm}
          loading={isApplying}
          onPress={() => void handleConfirm()}
        />
        <Pressable
          onPress={() => void onSkip()}
          accessibilityRole="button"
          style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.5 }]}
        >
          <Text style={[styles.skipText, { color: theme.colors.textMuted }]}>
            Decidir más tarde
          </Text>
        </Pressable>
      </View>
    </ModalCard>
  )
}

function OptionCard({
  icon,
  title,
  subtitle,
  selected,
  disabled = false,
  onPress,
  accent,
}: {
  icon: ComponentProps<typeof MaterialIcons>['name']
  title: string
  subtitle: string
  selected: boolean
  disabled?: boolean
  onPress: () => void
  accent: string
}) {
  const { theme } = useAppTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.option,
        {
          borderColor: selected ? accent : theme.colors.line,
          backgroundColor: selected ? `${accent}1A` : theme.colors.creamSoft,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.optionIcon,
          { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
        ]}
      >
        <MaterialIcons name={icon} size={20} color={accent} />
      </View>
      <View style={styles.optionText}>
        <Text style={[styles.optionTitle, { color: theme.colors.text }]}>{title}</Text>
        <Text
          style={[styles.optionSubtitle, { color: theme.colors.textMuted }]}
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      </View>
      <MaterialIcons
        name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
        size={20}
        color={selected ? accent : theme.colors.textMuted}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 12,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  optionSubtitle: { fontSize: 12 },
  skipBtn: { alignSelf: 'center', padding: 8 },
  skipText: { fontSize: 13, fontWeight: '600' },
})
