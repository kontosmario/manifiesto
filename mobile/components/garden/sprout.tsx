import { memo, useEffect } from 'react'
import { StyleSheet } from 'react-native'
import Svg, { Circle, Ellipse, Path } from 'react-native-svg'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { FernMark } from '@/components/billing/fern-mark'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import type { BroteStage } from '@/features/garden/garden-model'

interface SproutProps {
  stage: BroteStage
  /** Tamaño del helecho cuando stage === 'fern' (24→32 según antigüedad). */
  fernSize?: number
  /** Entrada animada (brote que sale) — solo para el brote recién plantado. */
  animateIn?: boolean
}

// Glyph estático por estado. Calca los paths del prototipo hifi
// (Jardin Manifiesto.dc.html, frame 1). El SVG mantiene viewBox 0 0 40 44
// con preserveAspectRatio default (meet) igual que el HTML.
function SproutGlyph({ stage, fernSize = 26 }: { stage: BroteStage; fernSize?: number }) {
  switch (stage) {
    case 'seed':
      return (
        <Svg viewBox="0 0 40 44" width={22} height={22} style={[styles.seed]}>
          <Ellipse
            cx={20}
            cy={26}
            rx={6.5}
            ry={9}
            rotation={20}
            originX={20}
            originY={26}
            fill="#C29A5E"
          />
          <Path d="M16 24 Q20 18 25 21" stroke="#8FA86A" strokeWidth={2} fill="none" strokeLinecap="round" />
        </Svg>
      )
    case 'germ':
      return (
        <Svg viewBox="0 0 40 44" width={27} height={27} style={[styles.germ]}>
          <Path d="M20 40 V21" stroke="#3C7D34" strokeWidth={2.4} strokeLinecap="round" />
          <Ellipse
            cx={12.5}
            cy={21}
            rx={7.5}
            ry={4.6}
            rotation={-36}
            originX={12.5}
            originY={21}
            fill="#9FD580"
          />
          <Ellipse
            cx={27.5}
            cy={18.5}
            rx={8}
            ry={5}
            rotation={33}
            originX={27.5}
            originY={18.5}
            fill="#A9D57F"
          />
        </Svg>
      )
    case 'fern':
      return <FernMark variant="cream" size={fernSize} style={styles.fern} />
    case 'missed':
      return (
        <Svg viewBox="0 0 40 44" width={24} height={24} style={[styles.missed]}>
          <Path d="M20 40 Q19 30 24 26" stroke="#B7B2A2" strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <Ellipse
            cx={27}
            cy={25}
            rx={6.5}
            ry={3.6}
            rotation={58}
            originX={27}
            originY={25}
            fill="#CBC6B6"
          />
        </Svg>
      )
    case 'pending':
      // Anillo punteado "esperando tu brote". SVG (no border dashed RN, que
      // renderiza con artefactos en bordes redondeados en iOS).
      return (
        <Svg width={22} height={22}>
          <Circle cx={11} cy={11} r={9} stroke="#7FC56A" strokeWidth={2} strokeDasharray="3 3" fill="none" />
        </Svg>
      )
    case 'pre':
    default:
      return null
  }
}

function SproutImpl({ stage, fernSize, animateIn }: SproutProps) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(animateIn && !reduced ? 0.2 : 1)
  const opacity = useSharedValue(animateIn && !reduced ? 0 : 1)

  useEffect(() => {
    if (!animateIn || reduced) return
    // keyframe `sprout`: scale .2 → 1.16 (55%) → 1; opacity sube a 1 a mitad.
    scale.value = withSequence(
      withTiming(1.16, { duration: 385, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }),
      withTiming(1, { duration: 315, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }),
    )
    opacity.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) })
  }, [animateIn, reduced, scale, opacity])

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }))

  if (stage === 'pre') return null
  if (!animateIn) {
    return <SproutGlyph stage={stage} fernSize={fernSize} />
  }
  return (
    <Animated.View style={animStyle}>
      <SproutGlyph stage={stage} fernSize={fernSize} />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  seed: { marginBottom: 7 },
  germ: { marginBottom: 4 },
  fern: { marginBottom: 2 },
  missed: { marginBottom: 5, opacity: 0.62 },
})

export const Sprout = memo(SproutImpl)
