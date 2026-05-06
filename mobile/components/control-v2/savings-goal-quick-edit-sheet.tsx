import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { TextField } from '@/components/ui/text-field'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter, formatMoneyShort } from '@/utils/money'

interface SavingsGoalQuickEditSheetProps {
  visible: boolean
  goalTitle: string
  goalEmoji: string
  initialGoalAmount: number
  initialTargetMonths: number | null
  currentAmount: number
  isSaving: boolean
  onClose: () => void
  onSubmit: (input: { goalAmount: number; targetMonths: number | null }) => void
  inline?: boolean
}

const MAX_MONTHS = 240

export function SavingsGoalQuickEditSheet({
  visible,
  goalTitle,
  goalEmoji,
  initialGoalAmount,
  initialTargetMonths,
  currentAmount,
  isSaving,
  onClose,
  onSubmit,
  inline,
}: SavingsGoalQuickEditSheetProps) {
  const { theme } = useAppTheme()
  const [goalAmountText, setGoalAmountText] = useState(
    String(Math.max(0, Math.round(initialGoalAmount))),
  )
  const [monthsText, setMonthsText] = useState(
    initialTargetMonths != null ? String(initialTargetMonths) : '',
  )

  useEffect(() => {
    if (!visible) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate draft fields when sheet opens
    setGoalAmountText(String(Math.max(0, Math.round(initialGoalAmount))))
    setMonthsText(initialTargetMonths != null ? String(initialTargetMonths) : '')
  }, [visible, initialGoalAmount, initialTargetMonths])

  const parsedAmount = useMemo(() => {
    const digits = goalAmountText.replace(/[^\d]/g, '')
    return digits === '' ? 0 : parseInt(digits, 10)
  }, [goalAmountText])

  const parsedMonths = useMemo(() => {
    const digits = monthsText.replace(/[^\d]/g, '')
    if (digits === '') return null
    const value = parseInt(digits, 10)
    if (!Number.isFinite(value) || value <= 0) return null
    return Math.min(MAX_MONTHS, value)
  }, [monthsText])

  const isValid = parsedAmount > 0 && parsedAmount >= currentAmount
  const exceedsCurrent = parsedAmount > 0 && parsedAmount < currentAmount
  const monthlyHint =
    parsedMonths != null && parsedAmount > currentAmount
      ? `Para llegar en ${parsedMonths} ${parsedMonths === 1 ? 'mes' : 'meses'} sumas ${formatMoneyShort(
          Math.ceil((parsedAmount - currentAmount) / parsedMonths),
        )} por mes.`
      : 'Déjalo vacío si no quieres fijar un plazo.'

  return (
    <ModalCard
      visible={visible}
      onClose={onClose}
      inline={inline}
      title={`Ajustar meta · ${goalEmoji} ${goalTitle}`}
      subtitle="Cambia el monto objetivo o el plazo. El avance actual se mantiene."
    >
      <View style={styles.body}>
        <View
          style={[
            styles.snapshotCard,
            {
              backgroundColor: theme.colors.surfaceMuted,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.snapshotEyebrow, { color: theme.colors.textMuted }]}>
            YA AHORRADO
          </Text>
          <Text style={[styles.snapshotValue, { color: theme.colors.text }]}>
            {currencyFormatter.format(currentAmount)}
          </Text>
        </View>

        <TextField
          label="Monto objetivo"
          value={goalAmountText}
          onChangeText={setGoalAmountText}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder="0"
          accessibilityLabel="Monto objetivo de la meta"
          helper={
            exceedsCurrent
              ? `El objetivo no puede ser menor al avance (${formatMoneyShort(currentAmount)}).`
              : undefined
          }
        />

        <TextField
          label="Plazo en meses"
          value={monthsText}
          onChangeText={setMonthsText}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder="Sin plazo"
          accessibilityLabel="Plazo objetivo en meses"
          helper={monthlyHint}
        />

        <AppButton
          variant="primary"
          label="Guardar cambios"
          loading={isSaving}
          disabled={!isValid}
          onPress={() => {
            if (!isValid) return
            onSubmit({ goalAmount: parsedAmount, targetMonths: parsedMonths })
          }}
        />
      </View>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: 14,
  },
  snapshotCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'flex-start',
  },
  snapshotEyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '800',
    marginBottom: 4,
  },
  snapshotValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
})
