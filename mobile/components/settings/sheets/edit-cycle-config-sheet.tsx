import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import { CycleConfigSection, isSameCycleConfig } from '@/components/finance/cycle-config-section'
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'
import { OnbSheetBody } from './onb-sheet-parts'

interface EditCycleConfigSheetProps {
  visible: boolean
  currentConfig: FinanceCycleConfig
  isSaving: boolean
  onClose: () => void
  onSave: (next: FinanceCycleConfig) => void
  /** 'cycle' en modo INGRESO DINÁMICO: título y labels sin "cobro". */
  copyVariant?: 'salary' | 'cycle'
}

export function EditCycleConfigSheet({
  visible,
  currentConfig,
  isSaving,
  onClose,
  onSave,
  copyVariant = 'salary',
}: EditCycleConfigSheetProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<FinanceCycleConfig>(currentConfig)

  // Rehydrate al abrir el sheet — si el user cierra sin guardar y vuelve
  // a abrir, arrancamos del estado persistido (no del draft viejo).
  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate draft on open
      setDraft(currentConfig)
    }
  }, [visible, currentConfig])

  const dirty = useMemo(
    () => !isSameCycleConfig(draft, currentConfig),
    [draft, currentConfig],
  )

  return (
    <ModalCard
      skin="neo"
      onClose={onClose}
      subtitle={t(
        copyVariant === 'cycle'
          ? 'settings:editCycle.subtitleCycle'
          : 'settings:editCycle.subtitle',
      )}
      title={t(
        copyVariant === 'cycle' ? 'settings:editCycle.titleCycle' : 'settings:editCycle.title',
      )}
      visible={visible}
      footer={
        <NeoButton
          block
          disabled={!dirty}
          haptic="light"
          label={t('common:actions.save')}
          loading={isSaving}
          onPress={() => {
            if (!dirty) return
            onSave(draft)
          }}
        />
      }
    >
      <OnbSheetBody>
        <CycleConfigSection
          value={draft}
          onChange={setDraft}
          currentConfig={currentConfig}
          copyVariant={copyVariant}
          monthlyDefaultDay={copyVariant === 'cycle' ? 1 : 15}
        />
      </OnbSheetBody>
    </ModalCard>
  )
}
