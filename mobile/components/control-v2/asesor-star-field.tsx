import { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useLoopAnimation } from '@/hooks/use-loop-animation'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { decorativeDurations } from '@/lib/motion/tokens'

/**
 * Campo de estrellas del fondo de las hojas del asesor.
 *
 * Overlay absoluto, no interactivo, con puntos distribuidos de forma
 * determinística (misma constelación en cada montaje) y un único
 * `phase` compartido: cada punto lee la fase con su propio offset, así
 * que N estrellas cuestan UN solo loop en el UI thread. Reduced motion
 * deja el campo quieto en su opacidad base.
 *
 * `colors` y `opacityScale` los decide el caller por tema — los tres
 * tonos del preset `hero` sólo funcionan sobre material oscuro (ver
 * `starColors` en `asesor-neo-meta`).
 */

export interface AsesorStarFieldProps {
  count: number
  colors: readonly string[]
  opacityScale: number
}

export const AsesorStarField = memo(function AsesorStarField({
  count,
  colors,
  opacityScale,
}: AsesorStarFieldProps) {
  const reduced = useReducedMotion()
  const phase = useSharedValue(0)
  useLoopAnimation(
    () => {
      if (reduced) return
      phase.value = withRepeat(
        withSequence(
          withTiming(1, {
            duration: decorativeDurations.pulseSlow,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(0, {
            duration: decorativeDurations.pulseSlow,
            easing: Easing.inOut(Easing.sin),
          }),
        ),
        -1,
        false,
      )
    },
    [phase],
    [reduced],
  )
  return (
    <View style={styles.field} pointerEvents="none">
      {Array.from({ length: count }).map((_, i) => {
        const left = ((i * 73 + i * 17) % 100) / 100
        const top = ((i * 41 + 7) % 100) / 100
        const size = 1 + (i % 3)
        const baseOpacity = (0.18 + (i % 5) * 0.06) * opacityScale
        const offset = (i % 6) * 0.16
        return (
          <Star
            key={i}
            left={left}
            top={top}
            size={size}
            baseOpacity={baseOpacity}
            phaseOffset={offset}
            phase={phase}
            color={colors[i % colors.length] ?? colors[0]}
          />
        )
      })}
    </View>
  )
})

function Star({
  left,
  top,
  size,
  baseOpacity,
  phaseOffset,
  phase,
  color,
}: {
  left: number
  top: number
  size: number
  baseOpacity: number
  phaseOffset: number
  phase: { value: number }
  color: string
}) {
  const twinkle = useAnimatedStyle(() => {
    const v = (phase.value + phaseOffset) % 1
    const wave = Math.sin(v * Math.PI)
    return { opacity: baseOpacity + wave * 0.32 }
  })
  return (
    <Animated.View
      style={[
        styles.star,
        {
          left: `${left * 100}%`,
          top: `${top * 100}%`,
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: color,
        },
        twinkle,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  field: {
    ...StyleSheet.absoluteFillObject,
  },
  star: {
    position: 'absolute',
  },
})
