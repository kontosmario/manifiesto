import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { Redirect, useRouter } from 'expo-router'
import { FernLogo } from '@/components/auth/fern-logo'
import { PinPad } from '@/components/auth/pin-pad'
import { isPinComplete } from '@/components/auth/pin-pad-model'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { markAppUnlocked } from '@/features/auth/app-lock-state'
import { getPinLength, verifyPin } from '@/lib/pin-lock'
import { triggerHaptic } from '@/lib/haptics'
import { useScreenCaptureProtection } from '@/lib/use-screen-capture-protection'
import { useAppTheme } from '@/theme/theme-provider'
import { DEFAULT_HIT_SLOP } from '@/theme/interaction'

/**
 * Dedicated PIN unlock (lock screen) for cold-start when a PIN is set
 * and biometrics aren't (or as the "Usar PIN" target from the biometric
 * lock screen). Manual session check (NOT RequireAuth) to avoid the
 * onboarding redirect loop, same as biometric-setup. The PIN only
 * unlocks an already-valid session — it never restores one.
 */
export function PinUnlockScreen() {
  // Sprint P · Audit #9 P-3 (2026-06-10): block screen recording /
  // screenshots while the PIN-pad is on screen.
  useScreenCaptureProtection()
  const { theme } = useAppTheme()
  const router = useRouter()
  const sessionQuery = useAuthSession()
  const session = sessionQuery.data ?? null

  const [value, setValue] = useState('')
  const [errorToken, setErrorToken] = useState(0)
  const [checking, setChecking] = useState(false)
  const [lockoutMessage, setLockoutMessage] = useState<string | null>(null)
  // Sprint J · P0: the PIN length is persisted at setPin time and read
  // here on mount so we submit a complete PIN.
  //
  // Sprint K · Audit #4 K-4 (2026-06-10): start as `null` instead of
  // defaulting to 4. If a user with a 6-digit PIN cold-starts the app
  // and taps fast, defaulting to 4 made `PinPad` auto-submit at 4
  // digits — counting as a failed attempt and burning lockout budget.
  // The pad is now hidden behind a spinner until `getPinLength()`
  // resolves; in practice the SecureStore read settles within a frame
  // or two so the loading flash is barely perceptible.
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
            markAppUnlocked()
            router.replace('/')
            return
          }
          if (result.lockedForMs > 0) {
            const seconds = Math.ceil(result.lockedForMs / 1000)
            setLockoutMessage(`Bloqueado ${seconds} seg`)
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
          // para siempre. Reseteamos como si fuera intento fallido y
          // dejamos que el user reintente. Code review screens-B4.
          setErrorToken((t) => t + 1)
          setValue('')
          setChecking(false)
        })
    },
    [checking, pinLength, router],
  )

  // G4 fix (2026-06-11): antes este handler llamaba logoutSession() que
  // limpiaba TODO el device-local state (Keychain biometric, last-user
  // cache, push token, tours, prompt dismissal) — destructivo y obligaba
  // al user a re-tipear email. Ahora redirige al login para fallback con
  // password. Si el user realmente quiere cerrar sesión, lo hace desde
  // Settings → Cerrar sesión.
  const handleForgot = useCallback(() => {
    router.replace('/(auth)/login')
  }, [router])

  if (sessionQuery.isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    )
  }
  // PIN can't restore a session — if there's none, go authenticate.
  if (!session) {
    return <Redirect href="/(auth)/welcome" />
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <View style={styles.header}>
        <FernLogo size={64} />
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Ingresa tu PIN
        </Text>
      </View>

      <View style={styles.padWrap}>
        {pinLength === null ? (
          // Sprint K · Audit #4 K-4: hold rendering of PinPad until
          // we know the real PIN length so a fast tap can't auto-submit
          // a 4-digit slice of a 6-digit PIN and burn lockout budget.
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
        accessibilityLabel="Olvidé mi PIN, ingresar con contraseña"
        hitSlop={DEFAULT_HIT_SLOP}
        onPress={handleForgot}
        style={({ pressed }) => [styles.forgot, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[styles.forgotText, { color: theme.colors.textMuted }]}>
          Olvidé mi PIN · usar contraseña
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
