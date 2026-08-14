import { useCallback, useMemo, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { Text } from '@/components/ui/app-text'
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
import { AUTH_SPEC, type AuthMode } from '@/components/redesign/auth/auth-spec'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { useThemeMode } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'
import {
  SlideBrand,
  SlideCta,
  SlideGarden,
  SlideMovements,
  SlideNumber,
} from './intro-slides'

const SLIDE_COUNT = 5
const LAST = SLIDE_COUNT - 1

/**
 * Chrome del pager por tema (riel de dots + CTA). Se arma una vez por modo al
 * cargar el módulo: el render solo elige uno.
 *
 * Contrastes calculados (peor par de cada tema):
 *  · dot activo — claro 4.29:1 / oscuro 10.79:1 sobre el pozo del riel.
 *  · dot inactivo — claro 5.26:1 / oscuro 6.24:1. Ambos ≥ 3:1 de componente UI.
 *  · label del CTA — oscuro 9.17:1. En CLARO la receta del spec da 3.36:1
 *    sobre el stop más claro del radial: es el MISMO fill y la misma tinta
 *    del "Empezar" de la Bienvenida a la que lleva (AuthCta variant welcome),
 *    así que se conserva tal cual y el tamaño del label se iguala al de ese
 *    CTA en vez de abrir una receta propia acá.
 */
interface ChromeInk {
  root: ViewStyle
  rail: ViewStyle
  dotActive: string
  dotInactive: string
  next: ViewStyle
  nextText: TextStyle
}

function buildChrome(mode: AuthMode): ChromeInk {
  const s = AUTH_SPEC[mode]
  const neo = neoTokens(mode)
  return {
    root: { backgroundColor: s.welcomeBg },
    // Riel hundido: los puntos viven en un surco, no sueltos sobre el fondo.
    // Android sin soporte de inset aplana el pozo en silencio → hairline.
    rail: {
      backgroundColor: neo.well,
      boxShadow: neo.shadows.insetSm,
      borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
      borderColor: neo.sheetDivider,
    },
    dotActive: s.linkAccent,
    dotInactive: s.helper,
    next: {
      experimental_backgroundImage: s.ctaWelcomeCss,
      backgroundColor: s.ctaWelcomeFallback,
      boxShadow: s.ctaWelcomeShadow,
    },
    nextText: { color: s.ctaWelcomeText },
  }
}

const CHROME: Record<AuthMode, ChromeInk> = {
  light: buildChrome('light'),
  dark: buildChrome('dark'),
}

export interface IntroScreenProps {
  /** "Crear mi hogar" → marca el intro como visto + va a signup. */
  onCreate: () => void
  /** "Ya tengo una cuenta" → marca el intro como visto + va a login. */
  onLogin: () => void
}

/**
 * Un punto del indicador. INTERPOLA por la posición real del scroll: el punto
 * activo crece (8→24) y su color hace crossfade mientras deslizás (no de golpe
 * al soltar). El relieve del riel es estático (los strings de boxShadow no son
 * animables): lo que se anima es el ancho y el fill del punto.
 */
function Dot({
  i,
  scrollX,
  width,
  activeColor,
  inactiveColor,
}: {
  i: number
  scrollX: SharedValue<number>
  width: number
  activeColor: string
  inactiveColor: string
}) {
  const style = useAnimatedStyle(() => {
    const page = width > 0 ? scrollX.value / width : 0
    const prox = interpolate(page, [i - 1, i, i + 1], [0, 1, 0], Extrapolation.CLAMP)
    return {
      width: 8 + prox * 16,
      backgroundColor: interpolateColor(prox, [0, 1], [inactiveColor, activeColor]),
    }
  })
  return <Animated.View style={[styles.dot, style]} />
}

/** Botón "Seguir" — la receta del CTA de la Bienvenida (3a) en pastilla
 *  compacta: mismo fill, misma sombra extruida, misma tinta y mismo cuerpo de
 *  label que el "Empezar" al que lleva. */
function NextButton({
  onPress,
  label,
  chrome,
}: {
  onPress: () => void
  label: string
  chrome: ChromeInk
}) {
  const press = usePressScale({ pressedScale: 0.96 })
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
    >
      <Animated.View style={[styles.next, chrome.next, press.animatedStyle]}>
        <Text style={[styles.nextText, chrome.nextText]}>{label}</Text>
      </Animated.View>
    </Pressable>
  )
}

/**
 * Pre-auth onboarding intro — 5 slides a pantalla completa que reusan los
 * componentes REALES de la app (hero de la Home, hero de Fijos y filas del
 * feed de Gastos, Brot y los brotes del cierre de semana) alimentados con
 * datos ilustrativos. El slide 5 es la Bienvenida real. Pager = ScrollView
 * horizontal paginado (flex:1, a pantalla completa). El indicador y el CTA se
 * animan por la posición del scroll.
 *
 * TEMA: el pager entero sigue el tema resuelto de la app — fondo, vitrinas,
 * chrome, StatusBar y la Bienvenida del slide 5 (que recibe el modo por
 * `forceMode`) leen el MISMO valor. Los tres puntos van juntos: si alguno
 * volviera a fijarse en 'dark' quedaría chrome de un tema sobre slides del
 * otro.
 */
export function IntroScreen({ onCreate, onLogin }: IntroScreenProps) {
  const { t } = useTranslation()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const mode = useThemeMode().resolvedMode
  const chrome = CHROME[mode]
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
  const rootStyle = useMemo(() => [styles.root, chrome.root], [chrome])

  return (
    <View style={rootStyle}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
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
        <SlideBrand width={width} mode={mode} active={index === 0} scrollX={scrollX} index={0} />
        <SlideNumber width={width} mode={mode} active={index === 1} scrollX={scrollX} index={1} />
        <SlideMovements width={width} mode={mode} active={index === 2} scrollX={scrollX} index={2} />
        <SlideGarden width={width} mode={mode} active={index === 3} scrollX={scrollX} index={3} />
        <SlideCta
          width={width}
          mode={mode}
          active={index === LAST}
          scrollX={scrollX}
          index={LAST}
          onCreate={onCreate}
          onLogin={onLogin}
        />
      </Animated.ScrollView>

      {!isLast ? (
        <View style={[styles.footer, { bottom: insets.bottom + 24 }]}>
          <View style={[styles.dots, chrome.rail]}>
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
                <Dot
                  i={i}
                  scrollX={scrollX}
                  width={width}
                  activeColor={chrome.dotActive}
                  inactiveColor={chrome.dotInactive}
                />
              </Pressable>
            ))}
          </View>
          {/* En la última slide ANTES del welcome el CTA es puntual ("Comenzar")
              en vez de "Seguir" — señala el final del showcase y la entrada al alta. */}
          <NextButton
            chrome={chrome}
            onPress={() => goTo(index + 1)}
            label={t(index === LAST - 1 ? 'onboarding:intro.cta.begin' : 'onboarding:intro.cta.next')}
          />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
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
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: neoRadii.pill,
  },
  dot: { height: 8, borderRadius: 4 },
  next: {
    height: 52,
    paddingHorizontal: 26,
    borderRadius: neoRadii.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextText: {
    // Mismo cuerpo que el label del CTA "Empezar" (auth-kit · ctaLabelWelcome).
    fontSize: 16.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
})
