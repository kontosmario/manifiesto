import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NumericEditSheet } from '@/components/ui/numeric-edit-sheet'
import {
  MAX_SAVINGS_GOAL_PERCENT,
  deriveSavingsGoalAmount,
} from '@/features/finance/family-finance.model'
import { currencyFormatter } from '@/utils/money'

interface EditSavingsPercentSheetProps {
  visible: boolean
  currentValue: number
  monthlyIncome: number
  isSaving: boolean
  onClose: () => void
  onSave: (nextValue: number) => void
}

export function EditSavingsPercentSheet({
  visible,
  currentValue,
  monthlyIncome,
  isSaving,
  onClose,
  onSave,
}: EditSavingsPercentSheetProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(() => String(currentValue))

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate draft when sheet opens
      setDraft(String(currentValue))
    }
  }, [visible, currentValue])

  const parsed = Number(draft)
  const isValid =
    Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_SAVINGS_GOAL_PERCENT
  const hasChanged = isValid && parsed !== currentValue
  const showError = !isValid && draft.length > 0

  const helper = useMemo(() => {
    if (!isValid) {
      return t('settings:editSavingsPercent.helperInvalid', { max: MAX_SAVINGS_GOAL_PERCENT })
    }
    const amount = deriveSavingsGoalAmount(monthlyIncome, parsed)
    if (amount <= 0) {
      return t('settings:editSavingsPercent.helperNoIncome')
    }
    return t('settings:editSavingsPercent.helperAmount', { amount: currencyFormatter.format(amount) })
  }, [isValid, monthlyIncome, parsed, t])

  return (
    <NumericEditSheet
      visible={visible}
      title={t('settings:editSavingsPercent.title')}
      subtitle={t('settings:editSavingsPercent.subtitle', { max: MAX_SAVINGS_GOAL_PERCENT })}
      rawValue={draft}
      onChangeRawValue={setDraft}
      formatDisplay={(raw) => (raw ? `${raw}%` : '')}
      displayEyebrow={t('settings:editSavingsPercent.eyebrow')}
      displayPlaceholder="20%"
      helper={helper}
      errorText={
        showError
          ? t('settings:editSavingsPercent.error', { max: MAX_SAVINGS_GOAL_PERCENT })
          : undefined
      }
      maxIntegerDigits={3}
      maxDecimalDigits={0}
      saveLabel={t('settings:editSavingsPercent.save')}
      saveDisabled={!hasChanged}
      isSaving={isSaving}
      onSave={() => {
        if (!hasChanged) return
        onSave(parsed)
      }}
      onClose={onClose}
    />
  )
}
