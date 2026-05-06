import { useEffect, useMemo, useState } from 'react'
import { NumericEditSheet } from '@/components/ui/numeric-edit-sheet'
import {
  currencyFormatter,
  formatPriceInputValue,
  parsePrice,
  serializePrice,
} from '@/utils/money'

interface EditUsdRateSheetProps {
  visible: boolean
  currentValue: number
  isSaving: boolean
  onClose: () => void
  onSave: (nextValue: number) => void
}

export function EditUsdRateSheet({
  visible,
  currentValue,
  isSaving,
  onClose,
  onSave,
}: EditUsdRateSheetProps) {
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
      title="Cotización USD"
      subtitle="Cotización de referencia para mostrar equivalentes USD dentro de la app."
      rawValue={draft}
      onChangeRawValue={setDraft}
      formatDisplay={(raw) => formatPriceInputValue(raw, false)}
      displayEyebrow="ARS POR USD"
      displayPlaceholder="$ 1000"
      helper={
        isValid
          ? `1 USD ≈ ${currencyFormatter.format(parsed)}.`
          : 'Ingresa la cotización actual en ARS.'
      }
      errorText={showError ? 'La cotización debe ser mayor a cero.' : undefined}
      saveLabel="Guardar cotización"
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
