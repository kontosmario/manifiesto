import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { Redirect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { BlockingScreenView } from '@/components/ui/blocking-screen-view'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAuthSession } from '@/features/auth/use-auth-session'
import {
  activateBiometricForSession,
  type ActivateBiometricResult,
} from '@/features/auth/activate-biometric-for-session'
import { markBiometricSetupShown } from '@/features/auth/biometric-setup-flag'
import {
  getBiometricLoginState,
  type BiometricLoginState,
} from '@/lib/biometric-auth'
import { markAuthTransitionLoaded } from '@/lib/auth-transition-splash'
import { triggerHaptic } from '@/lib/haptics'
import { authTokens } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { DEFAULT_HIT_SLOP } from '@/theme/interaction'

/**
 * Pre-onboarding biometric setup screen. Sits between signup and
 * the 5-step wizard. Two modes:
 *
 *   - Modo A (`isAvailable=true`): Activá Face ID + Activar / Ahora no
 *   - Modo B (`isAvailable=false`): Activalo cuando quieras + Continuar
 *
 * On any interaction we mark the per-user flag so the gate doesn't
 * route here again, then `router.replace('/(app)/onboarding')`.
 *
 * The flag is set even when the biometric prompt fails — the user
 * already made the conscious decision to attempt activation.
 *
 * Session check is manual (NOT via RequireAuth) because RequireAuth
 * redirects to /(app)/onboarding when onboarding is incomplete —
 * which is exactly the user landing here, so it would loop.
 */
export function BiometricSetupScreen() {
  const sessionQuery = useAuthSession()
  const session = sessionQuery.data ?? null
  const userId = session?.user.id
  const email = session?.user.email ?? ''

  if (sessionQuery.isLoading) {
    return <BlockingScreenView message="Preparando tu cuenta..." />
  }

  if (!session || !userId) {
    return <Redirect href="/(auth)/welcome" />
  }

  return <BiometricSetupBody userId={userId} email={email} />
}

function BiometricSetupBody({
  userId,
  email,
}: {
  userId: string
  email: string
}) {
  const router = useRouter()
  const { theme } = useAppTheme()

  const [biometric, setBiometric] = useState<BiometricLoginState | null>(null)
  const [isWorking, setWorking] = useState(false)

  // Hide the auth transition splash once this screen has rendered
  // (same pattern as onboarding-success-screen).
  useEffect(() => {
    markAuthTransitionLoaded()
  }, [])

  useEffect(() => {
    let cancelled = false
    void getBiometricLoginState().then((state) => {
      if (!cancelled) setBiometric(state)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const advanceToOnboarding = useCallback(async () => {
    await markBiometricSetupShown(userId)
    router.replace('/(app)/onboarding')
  }, [router, userId])

  const handleActivate = useCallback(async () => {
    if (isWorking) return
    setWorking(true)
    try {
      const result: ActivateBiometricResult = await activateBiometricForSession(email)
      if (result === 'activated') {
        void triggerHaptic('success')
      } else if (result === 'cancelled') {
        void triggerHaptic('warning')
      }
      await advanceToOnboarding()
    } finally {
      setWorking(false)
    }
  }, [advanceToOnboarding, email, isWorking])

  const handleSkip = useCallback(async () => {
    if (isWorking) return
    setWorking(true)
    try {
      void triggerHaptic('selection')
      await advanceToOnboarding()
    } finally {
      setWorking(false)
    }
  }, [advanceToOnboarding, isWorking])

  // While biometric state is loading, render an empty themed canvas
  // (no spinner — the read is fast and a spinner here would flash).
  const isLoading = biometric === null

  const label = biometric?.label ?? 'Face ID'
  const isAvailable = biometric?.isAvailable ?? false

  const copy = useMemo(
    () =>
      isAvailable
        ? {
            iconName: 'scan-circle-outline' as keyof typeof Ionicons.glyphMap,
            title: `Activá ${label}`,
            body: 'Entrá más rápido y con más seguridad.',
            primaryLabel: `Activar ${label}`,
            secondaryLabel: 'Ahora no' as string | null,
          }
        : {
            iconName: 'lock-closed-outline' as keyof typeof Ionicons.glyphMap,
            title: 'Activalo cuando quieras',
            body: `Tu dispositivo no tiene ${label} configurado. Podés activarlo más adelante desde Ajustes → Seguridad.`,
            primaryLabel: 'Continuar',
            secondaryLabel: null as string | null,
          },
    [isAvailable, label],
  )

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      {!isLoading && (
        <View style={styles.content}>
          <RiseView delay={100} duration={620} style={styles.iconSlot}>
            <View style={[styles.iconCircle, { backgroundColor: theme.colors.surface }]}>
              <Ionicons
                name={copy.iconName}
                size={56}
                color={authTokens.welcomeBg}
              />
            </View>
          </RiseView>

          <RiseView delay={180} duration={620}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              {copy.title}
            </Text>
          </RiseView>

          <RiseView delay={260} duration={620}>
            <Text style={[styles.body, { color: theme.colors.textMuted }]}>
              {copy.body}
            </Text>
          </RiseView>

          <RiseView delay={340} duration={620} style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              hitSlop={DEFAULT_HIT_SLOP}
              onPress={isAvailable ? handleActivate : handleSkip}
              disabled={isWorking}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: authTokens.welcomeBg,
                  opacity: isWorking ? 0.5 : pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
              <Text style={[styles.primaryLabel, { color: authTokens.surfaceCream }]}>
                {copy.primaryLabel}
              </Text>
            </Pressable>

            {copy.secondaryLabel && (
              <Pressable
                accessibilityRole="button"
                hitSlop={DEFAULT_HIT_SLOP}
                onPress={handleSkip}
                disabled={isWorking}
                style={({ pressed }) => [
                  styles.ghostButton,
                  {
                    opacity: isWorking ? 0.5 : pressed ? 0.6 : 1,
                  },
                ]}
              >
                <Text style={[styles.ghostLabel, { color: theme.colors.textMuted }]}>
                  {copy.secondaryLabel}
                </Text>
              </Pressable>
            )}
          </RiseView>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 96,
    paddingBottom: 48,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  iconSlot: {
    marginBottom: 32,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 48,
    maxWidth: 320,
  },
  actions: {
    width: '100%',
    alignItems: 'stretch',
    gap: 12,
  },
  primaryButton: {
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
  ghostButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
})
