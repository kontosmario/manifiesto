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
  const [draft, setDraft] = useState(() => Math.max(0, Math.round(currentValue)))

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate draft when sheet opens
      setDraft(Math.max(0, Math.round(currentValue)))
    }
  }, [visible, currentValue])

  // 0 es un aporte válido (el miembro no aporta ingreso).
  const isValid = Number.isFinite(draft) && draft >= 0
  const hasChanged = isValid && draft !== currentValue
  const projectedTotal = isValid
    ? Math.max(0, householdTotal - currentValue + draft)
    : householdTotal

  const eyebrow = isSolo
    ? t('settings:editContribution.eyebrowSolo')
    : t('settings:editContribution.eyebrow')

  return (
    <ModalCard
      skin="neo"
      onClose={onClose}
      subtitle={
        isSolo
          ? t('settings:editContribution.subtitleSolo')
          : t('settings:editContribution.subtitle')
      }
      title={
        isSolo ? t('settings:editContribution.titleSolo') : t('settings:editContribution.title')
      }
      visible={visible}
      footer={
        <NeoButton
          block
          disabled={!hasChanged}
          haptic="light"
          label={isSolo ? t('common:actions.save') : t('settings:editContribution.save')}
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
          isSolo ? null : (
            <OnbSheetHelper>
              {t('settings:editContribution.helperTotal', {
                amount: currencyFormatter.format(projectedTotal),
              })}
            </OnbSheetHelper>
          )
        ) : (
          <>
            <OnbSheetHelper>{t('settings:editContribution.helperInvalid')}</OnbSheetHelper>
            <OnbSheetError>
              {isSolo
                ? t('settings:editContribution.errorSolo')
                : t('settings:editContribution.error')}
            </OnbSheetError>
          </>
        )}
      </OnbSheetBody>
    </ModalCard>
  )
}
