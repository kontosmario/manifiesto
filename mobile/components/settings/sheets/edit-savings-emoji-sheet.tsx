import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { TextField } from '@/components/ui/text-field'
import { triggerHaptic } from '@/lib/haptics'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface EditSavingsEmojiSheetProps {
  visible: boolean
  currentValue: string
  onClose: () => void
  onSave: (next: string) => void
}

// 18 presets in a 6×3 grid — broad coverage without feeling like a
// picker. Picked to cover common savings themes: trips, home, health,
// tech, gifts, vehicles, education.
const PRESETS = [
  '🎯', '🏖️', '🚗', '🏠', '💻', '✈️',
  '🎓', '💍', '🏥', '🛟', '🪴', '🎁',
  '🛏️', '📱', '🎸', '🐶', '🌱', '💼',
]

export function EditSavingsEmojiSheet({
  visible,
  currentValue,
  onClose,
  onSave,
}: EditSavingsEmojiSheetProps) {
  const { theme } = useAppTheme()
  const [draft, setDraft] = useState(currentValue || '🎯')
  const [customOpen, setCustomOpen] = useState(false)

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate draft when sheet opens
      setDraft(currentValue || '🎯')
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset custom-input visibility when sheet opens
      setCustomOpen(false)
    }
  }, [visible, currentValue])

  const trimmed = draft.trim()
  const isValid = trimmed.length > 0 && trimmed.length <= 4
  const hasChanged = trimmed !== currentValue
  const canSave = isValid && hasChanged

  return (
    <ModalCard
      onClose={onClose}
      subtitle="Elegí el que mejor represente tu meta."
      title="Emoji de la meta"
      visible={visible}
    >
      <View style={styles.stack}>
        <View style={styles.grid}>
          {PRESETS.map((emoji) => {
            const isOn = emoji === trimmed
            return (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityState={{ selected: isOn }}
                onPress={() => {
                  void triggerHaptic('selection')
                  setDraft(emoji)
                }}
                style={[
                  styles.gridCell,
                  {
                    backgroundColor: isOn
                      ? theme.colors.primary
                      : theme.colors.creamCard,
                    borderColor: isOn
                      ? theme.colors.primary
                      : theme.colors.line,
                  },
                ]}
              >
                <Text style={styles.gridGlyph}>{emoji}</Text>
              </Pressable>
            )
          })}
        </View>

        {customOpen ? (
          <TextField
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            label="Escribí el tuyo"
            maxLength={4}
            onChangeText={setDraft}
            placeholder="🎯"
            returnKeyType="done"
            value={draft}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void triggerHaptic('selection')
              setCustomOpen(true)
            }}
            style={styles.customToggle}
          >
            <Text
              style={[styles.customToggleText, { color: theme.colors.textMuted }]}
            >
              Escribir otro emoji
            </Text>
          </Pressable>
        )}

        <AppButton
          disabled={!canSave}
          label="Guardar emoji"
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gridCell: {
    // 6 columns → (100% - 5×6pt gap) / 6 ≈ 15.1%
    width: '15.1%',
    aspectRatio: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gridGlyph: {
    fontSize: 22,
    // Match lineHeight to fontSize + set textAlignVertical/includeFontPadding
    // so the emoji glyph sits dead-center inside the cell instead of
    // being pushed down by the default font ascent/descent metrics.
    lineHeight: 22,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  customToggle: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  customToggleText: {
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
})
