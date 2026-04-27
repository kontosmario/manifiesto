import { useEffect, useMemo, useState } from 'react'
import { NumericEditSheet } from '@/components/ui/numeric-edit-sheet'
import {
  currencyFormatter,
  formatPriceInputValue,
  parsePrice,
  serializePrice,
} from '@/utils/money'

interface EditIncomeSheetProps {
  visible: boolean
  currentValue: number
  isSaving: boolean
  onClose: () => void
  onSave: (nextValue: number) => void
}

export function EditIncomeSheet({
  visible,
  currentValue,
  isSaving,
  onClose,
  onSave,
}: EditIncomeSheetProps) {
  const [draft, setDraft] = useState(() => serializePrice(currentValue))

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate draft when sheet opens
      setDraft(serializePrice(currentValue))
    }
  }, [visible, currentValue])

  const parsed = useMemo(() => parsePrice(draft), [draft])
  const isValid = Number.isFinite(parsed) && parsed > 0
  const hasChanged = isValid && parsed !== currentValue
  const showError = !isValid && draft.length > 0

  return (
    <NumericEditSheet
      visible={visible}
      title="Ingreso mensual"
      subtitle="Es el ingreso mensual conjunto del hogar. Se usa para calcular ahorro, presupuesto y límites."
      rawValue={draft}
      onChangeRawValue={setDraft}
      formatDisplay={(raw) => formatPriceInputValue(raw, false)}
      displayEyebrow="INGRESO MENSUAL"
      displayPlaceholder="$ 0"
      helper={
        isValid
          ? `Se guardará como ${currencyFormatter.format(parsed)}.`
          : 'Ingresá un monto mayor a cero.'
      }
      errorText={showError ? 'El ingreso debe ser mayor a cero.' : undefined}
      saveLabel="Guardar ingreso"
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
