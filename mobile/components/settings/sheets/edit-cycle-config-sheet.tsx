import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { CycleConfigSection } from '@/components/finance/cycle-config-section'
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'

interface EditCycleConfigSheetProps {
  visible: boolean
  currentConfig: FinanceCycleConfig
  isSaving: boolean
  onClose: () => void
  onSave: (next: FinanceCycleConfig) => void
}

export function EditCycleConfigSheet({
  visible,
  currentConfig,
  isSaving,
  onClose,
  onSave,
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
    () => JSON.stringify(draft) !== JSON.stringify(currentConfig),
    [draft, currentConfig],
  )

  return (
    <ModalCard
      onClose={onClose}
      subtitle={t('settings:editCycle.subtitle')}
      title={t('settings:editCycle.title')}
      visible={visible}
    >
      <View style={styles.stack}>
        <CycleConfigSection
          value={draft}
          onChange={setDraft}
          currentConfig={currentConfig}
        />
        <AppButton
          disabled={!dirty}
          label={t('common:actions.save')}
          loading={isSaving}
          onPress={() => {
            if (!dirty) return
            onSave(draft)
          }}
        />
      </View>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
})
