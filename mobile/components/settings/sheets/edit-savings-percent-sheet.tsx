import { useEffect, useMemo, useState } from 'react'
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
      return `Debe estar entre 0 y ${MAX_SAVINGS_GOAL_PERCENT}%.`
    }
    const amount = deriveSavingsGoalAmount(monthlyIncome, parsed)
    if (amount <= 0) {
      return 'Fijá un ingreso mensual para proyectar el monto de ahorro.'
    }
    return `Equivale a ${currencyFormatter.format(amount)} por mes.`
  }, [isValid, monthlyIncome, parsed])

  return (
    <NumericEditSheet
      visible={visible}
      title="Meta de ahorro"
      subtitle={`Porcentaje del ingreso mensual que quieres reservar para ahorro. Máximo ${MAX_SAVINGS_GOAL_PERCENT}%.`}
      rawValue={draft}
      onChangeRawValue={setDraft}
      formatDisplay={(raw) => (raw ? `${raw}%` : '')}
      displayEyebrow="% SOBRE INGRESO"
      displayPlaceholder="20%"
      helper={helper}
      errorText={
        showError
          ? `Ingresa un porcentaje entre 0 y ${MAX_SAVINGS_GOAL_PERCENT}.`
          : undefined
      }
      maxIntegerDigits={3}
      maxDecimalDigits={0}
      saveLabel="Guardar meta"
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
