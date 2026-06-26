import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { TextField } from '@/components/ui/text-field'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter, formatMoneyShort } from '@/utils/money'

interface FixedExpenseQuickEditSheetProps {
  visible: boolean
  initialName: string
  initialAmount: number
  isSaving: boolean
  onClose: () => void
  onSubmit: (input: { name: string; amount: number }) => void
  inline?: boolean
}

export function FixedExpenseQuickEditSheet({
  visible,
  initialName,
  initialAmount,
  isSaving,
  onClose,
  onSubmit,
  inline,
}: FixedExpenseQuickEditSheetProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const [name, setName] = useState(initialName)
  const [amountText, setAmountText] = useState(
    String(Math.max(0, Math.round(initialAmount))),
  )

  useEffect(() => {
    if (!visible) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate draft fields when sheet opens
    setName(initialName)
    setAmountText(String(Math.max(0, Math.round(initialAmount))))
  }, [visible, initialName, initialAmount])

  const trimmedName = name.trim()
  const parsedAmount = useMemo(() => {
    const digits = amountText.replace(/[^\d]/g, '')
    return digits === '' ? 0 : parseInt(digits, 10)
  }, [amountText])

  const isValid = trimmedName.length > 0 && parsedAmount > 0
  const delta = parsedAmount - Math.round(initialAmount)
  const deltaHint =
    parsedAmount > 0 && delta !== 0
      ? delta < 0
        ? t('control:fixedEdit.deltaBaja', {
            amount: formatMoneyShort(Math.abs(delta)),
          })
        : t('control:fixedEdit.deltaSube', { amount: formatMoneyShort(delta) })
      : t('control:fixedEdit.deltaIgual')

  return (
    <ModalCard
      visible={visible}
      onClose={onClose}
      inline={inline}
      title={t('control:fixedEdit.title')}
      subtitle={t('control:fixedEdit.subtitle')}
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
            {t('control:fixedEdit.ultimoMonto')}
          </Text>
          <Text style={[styles.snapshotValue, { color: theme.colors.text }]}>
            {currencyFormatter.format(initialAmount)}
          </Text>
        </View>

        <TextField
          label={t('control:fixedEdit.labelNombre')}
          value={name}
          onChangeText={setName}
          placeholder={t('control:fixedEdit.placeholderNombre')}
          accessibilityLabel={t('control:fixedEdit.a11yNombre')}
          maxLength={60}
        />

        <TextField
          label={t('control:fixedEdit.labelMonto')}
          value={amountText}
          onChangeText={setAmountText}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder={t('control:fixedEdit.placeholderMonto')}
          accessibilityLabel={t('control:fixedEdit.a11yMonto')}
          helper={deltaHint}
        />

        <AppButton
          variant="primary"
          label={t('control:fixedEdit.cta')}
          loading={isSaving}
          disabled={!isValid}
          onPress={() => {
            if (!isValid) return
            onSubmit({ name: trimmedName, amount: parsedAmount })
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
