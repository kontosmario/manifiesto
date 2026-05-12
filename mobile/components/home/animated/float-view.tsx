import { type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { useLoopAnimation } from '@/hooks/use-loop-animation'

interface FloatViewProps {
  amplitude?: number
  periodMs?: number
  style?: ViewStyle
  children: React.ReactNode
}

export function FloatView({ amplitude = 6, periodMs = 3000, style, children }: FloatViewProps) {
  // Inicio en el extremo negativo (-amp/2) → animar al extremo positivo
  // (+amp/2) → reverse-alternate forever. Esto oscila ALREDEDOR del
  // centro (no solo "hop arriba y volver"), y el `reverse=true` evita
  // el "restart feel" del patrón anterior:
  //
  //   Antes:  withSequence(0→-amp, -amp→0) + withRepeat(false)
  //           Camino: 0 → -amp → 0 → 0 → -amp → 0 …
  //           Discontinuidad de velocidad al final de cada sequence
  //           (decelerando a 0 en y=0, luego acelerando desde 0 hacia
  //           -amp en la siguiente iteración) → pausa visible.
  //
  //   Ahora:  withTiming(-amp/2 → +amp/2) + withRepeat(reverse=true)
  //           Camino: -amp/2 → +amp/2 → -amp/2 → +amp/2 …
  //           Velocidad llega a 0 SOLO en los extremos (peaks), que es
  //           lo natural en una sinusoidal — no hay sensación de stop.
  const y = useSharedValue(-amplitude / 2)
  // `useLoopAnimation` parks the loop on blur/unmount and respects
  // reduced motion automatically — no manual cancelAnimation needed.
  useLoopAnimation(
    () => {
      // periodMs es el período completo (ida + vuelta). withRepeat
      // reverse=true ya hace la ida-y-vuelta automática, así que un
      // single withTiming usa la mitad del período.
      y.value = -amplitude / 2
      y.value = withRepeat(
        withTiming(amplitude / 2, {
          duration: periodMs / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true,
      )
    },
    [y],
    [amplitude, periodMs],
  )
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }))
  return <Animated.View style={[style, a]}>{children}</Animated.View>
}
