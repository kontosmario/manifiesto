// mobile/components/ui/no-spend-confetti-host.tsx
//
// Pinta confetti full-screen cuando el bus emite. Un solo host por
// app (montado en app-stack-shell). Misma topología que ToastHost.

import { useEffect, useRef, useState } from 'react'
import { Dimensions, StyleSheet, View } from 'react-native'
import ConfettiCannon from 'react-native-confetti-cannon'
import { subscribeConfetti, type ConfettiPayload } from '@/lib/confetti-bus'

const { width: SCREEN_W } = Dimensions.get('window')

// Paleta de confeti: colores cálidos + brand greens. Una sola
// constante para evitar inventar paletas distintas en cada caller.
const CONFETTI_COLORS = [
  '#A6EF8F', // brand bright
  '#329315', // brand deep
  '#FFD580', // warm amber
  '#FFB3C7', // soft pink
  '#9BB6FF', // pale blue
  '#FFFFFF', // confetti highlight
]

export function NoSpendConfettiHost() {
  const [active, setActive] = useState<ConfettiPayload | null>(null)
  const cannonRef = useRef<ConfettiCannon | null>(null)

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
      <ConfettiCannon
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
        colors={CONFETTI_COLORS}
      />
    </View>
  )
}
