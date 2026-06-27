import { memo, useEffect } from 'react'
import { Image, StyleSheet } from 'react-native'
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
import { FilledAchievementIcon } from '@/components/achievements/achievement-icon-filled'
import { CATEGORY_ICONS } from '@/components/category/category-icon-registry'
import { useAppTheme } from '@/theme/theme-provider'
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
  const { theme } = useAppTheme()
  const c = GLYPH[tone]
  switch (stage) {
    case 'seed':
      // Sticker del owner — semilla (estado más temprano). Mismo box 22×22 que
      // el glyph SVG anterior; el growIn lo aplica el Animated.View que envuelve.
      return (
        <Image
          source={CATEGORY_ICONS['crecimiento/semilla']}
          style={[styles.seedImg, styles.seed]}
          resizeMode="contain"
        />
      )
    case 'germ':
      // Sticker del owner — mini brote (etapa intermedia, 2 hojas). Box 27×27.
      return (
        <Image
          source={CATEGORY_ICONS['crecimiento/mini-brote']}
          style={[styles.germImg, styles.germ]}
          resizeMode="contain"
        />
      )
    case 'fern':
      // Ícono de la app (brote grande, 3er step). Variante por TEMA: 'cream'
      // (casi blanco) se PERDÍA sobre la tierra clara del light mode → 'forest'
      // (verde oscuro, visible). En dark mode / celebración (fondo oscuro)
      // 'cream' se ve bien (no se toca).
      return (
        <FernMark
          variant={theme.isDark || tone === 'dark' ? 'cream' : 'forest'}
          size={fernSize}
          style={styles.fern}
        />
      )
    case 'bloom':
      // Semana perfecta: ícono "Meta florecida" de logros (goal_completed) —
      // reemplaza la flor SVG. La fila además se cubre de luciérnagas (grid).
      // size 26 (no 36): el badge es un cuadrado de esquinas RECTAS; a tamaño
      // casi-celda sus esquinas se recortaban contra el borde redondeado. Más
      // chico → centrado, fully adentro, sin tocar los bordes de la celda.
      return <FilledAchievementIcon code="goal_completed" size={26} />
    case 'recovered':
      // Plantado con ayuda (1 escudo): brote modesto + semilla coral de "ayuda".
      // No florece — distinto de creciendo (sin coral) y de floración (flor llena).
      return (
        <Svg viewBox="0 0 40 44" width={28} height={28} style={[styles.recovered]}>
          <Path d="M20 40 V24" stroke={c.germStem} strokeWidth={2.2} strokeLinecap="round" />
          <Ellipse cx={13.5} cy={28} rx={5.5} ry={3.2} rotation={-34} originX={13.5} originY={28} fill={c.germLeaf1} />
          <Ellipse cx={26.5} cy={26.5} rx={5.5} ry={3.2} rotation={34} originX={26.5} originY={26.5} fill={c.germLeaf2} />
          <Circle cx={20} cy={18} r={3} fill={c.bloomPetal} />
        </Svg>
      )
    case 'missed':
      return (
        <Svg viewBox="0 0 40 44" width={26} height={26} style={[styles.missed, { opacity: c.missOpacity }]}>
          <Path d="M20 40 Q19 30 24 26" stroke={c.missStroke} strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <Ellipse cx={27} cy={25} rx={6.5} ry={3.6} rotation={58} originX={27} originY={25} fill={c.missFill} />
        </Svg>
      )
    case 'pending':
      return (
        <Svg width={24} height={24}>
          <Circle cx={12} cy={12} r={10} stroke="#7FC56A" strokeWidth={2} strokeDasharray="3 3" fill="none" />
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
  // Sin marginBottom: el glyph se CENTRA en su casillero (garden-grid) y en el
  // broteSlot de la celebración. (Antes había lift para el anclaje al piso.)
  seed: {},
  germ: {},
  fern: {},
  bloom: {},
  recovered: {},
  missed: {},
  // Stickers PNG más grandes (pedido del owner: apreciar más el jardín).
  seedImg: { width: 28, height: 28 },
  germImg: { width: 32, height: 32 },
})

export const Sprout = memo(SproutImpl)
