// Dedicated unlock screen — fern-first lock surface.
//
// El flow declarado por el owner:
//   COLD START ANIMATION → CREDENCIALES TRUE → FACE ID → SPLASH ANIMATION → HOME
//
// Implementado como:
//   AuthLaunchSplash (cold-start fern animation, sigue visible/animando
//   DEBAJO del prompt de FaceID — el splash overlay ya NO la tapa) →
//   UnlockScreen (fern surface, auto-fires FaceID + prefetch del
//   home_snapshot en paralelo al prompt) →
//   ├─ SUCCESS → AuthTransitionSplash (fade-in sobre el fern idéntico
//   │           del unlock; espera markDestinationReady del home, que
//   │           gracias al prefetch suele estar ya cacheado) → soar-away
//   │           → home
//   └─ CANCEL / FAIL → /(auth)/login (con todas las opciones: Face ID,
//                      password, Apple, etc — paridad con flow viejo)
//
// Por qué el splash se muestra recién al SUCCESS (2026-06-11): antes se
// mostraba al entrar a fireUnlock, y como el overlay (zIndex 50) está
// por encima del AuthLaunchSplash (zIndex 20), tapaba la cold-start
// animation a los ~460ms — doble-fern jump visible y la animación de
// arranque nunca se veía completa. Durante el prompt de FaceID la
// superficie visible es el launch splash (y debajo, este unlock screen,
// visualmente idéntico al contenido del overlay), así que el overlay no
// aporta nada antes del success.
//
// Por qué cancel bouncea a login: el user pidió explícitamente "al cancelar
// el face id, nos debe llegar a la pantalla de login de siempre" — preserva
// el comportamiento pre-refactor donde cancel quedaba en login con todas
// las affordances visibles.

import { useCallback, useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import Animated, { FadeIn } from 'react-native-reanimated'
import { WarmFernLogo } from '@/components/auth/warm-fern-logo'
import { markAppUnlocked } from '@/features/auth/app-lock-state'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { prefetchHomeSnapshot } from '@/features/home/use-home-snapshot'
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
import { authFlowLog, resetAuthFlowTimer } from '@/lib/auth-flow-logger'
import { authTokens } from '@/theme/palette'

// Min-visible del splash post-unlock. Con el prefetch, el destination
// puede estar listo ~200-400ms después del success; este piso garantiza
// que el fade-in de 180ms del overlay complete y que la route swap
// (unlock → index → home) ocurra totalmente cubierta antes del soar-away.
const POST_UNLOCK_MIN_VISIBLE_MS = 450

export function UnlockScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const autoFiredRef = useRef(false)
  const prefetchFiredRef = useRef(false)

  // Warm-up del home snapshot EN PARALELO con el prompt de FaceID. La
  // session ya es válida (AppEntryGate la verificó antes de redirigir
  // acá) y el RPC tarda ~0.5-1s — el prompt tarda ~2s de interacción,
  // así que al success el cache ya está sembrado y markDestinationReady
  // dispara en el primer commit del home. Antes esto era serial
  // (AppStackShell recién fetcheaba post-redirect) y costaba ~1.1s de
  // splash muerto post-auth. El lock es un gate de UI: los datos quedan
  // en memoria (React Query), nada se renderiza antes del unlock.
  const session = useAuthSession()
  const userId = session.data?.user.id
  useEffect(() => {
    if (!userId || prefetchFiredRef.current) return
    prefetchFiredRef.current = true
    authFlowLog('unlock', 'prefetching home snapshot (parallel with FaceID)')
    void prefetchHomeSnapshot(queryClient, userId)
  }, [userId, queryClient])

  const fireUnlock = useCallback(async () => {
    authFlowLog('unlock', 'fireUnlock entry')
    try {
      authFlowLog('unlock', 'calling authenticateBiometricAccess')
      const result = await authenticateBiometricAccess({
        promptMessage: 'Desbloqueá Manifiesto',
        disableDeviceFallback: true,
      })
      authFlowLog('unlock', 'authenticateBiometricAccess returned', {
        success: result.success,
        ...(result.success ? {} : { error: result.error }),
      })

      if (!result.success) {
        // Cancel o failure: bouncear a /(auth)/login (el splash nunca
        // se mostró en este path). Acá vive todo el fallback UX — Face
        // ID retry CTA, password form, Apple, "Cambiar cuenta", etc.
        // NO pasamos autoBiometric=1 para no re-disparar el prompt
        // automáticamente (el user lo canceló).
        router.replace('/(auth)/login')
        return
      }

      // SUCCESS: recién acá mostramos el splash overlay. Hace fade-in
      // (180ms) sobre el fern idéntico de este screen — seam invisible.
      // requireDestination: el splash espera a que HomeScreen llame
      // markDestinationReady (cuando snapshot.data esté listo) para
      // hide. Evita "green pause" entre splash hide y home visible.
      showAuthTransitionSplash({
        requireDestination: true,
        minVisibleMs: POST_UNLOCK_MIN_VISIBLE_MS,
      })
      void triggerHaptic('success')

      // FAST PATH (99% de los casos): session ya activa en el cliente
      // (Supabase auto-refresh corrió en background). NO llamar
      // refreshSession — el token del Keychain puede estar invalidated
      // por una rotación previa → falso positivo "expired".
      authFlowLog('unlock', 'calling getSession (fast path)')
      const { data: sessionData } = await supabase.auth.getSession()
      authFlowLog('unlock', 'getSession returned', { hasSession: Boolean(sessionData.session) })
      if (sessionData.session) {
        authFlowLog('unlock', 'markAppUnlocked + router.replace(/)')
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
    resetAuthFlowTimer()
    authFlowLog('unlock', 'UnlockScreen mounted, auto-firing')
    void fireUnlock()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sin safe-area padding a propósito: el AuthTransitionSplash centra su
  // WarmFernLogo en el centro REAL de la pantalla (absoluteFill, sin
  // insets). Si este screen aplicara paddingTop/bottom de insets, su fern
  // quedaría ~12px corrido y el fade-in del overlay al success mostraría
  // un salto. Acá no hay contenido que necesite respetar notch/home bar.
  return (
    <View style={styles.root}>
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
