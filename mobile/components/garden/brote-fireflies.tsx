import { memo, useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

/**
 * Luciérnagas que ORBITAN un brote en la celebración de cierre de semana.
 *
 * Antes el campo full-screen ponía partículas grandes ENCIMA de los fern que
 * arrancaban estáticas (sin entrada) y no se relacionaban con el brote. Acá
 * cada fern tiene SUS luciérnagas, que:
 *   - ENTRAN con `opacity 0→1 + scale 0.6→1` (ease-out), escalonadas con el
 *     growIn del brote (nada aparece de la nada).
 *   - ORBITAN de forma continua (cos/sin elíptico) alrededor del centro del
 *     brote — lo rodean de manera dinámica.
 *   - TITILAN (flicker) mientras orbitan.
 *
 * Un solo `orbit` + `enter` SharedValue por brote manejan las N partículas
 * (cada una lee con su fase/radio) → barato aún con 7 brotes.
 */

interface BroteFirefliesProps {
  /** Stagger de entrada (ms) — espejar el `animateInDelay` del brote. */
  delay?: number
}

const COUNT = 4
const ORBIT_MS = 6000
const RADIUS_X = 23
const RADIUS_Y = 15 // órbita elíptica (más ancha que alta) → sensación de profundidad

const PARTICLES = Array.from({ length: COUNT }, (_, i) => {
  const isPeach = i % 2 === 0 // las "grandes" cálidas alternadas
  return {
    i,
    base: (i / COUNT) * Math.PI * 2, // repartidas en el círculo
    rx: RADIUS_X * (0.82 + (i % 2) * 0.32),
    ry: RADIUS_Y * (0.82 + ((i + 1) % 2) * 0.32),
    flickerPhase: i * 1.9,
    size: isPeach ? 5 : 3,
    color: isPeach ? '#F0B488' : '#FFFBF2',
  }
})

function Particle({
  spec,
  orbit,
  enter,
  reduced,
}: {
  spec: (typeof PARTICLES)[number]
  orbit: SharedValue<number>
  enter: SharedValue<number>
  reduced: boolean
}) {
  const animated = useAnimatedStyle(() => {
    'worklet'
    const a = reduced ? spec.base : spec.base + orbit.value * Math.PI * 2
    const tx = Math.cos(a) * spec.rx
    const ty = Math.sin(a) * spec.ry
    const flick = reduced
      ? 0.7
      : (Math.sin(orbit.value * Math.PI * 2 * 2 + spec.flickerPhase) + 1) / 2
    return {
      opacity: enter.value * (0.45 + flick * 0.5),
      transform: [
        { translateX: tx },
        { translateY: ty },
        { scale: enter.value },
      ],
    }
  })

  const glow = `0px 0px ${(spec.size * 2.6).toFixed(1)}px ${spec.color}`
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: '50%',
          // El brote está anclado abajo del slot (flex-end): el centro de la
          // órbita baja a ~62% para envolver el fern, no el aire de arriba.
          top: '62%',
          width: spec.size,
          height: spec.size,
          marginLeft: -spec.size / 2,
          marginTop: -spec.size / 2,
          borderRadius: spec.size / 2,
          backgroundColor: spec.color,
          boxShadow: glow,
          opacity: 0,
        },
        animated,
      ]}
    />
  )
}

export const BroteFireflies = memo(function BroteFireflies({
  delay = 0,
}: BroteFirefliesProps) {
  const reduced = useReducedMotion()
  const orbit = useSharedValue(0)
  const enter = useSharedValue(0)

  useEffect(() => {
    enter.value = withDelay(
      delay,
      withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
    )
    if (!reduced) {
      orbit.value = withRepeat(
        withTiming(1, { duration: ORBIT_MS, easing: Easing.linear }),
        -1,
        false,
      )
    }
    // Cancelar al desmontar (consistente con CoralBloom): detiene la órbita +
    // la entrada cuando el brote se va (cierre dismisseado, o salida del intro).
    return () => {
      cancelAnimation(orbit)
      cancelAnimation(enter)
    }
  }, [delay, reduced, orbit, enter])

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {PARTICLES.map((spec) => (
        <Particle
          key={spec.i}
          spec={spec}
          orbit={orbit}
          enter={enter}
          reduced={reduced}
        />
      ))}
    </View>
  )
})
