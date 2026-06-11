// Dedicated unlock screen — fern-first lock surface.
//
// Antes este flow se servía abusando el login-screen con `?lock=1`. El
// login screen tenía hero, form, password fallback, etc — UI inapropiada
// para "el user ya está loggeado, solo necesita desbloquear con FaceID".
// Peor: su Screen base layer usaba theme.colors.background (#12211A flat
// dark) → cuando el TransitionOverlay tenía opacity <1, se veía verde.
//
// Este screen es purpose-built:
//   - Full-screen welcomeBg + WarmFernLogo centered (zero green visible
//     en ningún layer)
//   - Auto-fires FaceID on mount
//   - SUCCESS → AuthTransitionSplash → markAppUnlocked → home
//   - FAIL/CANCEL → "Reintentar" + "Usar contraseña" escape
//
// El flow declarado por el owner:
//   COLD START ANIMATION → CREDENCIALES TRUE → FACE ID → SPLASH ANIMATION → HOME
//
// Implementado como:
//   AuthLaunchSplash → (AppEntryGate redirige a este screen) → FaceID →
//   AuthTransitionSplash → home tabs.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { WarmFernLogo } from '@/components/auth/warm-fern-logo'
import { markAppUnlocked } from '@/features/auth/app-lock-state'
import {
  authenticateBiometricAccess,
  getBiometricLoginState,
  type BiometricLoginState,
} from '@/lib/biometric-auth'
import { biometricFeedbackForError } from '@/features/auth/biometric-feedback'
import { triggerHaptic } from '@/lib/haptics'
import {
  hideAuthTransitionSplash,
  showAuthTransitionSplash,
} from '@/lib/auth-transition-splash'
import { authTokens } from '@/theme/palette'

const DEFAULT_LABEL = 'Face ID / Touch ID'

export function UnlockScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [biometricLabel, setBiometricLabel] = useState<string>(DEFAULT_LABEL)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isAttempting, setAttempting] = useState(false)
  const autoFiredRef = useRef(false)

  // Probe el label real (FaceID vs TouchID vs huella) on mount para
  // mostrar copy correcto. Best-effort: si falla, queda el default.
  useEffect(() => {
    let cancelled = false
    void getBiometricLoginState().then((state: BiometricLoginState) => {
      if (cancelled) return
      setBiometricLabel(state.label)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const fireUnlock = useCallback(async () => {
    if (isAttempting) return
    setAttempting(true)
    setErrorMessage(null)
    try {
      const result = await authenticateBiometricAccess({
        promptMessage: 'Desbloqueá Manifiesto',
        disableDeviceFallback: true,
      })

      if (result.success) {
        await triggerHaptic('success')
        // El splash post-unlock (WarmFernLogo + fireflies) cubre la
        // transición visual hasta que el home pinte. markLoaded del
        // RequireAuth del home dispara el hide.
        showAuthTransitionSplash()
        markAppUnlocked()
        router.replace('/')
        return
      }

      // Genuine failure (no user-cancel) → warning haptic.
      if (
        result.error !== 'user_cancel' &&
        result.error !== 'system_cancel'
      ) {
        void triggerHaptic('warning')
      }
      const feedback = biometricFeedbackForError(result.error, biometricLabel)
      if (feedback) setErrorMessage(feedback.message)
    } catch (_error) {
      // Defensive: authenticateBiometricAccess no debería throw, pero si
      // pasa, dejamos al user la opción de retry / password.
      setErrorMessage('No pudimos verificar tu identidad. Probá de nuevo.')
    } finally {
      setAttempting(false)
    }
  }, [biometricLabel, isAttempting, router])

  // Auto-fire FaceID en mount. Guarded ref para no re-disparar en re-renders.
  useEffect(() => {
    if (autoFiredRef.current) return
    autoFiredRef.current = true
    void fireUnlock()
    // Limpiar el splash overlay si el user llegó acá con uno colgado
    // de un flow previo (ej: post-logout que dejó algo en flight).
    return () => {
      hideAuthTransitionSplash()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePasswordFallback = useCallback(() => {
    void triggerHaptic('selection')
    router.replace('/(auth)/login')
  }, [router])

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.center}>
        <WarmFernLogo size={180} />
      </View>

      {errorMessage ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 32 }]}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Volver a intentar con ${biometricLabel}`}
            onPress={fireUnlock}
            style={({ pressed }) => [
              styles.retryButton,
              { opacity: pressed || isAttempting ? 0.8 : 1 },
            ]}
            disabled={isAttempting}
          >
            <Text style={styles.retryLabel}>
              Reintentar con {biometricLabel}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Usar contraseña"
            onPress={handlePasswordFallback}
            hitSlop={8}
            style={styles.passwordEscape}
          >
            <Text style={styles.passwordEscapeLabel}>Usar contraseña</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: authTokens.welcomeBg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 16,
  },
  errorText: {
    color: authTokens.surfaceCream,
    opacity: 0.85,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 999,
    backgroundColor: authTokens.surfaceCream,
  },
  retryLabel: {
    color: authTokens.welcomeBg,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  passwordEscape: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  passwordEscapeLabel: {
    color: authTokens.surfaceCream,
    fontSize: 14,
    opacity: 0.75,
    textDecorationLine: 'underline',
  },
})
