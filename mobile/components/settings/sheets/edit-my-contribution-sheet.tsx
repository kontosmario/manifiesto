import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
      title={isSolo ? t('settings:editContribution.titleSolo') : t('settings:editContribution.title')}
      subtitle={
        isSolo
          ? t('settings:editContribution.subtitleSolo')
          : t('settings:editContribution.subtitle')
      }
      rawValue={draft}
      onChangeRawValue={setDraft}
      formatDisplay={(raw) => formatPriceInputValue(raw, false)}
      displayEyebrow={isSolo ? t('settings:editContribution.eyebrowSolo') : t('settings:editContribution.eyebrow')}
      displayPlaceholder="$ 0"
      helper={
        isValid
          ? isSolo
            ? undefined
            : t('settings:editContribution.helperTotal', { amount: currencyFormatter.format(projectedTotal) })
          : t('settings:editContribution.helperInvalid')
      }
      errorText={
        showError
          ? isSolo
            ? t('settings:editContribution.errorSolo')
            : t('settings:editContribution.error')
          : undefined
      }
      saveLabel={isSolo ? t('common:actions.save') : t('settings:editContribution.save')}
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
