import { memo, useEffect } from 'react'
import { Image, StyleSheet } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { FernMark } from '@/components/billing/fern-mark'
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

// Glyph estático por estado. TODOS los íconos son stickers PNG del owner vía
// CATEGORY_ICONS['crecimiento/*'] (generados desde los SVG de _src por
// scripts/gen-category-icons.mjs), salvo el brote grande, que es el FernMark de
// marca. Crecimiento: semilla → mini-brote → brote grande. Estados restantes:
// recuperado (día que un escudo salvó, auto-plantado) / marchito (sin registrar
// y sin escudo) / pending (hoy sin registrar).
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
  switch (stage) {
    case 'seed':
      // Semilla (estado más temprano).
      return (
        <Image
          source={CATEGORY_ICONS['crecimiento/semilla']}
          style={styles.seedImg}
          resizeMode="contain"
        />
      )
    case 'germ':
      // Mini brote (etapa intermedia, 2 hojas).
      return (
        <Image
          source={CATEGORY_ICONS['crecimiento/mini-brote']}
          style={styles.germImg}
          resizeMode="contain"
        />
      )
    case 'fern':
    case 'bloom':
      // Brote grande (3er step). En semana PERFECTA (bloom) es el MISMO fern — lo
      // especial de la floración son las luciérnagas (garden-grid), no un ícono
      // distinto. Variante por tema: 'forest' (verde, visible sobre la tierra
      // clara) en light; 'cream' en dark / celebración.
      return (
        <FernMark
          variant={theme.isDark || tone === 'dark' ? 'cream' : 'forest'}
          size={fernSize}
          style={styles.fern}
        />
      )
    case 'recovered':
      // Plantado con ayuda (1 escudo): brote + semilla coral.
      return (
        <Image
          source={CATEGORY_ICONS['crecimiento/recuperado']}
          style={styles.recoveredImg}
          resizeMode="contain"
        />
      )
    case 'missed':
      // Día sin registrar (brote marchito).
      return (
        <Image
          source={CATEGORY_ICONS['crecimiento/marchito']}
          style={styles.missedImg}
          resizeMode="contain"
        />
      )
    case 'pending':
      // Hoy, todavía sin registrar (círculo punteado).
      return (
        <Image
          source={CATEGORY_ICONS['crecimiento/pending']}
          style={styles.pendingImg}
          resizeMode="contain"
        />
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
  // El glyph se CENTRA en su casillero (garden-grid) / broteSlot (celebración).
  fern: {},
  // Stickers PNG (tamaños grandes para apreciar el jardín — pedido del owner).
  seedImg: { width: 28, height: 28 },
  germImg: { width: 32, height: 32 },
  recoveredImg: { width: 32, height: 32 },
  missedImg: { width: 30, height: 30 },
  pendingImg: { width: 28, height: 28 },
})

export const Sprout = memo(SproutImpl)
