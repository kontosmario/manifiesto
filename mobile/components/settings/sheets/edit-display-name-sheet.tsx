import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { TextField } from '@/components/ui/text-field'
import { useAppTheme } from '@/theme/theme-provider'
import { neoInk } from '@/theme/neo-ink'

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
  const { theme } = useAppTheme()
  const ink = neoInk(theme.isDark ? 'dark' : 'light')
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
        <TextField
          autoFocus
          autoCapitalize="words"
          label={t('settings:editName.title')}
          maxLength={40}
          onChangeText={setDraft}
          placeholder={t('settings:editName.placeholder')}
          returnKeyType="done"
          value={draft}
        />
        {isInvalid ? (
          <Text style={[styles.error, { color: ink.danger }]}>
            {t('settings:editName.invalid')}
          </Text>
        ) : null}
        <AppButton
          disabled={!canSave}
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
  error: { fontSize: 12, fontWeight: '600', paddingHorizontal: 2 },
})
