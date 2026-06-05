import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
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
      subtitle="Elegí cómo cobrás. Cambiar el tipo aplica al próximo cobro — el ciclo actual sigue su curso."
      title="Ciclo de cobro"
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
          label="Guardar"
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
