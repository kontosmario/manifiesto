// Dedicated unlock screen — fern-first lock surface.
//
// El flow declarado por el owner:
//   COLD START ANIMATION → CREDENCIALES TRUE → FACE ID → SPLASH ANIMATION → HOME
//
// Implementado como:
//   AuthLaunchSplash (cold-start fern animation) →
//   UnlockScreen (fern surface, auto-fires FaceID) →
//   ├─ SUCCESS → AuthTransitionSplash (visible durante session check +
//   │           home snapshot fetch, ~3s premium fern animation) → home
//   └─ CANCEL / FAIL → /(auth)/login (con todas las opciones: Face ID,
//                      password, Apple, etc — paridad con flow viejo)
//
// Por qué cancel bouncea a login: el user pidió explícitamente "al cancelar
// el face id, nos debe llegar a la pantalla de login de siempre" — preserva
// el comportamiento pre-refactor donde cancel quedaba en login con todas
// las affordances visibles.

import { useCallback, useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Animated, { FadeIn } from 'react-native-reanimated'
import { WarmFernLogo } from '@/components/auth/warm-fern-logo'
import { markAppUnlocked } from '@/features/auth/app-lock-state'
import {
  authenticateBiometricAccess,
  clearBiometricCredentials,
  getBiometricCredentials,
  updateStoredRefreshToken,
} from '@/lib/biometric-auth'
import { supabase } from '@/lib/supabase'
import { triggerHaptic } from '@/lib/haptics'
import {
  hideAuthTransitionSplash,
  showAuthTransitionSplash,
} from '@/lib/auth-transition-splash'
import { authTokens } from '@/theme/palette'

export function UnlockScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const autoFiredRef = useRef(false)

  const fireUnlock = useCallback(async () => {
    try {
      const result = await authenticateBiometricAccess({
        promptMessage: 'Desbloqueá Manifiesto',
        disableDeviceFallback: true,
      })

      if (!result.success) {
        // Cancel o failure: bouncear a /(auth)/login. Acá vive todo el
        // fallback UX — Face ID retry CTA, password form, Apple, "Cambiar
        // cuenta", etc. NO pasamos autoBiometric=1 para no re-disparar
        // el prompt automáticamente (el user lo canceló).
        router.replace('/(auth)/login')
        return
      }

      // SUCCESS: feedback inmediato + splash con default minVisibleMs (3000ms).
      // El splash cubre toda la ventana de:
      //   - session check / refresh
      //   - router navigation
      //   - AppEntryGate evaluation
      //   - tabs layout mount
      //   - home snapshot fetch
      //   - first paint del home
      //
      // 3 segundos es el piso para que la WarmFernLogo entrance + idle
      // breath se complete sin clipping. Para snapshots rápidos, el
      // markAuthTransitionLoaded() de RequireAuth lo flippea a success-
      // pending y el hide ocurre exactamente a los 3000ms. Para
      // snapshots lentos, el splash se queda hasta que el ciclo natural
      // de fade-out arranque.
      void triggerHaptic('success')
      showAuthTransitionSplash()

      // FAST PATH (99% de los casos): session ya activa en el cliente
      // (Supabase auto-refresh corrió en background). NO llamar
      // refreshSession — el token del Keychain puede estar invalidated
      // por una rotación previa → falso positivo "expired".
      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData.session) {
        markAppUnlocked()
        router.replace('/')
        return
      }

      // SLOW PATH: no hay session activa (app killed por iOS, auto-refresh
      // background falló, storage limpio). Restaurar desde el refresh
      // token del Keychain.
      const credentials = await getBiometricCredentials()
      if (!credentials) {
        // Keychain inconsistente. Limpiar + bouncear a login para sign-in
        // manual que re-arme las creds.
        hideAuthTransitionSplash()
        await clearBiometricCredentials()
        router.replace('/(auth)/login')
        return
      }

      const refreshResponse = await supabase.auth.refreshSession({
        refresh_token: credentials.refreshToken,
      })

      if (refreshResponse.error || !refreshResponse.data.session) {
        // Refresh token verdaderamente expirado/revoked. NO limpiamos
        // creds — el user puede entrar con password y se re-arman.
        hideAuthTransitionSplash()
        router.replace('/(auth)/login')
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
      // Defensive: cualquier throw inesperado bouncea a login.
      hideAuthTransitionSplash()
      router.replace('/(auth)/login')
    }
  }, [router])

  // Auto-fire FaceID en mount. Guarded ref para no re-disparar en re-renders.
  useEffect(() => {
    if (autoFiredRef.current) return
    autoFiredRef.current = true
    void fireUnlock()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.center}>
        <Animated.View entering={FadeIn.duration(400)}>
          <WarmFernLogo size={180} />
        </Animated.View>
      </View>
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
})
