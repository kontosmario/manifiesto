// mobile/components/garden/day-brot.tsx
//
// Mini-Brot de un día de la semana, con su entrada escalonada L→D.
//
// Vivía dentro de `week-close-celebration.tsx`. Ese archivo lo retiró el
// rediseño del jardín (2026-08: el cierre de semana pasó a
// `week-close-cierre.tsx` + `CierreSemanaView`, con 4 variantes), pero estos
// dos exports NO murieron con él: la intro PRE-AUTH
// (`screens/auth/intro/intro-slides.tsx`, slide 4 "Tu jardín") monta el mismo
// mini-Brot en su preview acotado. Se extraen acá —módulo propio, sin el resto
// del takeover— para que la intro no dependa de una pantalla que ya no existe.

import { useEffect } from 'react'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated'
import { BrotMascot, type BrotPose } from '@/components/brot'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionSprings } from '@/lib/motion'

/**
 * Tamaño del mini-Brot de la fila de 7 días. Era
 * `GARDEN_GEOMETRY.weekCloseBrotSize` en `redesign/garden/garden-spec.ts`; ese
 * spec quedó sin ningún otro consumidor cuando el rediseño retiró la grilla,
 * el hero de stats y el banner, así que la única constante que seguía viva
 * viaja acá con su dueño.
 */
export const DAY_BROT_SIZE = 34

/**
 * Mini-Brot por día de la semana, misma escala que la grilla del jardín
 * (handoff L81/L82): registrado = `idle`, día que un escudo recuperó =
 * `seed` (cuenta, pero nunca llegó a crecer), salteado = `wilted`.
 */
export function poseForDay(registered: boolean, recovered: boolean): BrotPose {
  if (registered) return 'idle'
  if (recovered) return 'seed'
  return 'wilted'
}

/** Mini-Brot con la entrada escalonada L→D de la fila. */
export function DayBrot({ pose, delay }: { pose: BrotPose; delay: number }) {
  const reduced = useReducedMotion()
  const grow = useSharedValue(reduced ? 1 : 0)

  useEffect(() => {
    if (reduced) {
      grow.value = 1
      return
    }
    grow.value = withDelay(delay, withSpring(1, motionSprings.celebrate))
  }, [delay, reduced, grow])

  // El spring `celebrate` sobrepasa 1 (ahí está el rebote): la opacidad se
  // clampea, la escala no.
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, grow.value),
    transform: [{ scale: 0.3 + grow.value * 0.7 }],
  }))

  return (
    <Animated.View style={style}>
      <BrotMascot pose={pose} size={DAY_BROT_SIZE} animated={false} shadow={false} />
    </Animated.View>
  )
}
