import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
      title={t('settings:editUsdRate.title')}
      subtitle={t('settings:editUsdRate.subtitle')}
      rawValue={draft}
      onChangeRawValue={setDraft}
      formatDisplay={(raw) => formatPriceInputValue(raw, false)}
      displayEyebrow={t('settings:editUsdRate.eyebrow')}
      displayPlaceholder="$ 1000"
      helper={
        isValid
          ? t('settings:editUsdRate.helperValid', { amount: currencyFormatter.format(parsed) })
          : t('settings:editUsdRate.helperInvalid')
      }
      errorText={showError ? t('settings:editUsdRate.error') : undefined}
      saveLabel={t('settings:editUsdRate.save')}
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
