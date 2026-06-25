import { memo, useEffect } from 'react'
import { StyleSheet } from 'react-native'
import Svg, { Circle, Ellipse, Path } from 'react-native-svg'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { FernMark } from '@/components/billing/fern-mark'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import type { BroteStage } from '@/features/garden/garden-model'

type SproutTone = 'light' | 'dark'

interface SproutProps {
  stage: BroteStage
  /** Tamaño del helecho cuando stage === 'fern' (24→32 según antigüedad). */
  fernSize?: number
  /** Paleta del glyph. 'light' = grilla sobre crema; 'dark' = celebración sobre verde. */
  tone?: SproutTone
  /** Entrada animada (brote que sale) — para el brote recién plantado / cierre. */
  animateIn?: boolean
  /** Delay del growIn (stagger de los 7 brotes del cierre de semana). */
  animateInDelay?: number
}

// Fills del glyph por tono. El handoff usa colores más claros/desaturados sobre
// el verde profundo de la celebración (Frame 4) que sobre la crema (Frame 1).
const GLYPH = {
  light: {
    seedFill: '#C29A5E',
    seedStem: '#8FA86A',
    germStem: '#3C7D34',
    germLeaf1: '#9FD580',
    germLeaf2: '#A9D57F',
    bloomPetal: '#E2935E',
    bloomCenter: '#F4D58A',
    missStroke: '#B7B2A2',
    missFill: '#CBC6B6',
    missOpacity: 0.62,
  },
  dark: {
    seedFill: '#D8B27A',
    seedStem: '#A9C28A',
    germStem: '#6FB35E',
    germLeaf1: '#9FD580',
    germLeaf2: '#B7DD8E',
    bloomPetal: '#E8A57C',
    bloomCenter: '#F6DC9A',
    missStroke: '#7E8C76',
    missFill: '#6F7E68',
    missOpacity: 0.45,
  },
} as const

// Glyph estático por estado. Calca los paths del prototipo hifi
// (Jardin Manifiesto.dc.html). viewBox 0 0 40 44 con preserveAspectRatio default.
function SproutGlyph({
  stage,
  fernSize = 26,
  tone = 'light',
}: {
  stage: BroteStage
  fernSize?: number
  tone?: SproutTone
}) {
  const c = GLYPH[tone]
  switch (stage) {
    case 'seed':
      return (
        <Svg viewBox="0 0 40 44" width={22} height={22} style={[styles.seed]}>
          <Ellipse cx={20} cy={26} rx={6.5} ry={9} rotation={20} originX={20} originY={26} fill={c.seedFill} />
          <Path d="M16 24 Q20 18 25 21" stroke={c.seedStem} strokeWidth={2} fill="none" strokeLinecap="round" />
        </Svg>
      )
    case 'germ':
      return (
        <Svg viewBox="0 0 40 44" width={27} height={27} style={[styles.germ]}>
          <Path d="M20 40 V21" stroke={c.germStem} strokeWidth={2.4} strokeLinecap="round" />
          <Ellipse cx={12.5} cy={21} rx={7.5} ry={4.6} rotation={-36} originX={12.5} originY={21} fill={c.germLeaf1} />
          <Ellipse cx={27.5} cy={18.5} rx={8} ry={5} rotation={33} originX={27.5} originY={18.5} fill={c.germLeaf2} />
        </Svg>
      )
    case 'fern':
      return <FernMark variant="cream" size={fernSize} style={styles.fern} />
    case 'bloom':
      // Semana perfecta: planta arraigada con flor coral (5 pétalos + centro).
      return (
        <Svg viewBox="0 0 40 44" width={28} height={28} style={[styles.bloom]}>
          <Path d="M20 40 V19" stroke={c.germStem} strokeWidth={2.4} strokeLinecap="round" />
          <Ellipse cx={13} cy={26} rx={6} ry={3.4} rotation={-32} originX={13} originY={26} fill={c.germLeaf1} />
          <Ellipse cx={27} cy={24} rx={6} ry={3.4} rotation={32} originX={27} originY={24} fill={c.germLeaf2} />
          <Circle cx={20} cy={8} r={3.8} fill={c.bloomPetal} />
          <Circle cx={14.5} cy={11.5} r={3.8} fill={c.bloomPetal} />
          <Circle cx={25.5} cy={11.5} r={3.8} fill={c.bloomPetal} />
          <Circle cx={16.3} cy={17} r={3.8} fill={c.bloomPetal} />
          <Circle cx={23.7} cy={17} r={3.8} fill={c.bloomPetal} />
          <Circle cx={20} cy={13} r={3.4} fill={c.bloomCenter} />
        </Svg>
      )
    case 'recovered':
      // Plantado con ayuda (1 escudo): brote modesto + semilla coral de "ayuda".
      // No florece — distinto de creciendo (sin coral) y de floración (flor llena).
      return (
        <Svg viewBox="0 0 40 44" width={24} height={24} style={[styles.recovered]}>
          <Path d="M20 40 V24" stroke={c.germStem} strokeWidth={2.2} strokeLinecap="round" />
          <Ellipse cx={13.5} cy={28} rx={5.5} ry={3.2} rotation={-34} originX={13.5} originY={28} fill={c.germLeaf1} />
          <Ellipse cx={26.5} cy={26.5} rx={5.5} ry={3.2} rotation={34} originX={26.5} originY={26.5} fill={c.germLeaf2} />
          <Circle cx={20} cy={18} r={3} fill={c.bloomPetal} />
        </Svg>
      )
    case 'missed':
      return (
        <Svg viewBox="0 0 40 44" width={24} height={24} style={[styles.missed, { opacity: c.missOpacity }]}>
          <Path d="M20 40 Q19 30 24 26" stroke={c.missStroke} strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <Ellipse cx={27} cy={25} rx={6.5} ry={3.6} rotation={58} originX={27} originY={25} fill={c.missFill} />
        </Svg>
      )
    case 'pending':
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

function SproutImpl({ stage, fernSize, tone = 'light', animateIn, animateInDelay = 0 }: SproutProps) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(animateIn && !reduced ? 0.2 : 1)
  const opacity = useSharedValue(animateIn && !reduced ? 0 : 1)

  useEffect(() => {
    if (!animateIn || reduced) return
    // keyframe `sprout`/`growIn`: scale .2 → 1.16 (55%) → 1; opacity sube a 1.
    scale.value = withDelay(
      animateInDelay,
      withSequence(
        withTiming(1.16, { duration: 385, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }),
        withTiming(1, { duration: 315, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }),
      ),
    )
    opacity.value = withDelay(animateInDelay, withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }))
  }, [animateIn, animateInDelay, reduced, scale, opacity])

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }))

  if (stage === 'pre') return null
  if (!animateIn) {
    return <SproutGlyph stage={stage} fernSize={fernSize} tone={tone} />
  }
  return (
    <Animated.View style={animStyle}>
      <SproutGlyph stage={stage} fernSize={fernSize} tone={tone} />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  seed: { marginBottom: 7 },
  germ: { marginBottom: 4 },
  fern: { marginBottom: 2 },
  bloom: { marginBottom: 3 },
  recovered: { marginBottom: 5 },
  missed: { marginBottom: 5 },
})

export const Sprout = memo(SproutImpl)
