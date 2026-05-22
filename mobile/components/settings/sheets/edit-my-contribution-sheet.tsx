import { useEffect, useMemo, useState } from 'react'
import { NumericEditSheet } from '@/components/ui/numeric-edit-sheet'
import {
  currencyFormatter,
  formatPriceInputValue,
  parsePrice,
  serializePrice,
} from '@/utils/money'

interface EditMyContributionSheetProps {
  visible: boolean
  currentValue: number
  householdTotal: number
  isSaving: boolean
  /** Modo solo: copy personal sin "hogar/aporte/miembros". */
  isSolo?: boolean
  onClose: () => void
  onSave: (nextValue: number) => void
}

export function EditMyContributionSheet({
  visible,
  currentValue,
  householdTotal,
  isSaving,
  isSolo = false,
  onClose,
  onSave,
}: EditMyContributionSheetProps) {
  const [draft, setDraft] = useState(() => serializePrice(currentValue))

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate draft when sheet opens
      setDraft(serializePrice(currentValue))
    }
  }, [visible, currentValue])

  const parsed = useMemo(() => parsePrice(draft), [draft])
  // 0 is a valid contribution (member doesn't contribute income).
  const isValid = Number.isFinite(parsed) && parsed >= 0
  const hasChanged = isValid && parsed !== currentValue
  const showError = !isValid && draft.length > 0

  const projectedTotal = isValid
    ? Math.max(0, householdTotal - currentValue + parsed)
    : householdTotal

  return (
    <NumericEditSheet
      visible={visible}
      title={isSolo ? 'Ingreso mensual' : 'Mi aporte mensual'}
      subtitle={
        isSolo
          ? 'Es tu ingreso mensual. Lo usamos para calcular tu presupuesto.'
          : 'Es lo que tú aportas al ingreso del hogar. El total del hogar se recalcula automáticamente con la suma de los aportes de cada miembro.'
      }
      rawValue={draft}
      onChangeRawValue={setDraft}
      formatDisplay={(raw) => formatPriceInputValue(raw, false)}
      displayEyebrow={isSolo ? 'INGRESO' : 'MI APORTE'}
      displayPlaceholder="$ 0"
      helper={
        isValid
          ? isSolo
            ? undefined
            : `Total del hogar: ${currencyFormatter.format(projectedTotal)}.`
          : 'Ingresa un monto válido (puede ser 0).'
      }
      errorText={
        showError
          ? isSolo
            ? 'El ingreso no puede ser negativo.'
            : 'El aporte no puede ser negativo.'
          : undefined
      }
      saveLabel={isSolo ? 'Guardar' : 'Guardar aporte'}
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
