// Superficie ÚNICA del arranque — spec 2026-06-11.
//
// Renderiza según la fase de la máquina auth-flow:
//   probing / locked:biometric / bridging → fern + wordmark (idéntico
//     al bridge del overlay, centro REAL de pantalla sin insets —
//     invariante 4: superficies idénticas en cada seam)
//   locked:pin → PinLockPanel (Etapa 4)
//   guest / fallback-login → fern (la navegación ya está en vuelo)
//
// El BOOT se dispatchea en un effect de mount. El prompt biométrico,
// el prefetch del snapshot y la navegación los dispara el DRIVER
// (efectos de la máquina) — esta pantalla no tiene lógica de auth.
//
// Re-entrada: BOOT es no-op si la máquina no está en `idle`, y RELOCK
// ya setea `probing` + run-probes por su cuenta; un remount del index
// tras re-lock no duplica nada.

import { useEffect, useRef } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { FirefliesLayer } from '@/components/auth/auth-transition-splash'
import { PinLockPanel } from '@/components/auth/pin-lock-panel'
import { WarmFernLogo } from '@/components/auth/warm-fern-logo'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import {
  configureAuthFlow,
  dispatchAuthFlow,
} from '@/features/auth-flow/auth-flow-controller'
import { realAuthFlowAdapters } from '@/features/auth-flow/auth-flow-adapters'
import { useAuthFlowState } from '@/features/auth-flow/use-auth-flow'
import { resetAuthFlowTimer } from '@/lib/auth-flow-logger'
import { authTokens } from '@/theme/palette'

export function BootScreen() {
  const state = useAuthFlowState()
  const { width, height } = useWindowDimensions()
  const reduced = useReducedMotion()
  const bootedRef = useRef(false)

  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    resetAuthFlowTimer()
    configureAuthFlow(realAuthFlowAdapters)
    dispatchAuthFlow({ type: 'BOOT' })
  }, [])

  if (state.phase === 'locked' && state.method === 'pin') {
    return <PinLockPanel />
  }

  // Fireflies idénticos a los del bridge (CSS animations nativas, cero
  // worklets): la superficie de lock respira en vez de ser verde
  // estático — el seam boot ↔ bridge sigue siendo invisible porque
  // ambas capas usan el MISMO campo determinístico de partículas.
  return (
    <View style={styles.root}>
      <FirefliesLayer width={width} height={height} reduced={reduced} />
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
