import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { PinPad } from '@/components/auth/pin-pad'
import { isPinComplete } from '@/components/auth/pin-pad-model'
import {
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  isWeakPin,
  setPin,
} from '@/lib/pin-lock'
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

// Length options exposed in the UI. Sprint F · F2 widens the legacy
// hard-4 to 4/6 (the two formats users actually recognise). The
// engine accepts any length in [PIN_MIN_LENGTH..PIN_MAX_LENGTH] —
// we just don't show 5/7/8 in the picker for simplicity. 6 digits
// gives 100x the search space of 4 without losing keypad familiarity.
const LENGTH_OPTIONS = [4, 6] as const

/**
 * Two-step PIN setup: enter N digits, then confirm by re-entering.
 * On mismatch, returns to step 1 with an error. On success, saves via
 * `setPin` and calls `onDone`.
 *
 * Sprint F · F2 hardening:
 *  · Length selector (4 or 6 digits) above the pad.
 *  · Weak-PIN rejection (1111, 1234, 0000, ...) with explicit copy.
 */
export function PinSetupScreen({ onDone, onCancel }: PinSetupScreenProps) {
  const { theme } = useAppTheme()
  const [phase, setPhase] = useState<Phase>('enter')
  const [first, setFirst] = useState('')
  const [value, setValue] = useState('')
  const [errorToken, setErrorToken] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pinLength, setPinLength] = useState<number>(4)

  const handleChange = useCallback(
    (next: string) => {
      setValue(next)
      if (!isPinComplete(next, pinLength)) return

      if (phase === 'enter') {
        // Reject weak PINs BEFORE asking for confirmation. Surfacing the
        // error here saves the user from typing it twice and then being
        // told to start over.
        if (isWeakPin(next)) {
          setErrorMessage(
            'Ese PIN es muy fácil de adivinar. Evitá repeticiones (1111) o secuencias (1234).',
          )
          setErrorToken((t) => t + 1)
          setValue('')
          return
        }
        setErrorMessage(null)
        setFirst(next)
        setPhase('confirm')
        setValue('')
        void triggerHaptic('selection')
        return
      }
      // confirm phase
      if (next !== first) {
        setErrorMessage('Los PINs no coinciden. Probá de nuevo.')
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
        .catch((err: unknown) => {
          // Defensive: setPin's own weak-PIN gate catches anything the
          // UI missed (defense in depth). Surface the engine message
          // when present so the user knows why.
          const message =
            err instanceof Error && err.message
              ? err.message
              : 'No pudimos guardar tu PIN. Probá de nuevo.'
          setErrorMessage(message)
          setErrorToken((t) => t + 1)
          setValue('')
          setPhase('enter')
          setFirst('')
          setSaving(false)
        })
    },
    [phase, first, onDone, pinLength],
  )

  const handlePickLength = useCallback(
    (next: number) => {
      if (saving) return
      if (next < PIN_MIN_LENGTH || next > PIN_MAX_LENGTH) return
      setPinLength(next)
      setValue('')
      setFirst('')
      setPhase('enter')
      setErrorMessage(null)
      void triggerHaptic('selection')
    },
    [saving],
  )

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Text style={[styles.title, { color: theme.colors.text }]}>
        {phase === 'enter' ? 'Crea tu PIN' : 'Confirma tu PIN'}
      </Text>
      <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
        {phase === 'enter'
          ? `Elegí un PIN de ${pinLength} dígitos para entrar a la app. Evitá secuencias y repeticiones.`
          : 'Ingresalo de nuevo para confirmar.'}
      </Text>

      {phase === 'enter' ? (
        <View style={styles.lengthRow}>
          {LENGTH_OPTIONS.map((opt) => {
            const active = pinLength === opt
            return (
              <Pressable
                key={opt}
                accessibilityRole="button"
                accessibilityLabel={`Usar PIN de ${opt} dígitos`}
                accessibilityState={{ selected: active }}
                hitSlop={DEFAULT_HIT_SLOP}
                onPress={() => handlePickLength(opt)}
                disabled={saving}
                style={({ pressed }) => [
                  styles.lengthChip,
                  {
                    backgroundColor: active
                      ? theme.colors.text
                      : 'transparent',
                    borderColor: theme.colors.line,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.lengthChipLabel,
                    {
                      color: active
                        ? theme.colors.background
                        : theme.colors.textMuted,
                    },
                  ]}
                >
                  {opt} dígitos
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}

      {errorMessage ? (
        <Text
          style={[styles.errorText, { color: theme.colors.danger ?? '#c1392b' }]}
        >
          {errorMessage}
        </Text>
      ) : null}

      <View style={styles.padWrap}>
        <PinPad
          value={value}
          onChange={handleChange}
          errorToken={errorToken}
          pinLength={pinLength}
        />
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
    marginBottom: 24,
    maxWidth: 320,
    lineHeight: 21,
    paddingHorizontal: 24,
  },
  lengthRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  lengthChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  lengthChipLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 12,
    maxWidth: 300,
    paddingHorizontal: 24,
    lineHeight: 18,
  },
  padWrap: { flex: 1, justifyContent: 'center' },
  cancel: { height: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, fontWeight: '500' },
})
