import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { TextField } from '@/components/ui/text-field'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter, formatMoneyShort } from '@/utils/money'
import { goalEmojiText } from '@/features/savings-goals/goal-icon'

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
  const { t } = useTranslation()
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
      ? t('control:goalEdit.monthlyHint', {
          count: parsedMonths,
          amount: formatMoneyShort(
            Math.ceil((parsedAmount - currentAmount) / parsedMonths),
          ),
        })
      : t('control:goalEdit.monthlyHintEmpty')

  return (
    <ModalCard
      visible={visible}
      onClose={onClose}
      inline={inline}
      title={t('control:goalEdit.title', { emoji: goalEmojiText(goalEmoji), title: goalTitle }).replace(/\s{2,}/g, ' ').trim()}
      subtitle={t('control:goalEdit.subtitle')}
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
            {t('control:goalEdit.yaAhorrado')}
          </Text>
          <Text style={[styles.snapshotValue, { color: theme.colors.text }]}>
            {currencyFormatter.format(currentAmount)}
          </Text>
        </View>

        <TextField
          label={t('control:goalEdit.labelMonto')}
          value={goalAmountText}
          onChangeText={setGoalAmountText}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder={t('control:goalEdit.placeholderMonto')}
          accessibilityLabel={t('control:goalEdit.a11yMonto')}
          helper={
            exceedsCurrent
              ? t('control:goalEdit.exceedsCurrent', {
                  amount: formatMoneyShort(currentAmount),
                })
              : undefined
          }
        />

        <TextField
          label={t('control:goalEdit.labelPlazo')}
          value={monthsText}
          onChangeText={setMonthsText}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder={t('control:goalEdit.placeholderPlazo')}
          accessibilityLabel={t('control:goalEdit.a11yPlazo')}
          helper={monthlyHint}
        />

        <AppButton
          variant="primary"
          label={t('control:goalEdit.cta')}
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
