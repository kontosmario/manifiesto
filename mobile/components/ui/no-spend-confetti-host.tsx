// mobile/components/ui/no-spend-confetti-host.tsx
//
// Pinta confetti full-screen cuando el bus emite. Un solo host por
// app (montado en app-stack-shell). Misma topología que ToastHost.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Dimensions, StyleSheet, View } from 'react-native'
import ConfettiCannon from 'react-native-confetti-cannon'
import { subscribeConfetti, type ConfettiPayload } from '@/lib/confetti-bus'
import { neoParticlePresets, neoTokens } from '@/theme/neo-tokens'
import { useThemeTokens } from '@/theme/theme-provider'

const { width: SCREEN_W } = Dimensions.get('window')

export function NoSpendConfettiHost() {
  const [active, setActive] = useState<ConfettiPayload | null>(null)
  const cannonRef = useRef<ConfettiCannon | null>(null)
  const { mode } = useThemeTokens()

  // Paleta del rediseño, elegida por tema: el host es full-screen y cae
  // sobre el fondo de la app, no sobre una card.
  //
  // · Oscuro: el preset de celebración tal cual — sus 3 colores son
  //   claros y saltan sobre el fondo `#0F1A13`.
  // · Claro: el preset `weekCloseLight` está pensado para caer sobre el
  //   HERO verde; sus 3 pasteles sobre el fondo salvia (`#DCDFCD`) se
  //   pierden. Se le suman `green` y `warm` del tema —los dos tokens
  //   oscuros del sistema— para que las piezas se vean sin reintroducir
  //   colores fuera de la paleta (y para no perder variedad al bajar de
  //   6 colores a 3).
  const colors = useMemo(() => {
    const neo = neoTokens(mode)
    return mode === 'dark'
      ? [...neoParticlePresets.celebrationDark.colors]
      : [...neoParticlePresets.weekCloseLight.colors, neo.green, neo.warm]
  }, [mode])

  useEffect(() => {
    return subscribeConfetti((payload) => {
      setActive(payload)
    })
  }, [])

  useEffect(() => {
    if (!active) return
    cannonRef.current?.start()
    const timer = setTimeout(() => {
      setActive((current) => (current?.id === active.id ? null : current))
    }, active.durationMs ?? 2000)
    return () => {
      clearTimeout(timer)
    }
  }, [active])

  if (!active) return null

  const isTop = (active.origin ?? 'top') === 'top'

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      {/* `key={mode}`: react-native-confetti-cannon lee `colors` al
          construirse y NO reevalúa la prop en caliente. Sin el remonte,
          un cambio de tema con el host montado seguiría disparando la
          paleta vieja hasta la próxima emisión. */}
      <ConfettiCannon
        key={mode}
        ref={cannonRef}
        count={120}
        origin={
          isTop
            ? { x: SCREEN_W / 2, y: -20 }
            : { x: SCREEN_W / 2, y: 0 }
        }
        autoStart={false}
        explosionSpeed={isTop ? 350 : 500}
        fallSpeed={2400}
        fadeOut
        colors={colors}
      />
    </View>
  )
}
