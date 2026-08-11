import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import {
  MAX_SAVINGS_GOAL_PERCENT,
  deriveSavingsGoalAmount,
} from '@/features/finance/family-finance.model'
import { currencyFormatter } from '@/utils/money'
import { OnbSheetBody, OnbSheetPercentCard } from './onb-sheet-parts'

interface EditSavingsPercentSheetProps {
  visible: boolean
  currentValue: number
  monthlyIncome: number
  isSaving: boolean
  onClose: () => void
  onSave: (nextValue: number) => void
}

/** Atajos del paso de ahorro del onboarding; el 10% lleva el badge. */
const PERCENT_CHIPS = [0, 5, 10, 20, 30] as const
const SUGGESTED_PERCENT = 10

export function EditSavingsPercentSheet({
  visible,
  currentValue,
  monthlyIncome,
  isSaving,
  onClose,
  onSave,
}: EditSavingsPercentSheetProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(() => clampPercent(currentValue))

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate draft when sheet opens
      setDraft(clampPercent(currentValue))
    }
  }, [visible, currentValue])

  const hasChanged = draft !== currentValue

  const footer = useMemo(() => {
    const amount = deriveSavingsGoalAmount(monthlyIncome, draft)
    if (amount <= 0) {
      return t('settings:editSavingsPercent.helperNoIncome')
    }
    return t('settings:editSavingsPercent.helperAmount', {
      amount: currencyFormatter.format(amount),
    })
  }, [monthlyIncome, draft, t])

  return (
    <ModalCard
      skin="neo"
      onClose={onClose}
      subtitle={t('settings:editSavingsPercent.subtitle', { max: MAX_SAVINGS_GOAL_PERCENT })}
      title={t('settings:editSavingsPercent.title')}
      visible={visible}
      footer={
        <NeoButton
          block
          disabled={!hasChanged}
          haptic="light"
          label={t('settings:editSavingsPercent.save')}
          loading={isSaving}
          onPress={() => {
            if (!hasChanged) return
            onSave(draft)
          }}
        />
      }
    >
      <OnbSheetBody>
        <OnbSheetPercentCard
          chips={PERCENT_CHIPS}
          eyebrow={t('settings:editSavingsPercent.eyebrow')}
          footer={footer}
          max={MAX_SAVINGS_GOAL_PERCENT}
          onChange={(next) => setDraft(clampPercent(next))}
          percent={draft}
          suggested={SUGGESTED_PERCENT}
        />
      </OnbSheetBody>
    </ModalCard>
  )
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(MAX_SAVINGS_GOAL_PERCENT, Math.max(0, Math.round(value)))
}
