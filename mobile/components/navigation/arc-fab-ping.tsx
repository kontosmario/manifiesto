import { useEffect } from 'react'
import { StyleSheet } from 'react-native'
import Animated, {
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { decorativeDurations, motionEasings } from '@/lib/motion'
import { ARC_PHASE_CLOSED } from './arc-hub-context'

/**
 * Affordance del mantener-apretado: un ping lento que sale del disco del
 * FAB. Es la única señal de que hay un gesto ahí, y vive SOLO con el hub
 * cerrado — el loop se cancela al abrir para no dejar trabajo de UI thread
 * corriendo debajo del arco.
 *
 * Con «reducir movimiento» queda congelado como halo fijo: la señal de que
 * el gesto existe no se puede perder, sólo su animación.
 *
 * Es concéntrico al disco de 62 igual que el `burstRing` del camino
 * legacy, pero NO conviven: el burst se dispara al tocar y el arco ya da
 * su propio feedback.
 */
export function ArcFabPing({
  color,
  phase,
  reduced,
}: {
  color: string
  phase: SharedValue<number>
  reduced: boolean
}) {
  const ping = useSharedValue(0)

  useEffect(() => {
    if (reduced) {
      cancelAnimation(ping)
      ping.value = 0
      return
    }
    ping.value = withRepeat(
      withTiming(1, {
        duration: decorativeDurations.breath,
        easing: motionEasings.standard,
      }),
      -1,
      false,
    )
    return () => {
      cancelAnimation(ping)
    }
  }, [reduced, ping])

  useAnimatedReaction(
    () => phase.value === ARC_PHASE_CLOSED,
    (closed, previous) => {
      if (closed === previous || reduced) return
      if (!closed) {
        cancelAnimation(ping)
        ping.value = 0
        return
      }
      ping.value = withRepeat(
        withTiming(1, {
          duration: decorativeDurations.breath,
          easing: motionEasings.standard,
        }),
        -1,
        false,
      )
    },
    [reduced],
  )

  const style = useAnimatedStyle(() => {
    const gate = phase.value === ARC_PHASE_CLOSED ? 1 : 0
    if (reduced) {
      return { opacity: 0.7 * gate, transform: [{ scale: 1.22 }] }
    }
    const t = ping.value
    return {
      opacity:
        gate * interpolate(t, [0, 0.18, 1], [0, 1, 0], Extrapolation.CLAMP),
      transform: [
        { scale: interpolate(t, [0, 0.18, 1], [1.02, 1.14, 1.62], Extrapolation.CLAMP) },
      ],
    }
  })

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ring, style, { borderColor: color }]}
    />
  )
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    alignSelf: 'center',
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2,
  },
})
