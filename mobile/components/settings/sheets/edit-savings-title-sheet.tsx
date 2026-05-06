import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { TextField } from '@/components/ui/text-field'
import { useAppTheme } from '@/theme/theme-provider'

interface EditSavingsTitleSheetProps {
  visible: boolean
  currentValue: string
  onClose: () => void
  onSave: (next: string) => void
}

export function EditSavingsTitleSheet({
  visible,
  currentValue,
  onClose,
  onSave,
}: EditSavingsTitleSheetProps) {
  const { theme } = useAppTheme()
  const [draft, setDraft] = useState(currentValue)

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate draft when sheet opens
      setDraft(currentValue)
    }
  }, [visible, currentValue])

  const trimmed = draft.trim()
  const isValid = trimmed.length > 0 && trimmed.length <= 40
  const hasChanged = trimmed !== currentValue.trim()
  const canSave = isValid && hasChanged
  const showError = draft.length > 0 && trimmed.length === 0

  return (
    <ModalCard
      onClose={onClose}
      subtitle="El nombre visible de tu meta (ej: Vacaciones, Auto nuevo, Fondo emergencia)."
      title="Título de la meta"
      visible={visible}
    >
      <View style={styles.stack}>
        <TextField
          autoFocus
          autoCapitalize="sentences"
          label="Título"
          maxLength={40}
          onChangeText={setDraft}
          placeholder="Vacaciones en Bariloche"
          returnKeyType="done"
          value={draft}
        />
        {showError ? (
          <Text style={[styles.error, { color: theme.colors.danger }]}>
            Ingresa al menos un caracter válido.
          </Text>
        ) : null}
        <AppButton
          disabled={!canSave}
          label="Guardar título"
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
