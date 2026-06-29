import { useCallback, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useTranslation } from 'react-i18next'
import { usePressScale } from '@/hooks/use-press-scale'
import { authTokens } from '@/theme/palette'
import {
  SlideBrand,
  SlideCta,
  SlideGarden,
  SlideMovements,
  SlideNumber,
} from './intro-slides'

const SLIDE_COUNT = 5
const LAST = SLIDE_COUNT - 1

// El fondo de la intro es SIEMPRE verde oscuro de marca (BrandBackdrop +
// WelcomeScreen, ambos theme-independent), así que el chrome —dots, "Seguir",
// "Saltar"— usa SIEMPRE el esquema claro-sobre-oscuro (alto contraste en light
// y dark mode por igual). Mint sobre verde y blanco sobre verde pasan WCAG AA.
const DOT_ACTIVE = '#9FE08A'
// 0.42 (no 0.28) → ~3.2:1 sobre el verde oscuro = pasa WCAG AA para componentes UI.
const DOT_INACTIVE = 'rgba(255,255,255,0.42)'

export interface IntroScreenProps {
  /** "Crear mi hogar" → marca el intro como visto + va a signup. */
  onCreate: () => void
  /** "Ya tengo una cuenta" → marca el intro como visto + va a login. */
  onLogin: () => void
}

/**
 * Un punto del indicador. INTERPOLA por la posición real del scroll: el punto
 * activo crece (8→24) y su color hace crossfade mientras deslizás (no de golpe
 * al soltar). Colores constantes (claro-sobre-oscuro) porque el fondo siempre
 * es verde oscuro.
 */
function Dot({
  i,
  scrollX,
  width,
}: {
  i: number
  scrollX: SharedValue<number>
  width: number
}) {
  const style = useAnimatedStyle(() => {
    const page = width > 0 ? scrollX.value / width : 0
    const prox = interpolate(page, [i - 1, i, i + 1], [0, 1, 0], Extrapolation.CLAMP)
    return {
      width: 8 + prox * 16,
      backgroundColor: interpolateColor(prox, [0, 1], [DOT_INACTIVE, DOT_ACTIVE]),
    }
  })
  return <Animated.View style={[styles.dot, style]} />
}

/** Botón "Seguir" — mint sobre verde con texto oscuro + press-scale. */
function NextButton({ onPress, label }: { onPress: () => void; label: string }) {
  const press = usePressScale({ pressedScale: 0.96 })
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
    >
      <Animated.View style={[styles.next, press.animatedStyle]}>
        <Text style={styles.nextText}>{label}</Text>
      </Animated.View>
    </Pressable>
  )
}

/**
 * Pre-auth onboarding intro — 5 slides a pantalla completa que reusan los
 * componentes REALES de la app (HomeHeroCard, FijosHeroCard, GastoRow,
 * IncomeRow, StreakWeekWidget) alimentados con datos ilustrativos. El slide 5
 * es la WelcomeScreen real. Pager = ScrollView horizontal paginado (flex:1, a
 * pantalla completa). El indicador y el CTA se animan por la posición del scroll.
 */
export function IntroScreen({ onCreate, onLogin }: IntroScreenProps) {
  const { t } = useTranslation()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const scrollX = useSharedValue(0)
  const [index, setIndex] = useState(0)

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x
    },
  })

  const goTo = useCallback(
    (i: number) => {
      const clamped = Math.max(0, Math.min(LAST, i))
      setIndex(clamped)
      // Guard width>0: en el primer render useWindowDimensions puede dar 0
      // (mismo cuidado que hour-carousel) → scrollTo(0) iría siempre al slide 0.
      if (width > 0) scrollRef.current?.scrollTo({ x: clamped * width, animated: true })
    },
    [width, scrollRef],
  )

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (width <= 0) return // evita dividir por cero (Math.round(x/0) → Infinity)
      const i = Math.round(e.nativeEvent.contentOffset.x / width)
      setIndex((prev) => (prev === i ? prev : i))
    },
    [width],
  )

  const isLast = index === LAST

  return (
    <View style={styles.root}>
      {/* Fondo siempre oscuro → status bar clara en light y dark mode. */}
      <StatusBar style="light" />
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        // flex:1 → el pager ocupa toda la pantalla y cada slide (flex:1) se
        // estira a la altura completa.
        style={styles.scroll}
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}
      >
        <SlideBrand width={width} active={index === 0} scrollX={scrollX} index={0} />
        <SlideNumber width={width} active={index === 1} scrollX={scrollX} index={1} />
        <SlideMovements width={width} active={index === 2} scrollX={scrollX} index={2} />
        <SlideGarden width={width} active={index === 3} scrollX={scrollX} index={3} />
        <SlideCta
          width={width}
          active={index === LAST}
          scrollX={scrollX}
          index={LAST}
          onCreate={onCreate}
          onLogin={onLogin}
        />
      </Animated.ScrollView>

      {!isLast ? (
        <View style={[styles.footer, { bottom: insets.bottom + 24 }]}>
          <View style={styles.dots}>
            {/* 4 puntos = los 4 slides del showcase. El welcome (índice 4 = LAST)
                es el destino de "Comenzar", no un paso del showcase → sin punto. */}
            {Array.from({ length: LAST }).map((_, i) => (
              <Pressable
                key={i}
                onPress={() => goTo(i)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('onboarding:intro.dotLabel', { n: i + 1 })}
              >
                <Dot i={i} scrollX={scrollX} width={width} />
              </Pressable>
            ))}
          </View>
          {/* En la última slide ANTES del welcome el CTA es puntual ("Comenzar")
              en vez de "Seguir" — señala el final del showcase y la entrada al alta. */}
          <NextButton
            onPress={() => goTo(index + 1)}
            label={t(index === LAST - 1 ? 'onboarding:intro.cta.begin' : 'onboarding:intro.cta.next')}
          />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  // Fondo oscuro (no theme.canvas) para que no haya flash claro en light mode
  // durante el bounce del scroll; los slides lo cubren igual.
  root: { flex: 1, backgroundColor: authTokens.welcomeBg },
  scroll: { flex: 1 },
  footer: {
    position: 'absolute',
    left: 28,
    right: 28,
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { height: 8, borderRadius: 4 },
  next: {
    height: 52,
    paddingHorizontal: 26,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9FE08A',
  },
  nextText: { fontSize: 15.5, fontWeight: '800', color: '#0E2A19' },
})
