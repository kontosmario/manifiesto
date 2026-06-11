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
//   - Footer SIEMPRE visible cuando no está mid-attempt (G3 fix): retry,
//     "Usar PIN" (si PIN configurado), "Usar contraseña"
//   - SUCCESS → refresh Supabase session (G2 fix: mint fresh tokens) →
//     AuthTransitionSplash → markAppUnlocked → home
//   - FAIL → error inline + footer escape
//   - CANCEL → footer visible para retry (no dead-end)
//
// El flow declarado por el owner:
//   COLD START ANIMATION → CREDENCIALES TRUE → FACE ID → SPLASH ANIMATION → HOME

import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Animated, { FadeIn } from 'react-native-reanimated'
import { RiseView } from '@/components/home/animated/rise-view'
import { WarmFernLogo } from '@/components/auth/warm-fern-logo'
import { markAppUnlocked } from '@/features/auth/app-lock-state'
import {
  authenticateBiometricAccess,
  clearBiometricCredentials,
  getBiometricCredentials,
  getBiometricLoginState,
  updateStoredRefreshToken,
  type BiometricLoginState,
} from '@/lib/biometric-auth'
import { biometricFeedbackForError } from '@/features/auth/biometric-feedback'
import { getPinLockState } from '@/lib/pin-lock'
import { supabase } from '@/lib/supabase'
import { triggerHaptic } from '@/lib/haptics'
import {
  hideAuthTransitionSplash,
  showAuthTransitionSplash,
} from '@/lib/auth-transition-splash'
import { authTokens } from '@/theme/palette'

const DEFAULT_LABEL = 'Face ID / Touch ID'

type Phase =
  | 'idle' // pre-mount o post-cancel — mostrar fern + footer
  | 'scanning' // FaceID prompt activo
  | 'restoring' // FaceID ok, refrescando sesión Supabase
  | 'error' // último intento falló con error genuino (no cancel)

export function UnlockScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [biometricLabel, setBiometricLabel] = useState<string>(DEFAULT_LABEL)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [hasPin, setHasPin] = useState(false)
  const autoFiredRef = useRef(false)

  // Probe metadata on mount: biometric label (FaceID/TouchID/huella) +
  // PIN availability para decidir affordances del footer.
  useEffect(() => {
    let cancelled = false
    void Promise.all([
      getBiometricLoginState(),
      getPinLockState(),
    ]).then(([bio, pin]: [BiometricLoginState, { isSet: boolean }]) => {
      if (cancelled) return
      setBiometricLabel(bio.label)
      setHasPin(pin.isSet)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const fireUnlock = useCallback(async () => {
    // Atomic gate: phase=scanning previene re-entrancy desde retry tap o
    // doble auto-fire.
    if (phase === 'scanning' || phase === 'restoring') return
    setPhase('scanning')
    setErrorMessage(null)
    try {
      const result = await authenticateBiometricAccess({
        promptMessage: 'Desbloqueá Manifiesto',
        disableDeviceFallback: true,
      })

      if (!result.success) {
        // Cancel paths: no error pill, vuelta a idle para mostrar footer
        // de retry + fallbacks (G3 fix — antes el screen quedaba dead-end).
        if (
          result.error === 'user_cancel' ||
          result.error === 'system_cancel'
        ) {
          setPhase('idle')
          return
        }
        // Genuine failure → warning haptic + error pill.
        void triggerHaptic('warning')
        const feedback = biometricFeedbackForError(result.error, biometricLabel)
        if (feedback) setErrorMessage(feedback.message)
        setPhase('error')
        return
      }

      // SUCCESS: feedback inmediato + splash. El hide lo dispara
      // markAuthTransitionLoaded del RequireAuth del home.
      void triggerHaptic('success')
      setPhase('restoring')
      showAuthTransitionSplash()

      // FAST PATH (caso normal): si la session sigue activa en el cliente
      // Supabase (auto-refresh corre en background mientras la app está
      // abierta y al hacer foreground), unlock + go. NO llamar refreshSession
      // — el Supabase client ya rotó el token internamente y el guardado
      // en Keychain podría estar invalid → tirar "expired" falso positivo.
      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData.session) {
        markAppUnlocked()
        router.replace('/')
        return
      }

      // SLOW PATH: no hay session activa (app killed por iOS, refresh
      // background falló, cold start con session-storage limpio, etc).
      // Intentar restaurar desde el refresh token del Keychain.
      const credentials = await getBiometricCredentials()
      if (!credentials) {
        // Keychain inconsistente. Recovery: limpiar creds + fallback login.
        hideAuthTransitionSplash()
        await clearBiometricCredentials()
        setErrorMessage(
          `Tu acceso guardado expiró. Ingresá con tu contraseña una vez para reactivar ${biometricLabel}.`,
        )
        setPhase('error')
        return
      }

      const refreshResponse = await supabase.auth.refreshSession({
        refresh_token: credentials.refreshToken,
      })

      if (refreshResponse.error || !refreshResponse.data.session) {
        // Refresh token verdaderamente expirado/revoked. NO limpiamos
        // creds — el user puede entrar con password y se re-arman.
        hideAuthTransitionSplash()
        setErrorMessage(
          `Tu sesión expiró. Ingresá con tu contraseña una vez para reactivar ${biometricLabel}.`,
        )
        setPhase('error')
        return
      }

      // Capturar el nuevo refresh token (Supabase rota en cada refresh).
      const newRefreshToken = refreshResponse.data.session.refresh_token
      if (newRefreshToken && newRefreshToken !== credentials.refreshToken) {
        await updateStoredRefreshToken(newRefreshToken)
      }

      markAppUnlocked()
      router.replace('/')
    } catch (_error) {
      // Defensive: authenticateBiometricAccess o refreshSession unexpected throw.
      hideAuthTransitionSplash()
      setErrorMessage('No pudimos verificar tu identidad. Probá de nuevo.')
      setPhase('error')
    }
  }, [biometricLabel, phase, router])

  // Auto-fire FaceID en mount. Guarded ref para no re-disparar en re-renders.
  // El cleanup que escondía el splash se removió — ahora si vamos a home
  // exitosamente, el splash queda visible hasta markAuthTransitionLoaded
  // (G7 fix — antes el unmount escondía el splash que acabábamos de mostrar).
  useEffect(() => {
    if (autoFiredRef.current) return
    autoFiredRef.current = true
    void fireUnlock()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePasswordFallback = useCallback(() => {
    void triggerHaptic('selection')
    router.replace('/(auth)/login')
  }, [router])

  const handlePinFallback = useCallback(() => {
    void triggerHaptic('selection')
    router.replace('/(auth)/pin-unlock')
  }, [router])

  // Footer visible siempre EXCEPTO durante scanning/restoring activo.
  // En idle (post-cancel) y error: footer renderea para que el user tenga
  // siempre una acción visible.
  const showFooter = phase === 'idle' || phase === 'error'

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      {/* WarmFernLogo entra con fade subtle — match el entrance del
          AuthLaunchSplash (cold-start) para que la transición se sienta
          como una continuación natural, no un salto a otra pantalla.
          Premium fluid feel: cuando el AuthLaunchSplash fade-out, este
          fern fade-in en paralelo → user percibe UNA superficie brand
          continua. */}
      <View style={styles.center}>
        <Animated.View entering={FadeIn.duration(400)}>
          <WarmFernLogo size={180} />
        </Animated.View>
      </View>

      {showFooter ? (
        <RiseView
          delay={300}
          duration={500}
          translateY={16}
          style={{ ...styles.footer, paddingBottom: insets.bottom + 32 }}
        >
          {errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              phase === 'error'
                ? `Volver a intentar con ${biometricLabel}`
                : `Desbloqueá con ${biometricLabel}`
            }
            onPress={fireUnlock}
            style={({ pressed }) => [
              styles.retryButton,
              { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
          >
            <Text style={styles.retryLabel}>
              {phase === 'error'
                ? `Reintentar con ${biometricLabel}`
                : `Desbloqueá con ${biometricLabel}`}
            </Text>
          </Pressable>

          {hasPin ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Usar PIN para desbloquear"
              onPress={handlePinFallback}
              hitSlop={8}
              style={({ pressed }) => [
                styles.linkButton,
                { opacity: pressed ? 0.5 : 1 },
              ]}
            >
              <Text style={styles.linkLabel}>Usar PIN</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Usar contraseña"
            onPress={handlePasswordFallback}
            hitSlop={8}
            style={({ pressed }) => [
              styles.linkButton,
              { opacity: pressed ? 0.5 : 1 },
            ]}
          >
            <Text style={styles.linkLabel}>Usar contraseña</Text>
          </Pressable>
        </RiseView>
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
    gap: 14,
  },
  errorText: {
    color: authTokens.surfaceCream,
    opacity: 0.85,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 4,
  },
  retryButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 999,
    backgroundColor: authTokens.surfaceCream,
    minWidth: 220,
    alignItems: 'center',
  },
  retryLabel: {
    color: authTokens.welcomeBg,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  linkButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  linkLabel: {
    color: authTokens.surfaceCream,
    fontSize: 14,
    opacity: 0.75,
    textDecorationLine: 'underline',
  },
})
