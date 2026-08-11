import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import { currencyFormatter } from '@/utils/money'
import {
  OnbSheetAmountCard,
  OnbSheetBody,
  OnbSheetError,
  OnbSheetHelper,
  OnbSheetLabel,
} from './onb-sheet-parts'

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
  const [draft, setDraft] = useState(() => Math.max(0, Math.round(currentValue)))

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate draft when sheet opens
      setDraft(Math.max(0, Math.round(currentValue)))
    }
  }, [visible, currentValue])

  const isValid = Number.isFinite(draft) && draft > 0
  const hasChanged = isValid && draft !== currentValue
  const eyebrow = t('settings:editUsdRate.eyebrow')

  return (
    <ModalCard
      skin="neo"
      onClose={onClose}
      subtitle={t('settings:editUsdRate.subtitle')}
      title={t('settings:editUsdRate.title')}
      visible={visible}
      footer={
        <NeoButton
          block
          disabled={!hasChanged}
          haptic="light"
          label={t('settings:editUsdRate.save')}
          loading={isSaving}
          onPress={() => {
            if (!hasChanged) return
            onSave(draft)
          }}
        />
      }
    >
      <OnbSheetBody>
        <OnbSheetLabel>{eyebrow}</OnbSheetLabel>
        <OnbSheetAmountCard kicker={eyebrow} value={draft} onChange={setDraft} />
        {isValid ? (
          <OnbSheetHelper>
            {t('settings:editUsdRate.helperValid', {
              amount: currencyFormatter.format(draft),
            })}
          </OnbSheetHelper>
        ) : (
          <>
            <OnbSheetHelper>{t('settings:editUsdRate.helperInvalid')}</OnbSheetHelper>
            <OnbSheetError>{t('settings:editUsdRate.error')}</OnbSheetError>
          </>
        )}
      </OnbSheetBody>
    </ModalCard>
  )
}
