import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { PinPad } from '@/components/auth/pin-pad'
import { isPinComplete } from '@/components/auth/pin-pad-model'
import { setPin } from '@/lib/pin-lock'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { DEFAULT_HIT_SLOP } from '@/theme/interaction'

type Phase = 'enter' | 'confirm'

interface PinSetupScreenProps {
  /** Called after the PIN is saved successfully. */
  onDone: () => void
  /** Called when the user cancels (back). */
  onCancel: () => void
}

/**
 * Two-step PIN setup: enter 4 digits, then confirm by re-entering.
 * On mismatch, returns to step 1 with an error. On success, saves via
 * `setPin` and calls `onDone`.
 */
export function PinSetupScreen({ onDone, onCancel }: PinSetupScreenProps) {
  const { theme } = useAppTheme()
  const [phase, setPhase] = useState<Phase>('enter')
  const [first, setFirst] = useState('')
  const [value, setValue] = useState('')
  const [errorToken, setErrorToken] = useState(0)
  const [saving, setSaving] = useState(false)

  const handleChange = useCallback(
    (next: string) => {
      setValue(next)
      if (!isPinComplete(next)) return

      if (phase === 'enter') {
        setFirst(next)
        setPhase('confirm')
        setValue('')
        void triggerHaptic('selection')
        return
      }
      // confirm phase
      if (next !== first) {
        setErrorToken((t) => t + 1)
        setValue('')
        setPhase('enter')
        setFirst('')
        return
      }
      setSaving(true)
      void setPin(next)
        .then(() => {
          void triggerHaptic('success')
          onDone()
        })
        .catch(() => {
          setErrorToken((t) => t + 1)
          setValue('')
          setPhase('enter')
          setFirst('')
          setSaving(false)
        })
    },
    [phase, first, onDone],
  )

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Text style={[styles.title, { color: theme.colors.text }]}>
        {phase === 'enter' ? 'Crea tu PIN' : 'Confirma tu PIN'}
      </Text>
      <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
        {phase === 'enter'
          ? 'Elige un PIN de 4 dígitos para entrar a la app.'
          : 'Ingrésalo de nuevo para confirmar.'}
      </Text>

      <View style={styles.padWrap}>
        <PinPad value={value} onChange={handleChange} errorToken={errorToken} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancelar"
        hitSlop={DEFAULT_HIT_SLOP}
        onPress={onCancel}
        disabled={saving}
        style={({ pressed }) => [styles.cancel, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[styles.cancelText, { color: theme.colors.textMuted }]}>
          Cancelar
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', paddingTop: 96, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 40,
    maxWidth: 300,
    lineHeight: 21,
  },
  padWrap: { flex: 1, justifyContent: 'center' },
  cancel: { height: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, fontWeight: '500' },
})
