import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { TextField } from '@/components/ui/text-field'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'

interface CategoryEditorModalProps {
  visible: boolean
  title: string
  subtitle?: string
  initialValue?: string
  submitLabel: string
  onClose: () => void
  onSubmit: (value: string) => Promise<void> | void
  isBusy?: boolean
}

export function CategoryEditorModal({
  visible,
  title,
  subtitle,
  initialValue = '',
  submitLabel,
  onClose,
  onSubmit,
  isBusy = false,
}: CategoryEditorModalProps) {
  const { theme } = useAppTheme()
  const [value, setValue] = useState(initialValue)
  const canSubmit = value.trim().length > 0

  return (
    <ModalCard visible={visible} title={title} subtitle={subtitle} onClose={onClose}>
      <View
        style={[
          styles.intro,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Text style={[styles.introLabel, { color: theme.colors.primaryStrong }]}>Nombre visible</Text>
        <Text style={[styles.introText, { color: theme.colors.textMuted }]}>
          Usá un nombre corto y claro para reconocer la categoría rápido en filtros y formularios.
        </Text>
      </View>

      <TextField
        autoCapitalize="sentences"
        autoCorrect={false}
        autoFocus
        label="Nombre"
        maxLength={40}
        onChangeText={setValue}
        placeholder="Ej: Transporte"
        returnKeyType="done"
        value={value}
      />

      <View style={styles.actions}>
        <AppButton
          disabled={!canSubmit}
          label={submitLabel}
          loading={isBusy}
          onPress={async () => {
            await onSubmit(value)
          }}
        />
        <AppButton label="Cancelar" onPress={onClose} variant="ghost" />
      </View>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  intro: {
    gap: 6,
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  introLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  introText: {
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    gap: 10,
    marginTop: 2,
  },
})
