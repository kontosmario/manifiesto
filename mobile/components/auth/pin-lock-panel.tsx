import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useTranslation } from 'react-i18next'
import { FernLogo } from '@/components/auth/fern-logo'
import { PinPad } from '@/components/auth/pin-pad'
import { isPinComplete } from '@/components/auth/pin-pad-model'
import { dispatchAuthFlow } from '@/features/auth-flow/auth-flow-controller'
import { getPinLength, verifyPin } from '@/lib/pin-lock'
import { triggerHaptic } from '@/lib/haptics'
import { useScreenCaptureProtection } from '@/lib/use-screen-capture-protection'
import { useAppTheme } from '@/theme/theme-provider'
import { DEFAULT_HIT_SLOP } from '@/theme/interaction'

/**
 * Panel de desbloqueo por PIN — embebido en BootScreen cuando la
 * máquina auth-flow está en `locked:pin` (spec 2026-06-11). Extraído
 * de la ex pin-unlock-screen; diseño, lockout y screen-capture
 * protection intactos. La sesión ya fue verificada en `probing`, así
 * que aquí no hay session check: solo verificación local del PIN.
 *
 *  - PIN correcto → PIN_OK (la máquina entra al bridge premium)
 *  - "Olvidé mi PIN" → USE_PASSWORD_FALLBACK (login con password)
 */
export function PinLockPanel() {
  // Sprint P · Audit #9 P-3: block screen recording / screenshots
  // while the PIN-pad is on screen.
  useScreenCaptureProtection()
  const { t } = useTranslation()
  const { theme } = useAppTheme()

  const [value, setValue] = useState('')
  const [errorToken, setErrorToken] = useState(0)
  const [checking, setChecking] = useState(false)
  const [lockoutMessage, setLockoutMessage] = useState<string | null>(null)
  // Sprint K · Audit #4 K-4: start as `null` instead of defaulting to 4.
  // Con un PIN de 6 dígitos, defaultear a 4 hacía que un tap rápido
  // auto-submitteara a los 4 dígitos — quemando presupuesto de lockout.
  const [pinLength, setPinLength] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void getPinLength().then((len) => {
      if (!cancelled) setPinLength(len)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleChange = useCallback(
    (next: string) => {
      if (checking) return
      if (pinLength === null) return
      setValue(next)
      if (!isPinComplete(next, pinLength)) return
      setChecking(true)
      void verifyPin(next)
        .then((result) => {
          if (result.ok) {
            void triggerHaptic('success')
            dispatchAuthFlow({ type: 'PIN_OK' })
            return
          }
          if (result.lockedForMs > 0) {
            const seconds = Math.ceil(result.lockedForMs / 1000)
            setLockoutMessage(t('auth:pinLock.lockout', { seconds }))
          } else {
            setLockoutMessage(null)
          }
          setErrorToken((t) => t + 1)
          setValue('')
          setChecking(false)
        })
        .catch(() => {
          // verifyPin lee SecureStore + PBKDF2; en error (storage
          // corrupto / hash inválido) el UI quedaba con `checking=true`
          // para siempre. Reseteamos como intento fallido y dejamos
          // que el user reintente. Code review screens-B4.
          setErrorToken((t) => t + 1)
          setValue('')
          setChecking(false)
        })
    },
    [checking, pinLength, t],
  )

  // G4 fix (2026-06-11): NO logout destructivo — fallback a login con
  // password. Si el user realmente quiere cerrar sesión, lo hace desde
  // Settings → Cerrar sesión.
  const handleForgot = useCallback(() => {
    dispatchAuthFlow({ type: 'USE_PASSWORD_FALLBACK' })
  }, [])

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <View style={styles.header}>
        <FernLogo size={64} />
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {t('auth:pinLock.title')}
        </Text>
      </View>

      <View style={styles.padWrap}>
        {pinLength === null ? (
          // Sprint K · Audit #4 K-4: hold rendering of PinPad until we
          // know the real PIN length.
          <ActivityIndicator color={theme.colors.primary} />
        ) : (
          <PinPad
            errorToken={errorToken}
            onChange={handleChange}
            pinLength={pinLength}
            value={value}
          />
        )}
        {lockoutMessage ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.lockoutText, { color: theme.colors.danger }]}
          >
            {lockoutMessage}
          </Text>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('auth:pinLock.forgotA11y')}
        hitSlop={DEFAULT_HIT_SLOP}
        onPress={handleForgot}
        style={({ pressed }) => [styles.forgot, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[styles.forgotText, { color: theme.colors.textMuted }]}>
          {t('auth:pinLock.forgot')}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 72,
    paddingBottom: 48,
  },
  header: { alignItems: 'center', gap: 16, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  padWrap: { flex: 1, justifyContent: 'center' },
  lockoutText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 16,
  },
  forgot: { height: 44, alignItems: 'center', justifyContent: 'center' },
  forgotText: { fontSize: 14, fontWeight: '500' },
})
