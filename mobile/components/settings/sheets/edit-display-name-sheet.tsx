import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import { NeoTextField } from '@/components/ui/neo-text-field'

interface EditDisplayNameSheetProps {
  visible: boolean
  currentName: string
  isSaving: boolean
  onClose: () => void
  onSave: (nextName: string) => void
}

export function EditDisplayNameSheet({
  visible,
  currentName,
  isSaving,
  onClose,
  onSave,
}: EditDisplayNameSheetProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(currentName)

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate draft when sheet opens
      setDraft(currentName)
    }
  }, [visible, currentName])

  const trimmed = draft.trim()
  const canSave = trimmed.length > 0 && trimmed !== currentName.trim()
  const isInvalid = draft.length > 0 && trimmed.length === 0

  return (
    <ModalCard
      skin="neo"
      onClose={onClose}
      subtitle={t('settings:editName.subtitle')}
      title={t('settings:editName.title')}
      visible={visible}
    >
      <View style={styles.stack}>
        <NeoTextField
          autoFocus
          autoCapitalize="words"
          error={isInvalid ? t('settings:editName.invalid') : undefined}
          label={t('settings:editName.title')}
          maxLength={40}
          onChangeText={setDraft}
          placeholder={t('settings:editName.placeholder')}
          returnKeyType="done"
          value={draft}
        />
        <NeoButton
          block
          disabled={!canSave}
          haptic="light"
          label={t('settings:editName.save')}
          loading={isSaving}
          onPress={() => {
            if (!canSave) return
            onSave(trimmed)
          }}
        />
      </View>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
})
