// Superficie ÚNICA del arranque — spec 2026-06-11 (superficie portada al
// lenguaje del rediseño 2026-07-17, review r2).
//
// Renderiza según la fase de la máquina auth-flow:
//   probing / locked:biometric / bridging → welcomeBg + partículas +
//     FernLogo del AUTH_SPEC (theme-aware, IDÉNTICO al cold start y al
//     bridge del overlay — invariante 4: superficies idénticas en cada
//     seam; antes era WarmFernLogo sobre verde oscuro FIJO, que flasheaba
//     en light mode contra el bridge crema).
//   locked:pin → NeoPinLockPanel (rediseño, cableado 2026-07-17 — misma
//     semántica de dispatch que el PinLockPanel anterior)
//   guest / fallback-login → misma superficie (la navegación ya está en
//     vuelo)
//
// El BOOT se dispatchea en un effect de mount. El prompt biométrico,
// el prefetch del snapshot y la navegación los dispara el DRIVER
// (efectos de la máquina) — esta pantalla no tiene lógica de auth.
//
// Re-entrada: BOOT es no-op si la máquina no está en `idle`, y RELOCK
// ya setea `probing` + run-probes por su cuenta; un remount del index
// tras re-lock no duplica nada.

import { useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { FernLogo } from '@/components/auth/fern-logo'
import { BrotParticles } from '@/components/brot'
import {
  configureAuthFlow,
  dispatchAuthFlow,
} from '@/features/auth-flow/auth-flow-controller'
import { realAuthFlowAdapters } from '@/features/auth-flow/auth-flow-adapters'
import { useAuthFlowState } from '@/features/auth-flow/use-auth-flow'
import { resetAuthFlowTimer } from '@/lib/auth-flow-logger'
import { AUTH_SPEC } from '@/components/redesign/auth/auth-spec'
import { NeoPinLockPanel } from '@/screens/auth/neo/neo-pin-lock-panel'
import { useThemeMode } from '@/theme/theme-provider'

export function BootScreen() {
  const state = useAuthFlowState()
  const mode = useThemeMode().resolvedMode
  const s = AUTH_SPEC[mode]
  const bootedRef = useRef(false)

  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    resetAuthFlowTimer()
    configureAuthFlow(realAuthFlowAdapters)
    dispatchAuthFlow({ type: 'BOOT' })
  }, [])

  if (state.phase === 'locked' && state.method === 'pin') {
    return <NeoPinLockPanel />
  }

  // Superficie del rediseño: welcomeBg del tema + partículas de arranque
  // (mismas 16 del cold start/bridge) + FernLogo centrado. El seam
  // boot ↔ bridge queda invisible porque las tres capas comparten la
  // misma paleta y el mismo campo de partículas (BrotParticles se
  // congela solo bajo Reduce Motion / hardware débil).
  return (
    <View style={[styles.root, { backgroundColor: s.welcomeBg }]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <BrotParticles colors={s.particleColors} count={16} />
      </View>
      <View style={styles.center}>
        <Animated.View entering={FadeIn.duration(400)}>
          <FernLogo size={160} palette={s.fernPalette} />
        </Animated.View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
