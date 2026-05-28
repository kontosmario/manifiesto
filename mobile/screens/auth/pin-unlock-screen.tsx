import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { Redirect, useRouter } from 'expo-router'
import { FernLogo } from '@/components/auth/fern-logo'
import { PinPad } from '@/components/auth/pin-pad'
import { isPinComplete } from '@/components/auth/pin-pad-model'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { markAppUnlocked } from '@/features/auth/app-lock-state'
import { verifyPin } from '@/lib/pin-lock'
import { logoutSession } from '@/features/auth/logout'
import { triggerHaptic } from '@/lib/haptics'
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
  const { theme } = useAppTheme()
  const router = useRouter()
  const sessionQuery = useAuthSession()
  const session = sessionQuery.data ?? null

  const [value, setValue] = useState('')
  const [errorToken, setErrorToken] = useState(0)
  const [checking, setChecking] = useState(false)

  const handleChange = useCallback(
    (next: string) => {
      if (checking) return
      setValue(next)
      if (!isPinComplete(next)) return
      setChecking(true)
      void verifyPin(next).then((ok) => {
        if (ok) {
          void triggerHaptic('success')
          markAppUnlocked()
          router.replace('/')
          return
        }
        setErrorToken((t) => t + 1)
        setValue('')
        setChecking(false)
      })
    },
    [checking, router],
  )

  const handleForgot = useCallback(() => {
    void logoutSession({
      onError: () => router.replace('/(auth)/welcome'),
      onSuccess: () => router.replace('/(auth)/welcome'),
    })
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
          Ingresá tu PIN
        </Text>
      </View>

      <View style={styles.padWrap}>
        <PinPad value={value} onChange={handleChange} errorToken={errorToken} />
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
  forgot: { height: 44, alignItems: 'center', justifyContent: 'center' },
  forgotText: { fontSize: 14, fontWeight: '500' },
})
