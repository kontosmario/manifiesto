import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useEffect } from 'react'
import { motionDurations } from '@/lib/motion/tokens'
import { useImportReviewNeo } from './import-review-neo'

export type StepStatus = 'pending' | 'current' | 'done' | 'invalid' | 'skipped'

interface Props {
  /** One entry per movement — drives width and the filled/pending split. */
  statuses: readonly StepStatus[]
}

const EASE_IOS = Easing.bezier(0.32, 0.72, 0, 1)

/**
 * Barra de progreso del wizard: una pista HUNDIDA con un tramo por
 * movimiento. Deliberadamente mantiene DOS ideas — "resuelto" (tramo
 * pintado) vs "todavía adelante" (el pozo vacío) — más un único aviso para
 * una fila inválida, que es el único estado que pide acción del usuario. El
 * esquema de cinco colores anterior obligaba a aprender una leyenda para algo
 * que el encabezado "Movimiento N de M" y el slide ya comunican.
 */
export function ImportReviewStepIndicator({ statuses }: Props) {
  const { neo, wellFallback } = useImportReviewNeo()
  if (statuses.length <= 1) return null
  return (
    <View
      style={[
        styles.track,
        { backgroundColor: neo.well, boxShadow: neo.shadows.insetSm },
        wellFallback,
      ]}
    >
      {statuses.map((s, idx) => (
        <Segment key={idx} status={s} />
      ))}
    </View>
  )
}

function Segment({ status }: { status: StepStatus }) {
  const { neo } = useImportReviewNeo()
  const filled = status !== 'pending'
  const opacity = useSharedValue(filled ? 1 : 0)

  useEffect(() => {
    opacity.value = withTiming(filled ? 1 : 0, {
      duration: motionDurations.quick,
      easing: EASE_IOS,
    })
  }, [filled, opacity])

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  // Un solo color extra carga significado: el terracota de "arreglá esto".
  // Todo lo demás resuelto va en el verde del sistema (4.23:1 sobre el pozo en
  // claro, 10.78:1 en oscuro — de sobra para un elemento de UI).
  const color = status === 'invalid' ? neo.danger : neo.green

  return (
    <Animated.View
      style={[styles.segment, animatedStyle, { backgroundColor: color }]}
    />
  )
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
    padding: 3,
    borderRadius: 999,
    marginTop: 2,
  },
  segment: {
    flex: 1,
    height: 6,
    borderRadius: 999,
  },
})
