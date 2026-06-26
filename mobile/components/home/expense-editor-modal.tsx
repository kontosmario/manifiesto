import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { TextField } from '@/components/ui/text-field'
import { Expense } from '@/features/expenses/use-expenses'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import {
  formatPriceInputValue,
  normalizePriceInput,
  parsePrice,
  serializePrice,
} from '@/utils/money'

interface ExpenseEditorModalProps {
  visible: boolean
  title: string
  submitLabel: string
  expense?: Expense | null
  onClose: () => void
  onSubmit: (payload: { description: string; price: number }) => Promise<void> | void
  isBusy?: boolean
}

export function ExpenseEditorModal({
  visible,
  title,
  submitLabel,
  expense,
  onClose,
  onSubmit,
  isBusy = false,
}: ExpenseEditorModalProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const [description, setDescription] = useState(() => expense?.description ?? '')
  const [price, setPrice] = useState(() => (expense ? serializePrice(expense.price) : ''))
  const [isPriceFocused, setPriceFocused] = useState(false)
  const canSubmit = description.trim().length > 0 && Number.isFinite(parsePrice(price))

  return (
    <ModalCard
      visible={visible}
      title={title}
      subtitle={t('home:expenseEditor.subtitle')}
      onClose={onClose}
    >
      <View
        style={[
          styles.intro,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Text style={[styles.introLabel, { color: theme.colors.primaryStrong }]}>{t('home:expenseEditor.quickEdit')}</Text>
        <Text style={[styles.introText, theme.typography.bodySmall, { color: theme.colors.textMuted }]}>
          {t('home:expenseEditor.introText')}
        </Text>
      </View>

      <TextField
        autoCapitalize="sentences"
        autoCorrect={false}
        autoFocus
        label={t('home:expenseEditor.descriptionLabel')}
        maxLength={60}
        onChangeText={setDescription}
        placeholder={t('home:expenseEditor.descriptionPlaceholder')}
        returnKeyType="done"
        value={description}
      />

      <TextField
        helper={t('home:expenseEditor.amountHelper')}
        keyboardType="decimal-pad"
        label={t('home:expenseEditor.amountLabel')}
        onBlur={() => setPriceFocused(false)}
        onChangeText={(value) => setPrice(normalizePriceInput(value))}
        onFocus={() => setPriceFocused(true)}
        placeholder="$ 0"
        value={formatPriceInputValue(price, isPriceFocused)}
      />

      <View style={styles.actions}>
        <AppButton
          disabled={!canSubmit}
          label={submitLabel}
          loading={isBusy}
          onPress={async () => {
            await onSubmit({
              description,
              price: parsePrice(price),
            })
          }}
        />
        <AppButton label={t('home:expenseEditor.cancel')} onPress={onClose} variant="ghost" />
      </View>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  intro: {
    gap: 6,
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  introLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  introText: {},
  actions: {
    gap: 10,
    marginTop: 2,
  },
})
