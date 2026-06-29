import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { FijosHeroCard } from '@/components/fijos/fijos-hero-card'
import { FernLogo } from '@/components/auth/fern-logo'
import { CardParticles } from '@/components/ui/card-particles'
import { Sprout } from '@/components/garden/sprout'
import { BroteFireflies } from '@/components/garden/brote-fireflies'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { GastoRow } from '@/components/gastos/gasto-row'
import { IncomeRow } from '@/components/gastos/income-row'
import { HomeHeroCard } from '@/components/home/home-hero-card'
import { computeSavingsHeroChip } from '@/components/home/home-hero-savings-helpers'
import { WelcomeScreen } from '@/screens/auth/welcome-screen'
import { RiseView } from '@/components/home/animated/rise-view'
import {
  INTRO_FIJOS_PROPS,
  INTRO_GASTO_PROPS,
  INTRO_HERO_METRICS,
  INTRO_INCOME_PROPS,
  INTRO_WEEK_CLOSE,
} from '@/features/onboarding-intro/illustrative-data'

export interface IntroSlideProps {
  width: number
  /** True when this is the slide currently centered in the pager. */
  active: boolean
  /** Offset horizontal del pager (px) — para la transición ligada al scroll. */
  scrollX: SharedValue<number>
  /** Índice de esta slide en el pager (0..4). */
  index: number
}

const CREAM = '#FDFEF9'
const CREAM_DIM = '#AEC7A6'

/**
 * Devuelve un key que es 0 hasta que la slide se activa por PRIMERA vez, y a
 * partir de ahí queda en 1 (LATCH). Como key del contenido → la animación de
 * entrada (RiseView stagger, count-up, brote) corre UNA sola vez al revelarse
 * y la slide queda montada: volver a ella (atrás o adelante) NO la reinicia.
 * Mientras es 0 (nunca vista) los RiseView saltan su entrada (estado final
 * off-screen, sin worklets desperdiciados).
 */
function usePlayOnActive(active: boolean): number {
  const [seen, setSeen] = useState(active)
  useEffect(() => {
    if (active) setSeen(true)
  }, [active])
  return seen ? 1 : 0
}

/**
 * Transición entre slides LIGADA AL SCROLL: el contenido de la slide centrada
 * está a opacidad/escala plena; al deslizar, las adyacentes se desvanecen y
 * encogen levemente (crossfade + zoom). Va atada al gesto (no es una animación
 * discreta) → no "reinicia" nada al volver. Se aplica al CONTENIDO, no al
 * fondo, para que el verde no parpadee entre slides.
 */
function useSlideTransition(scrollX: SharedValue<number>, index: number, width: number) {
  return useAnimatedStyle(() => {
    const page = width > 0 ? scrollX.value / width : 0
    const dist = Math.abs(page - index)
    return {
      opacity: interpolate(dist, [0, 1], [1, 0.2], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(dist, [0, 1], [1, 0.9], Extrapolation.CLAMP) }],
    }
  })
}

// react-native-svg's gradient primitives rechazan `children` en sus tipos
// (pitfall conocido) → cast a FCs que aceptan children.
const SvgDefs = Defs as unknown as FC<{ children?: ReactNode }>
const SvgRadial = RadialGradient as unknown as FC<{
  id: string
  cx: string
  cy: string
  r: string
  children?: ReactNode
}>
const SvgStop = Stop as unknown as FC<{
  offset: string
  stopColor: string
  stopOpacity?: string
}>

/**
 * Fondo de marca EXACTO al handoff: radial `#1C4A2C` (centro-arriba, 50% 8%) →
 * `#0E2A19`, + luciérnagas (14, mitad frías `#B2E08A`, mitad cálidas `#F0B488`).
 * Compartido por los slides oscuros (1 · Marca, 4 · Jardín, 5 · CTA).
 */
function BrandBackdrop() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.brandBase]} pointerEvents="none">
      <Svg style={[styles.brandSvg]} width="100%" height="100%">
        <SvgDefs>
          <SvgRadial id="introBrandBg" cx="50%" cy="8%" r="92%">
            <SvgStop offset="0%" stopColor="#1C4A2C" />
            <SvgStop offset="70%" stopColor="#0E2A19" />
            <SvgStop offset="100%" stopColor="#0E2A19" />
          </SvgRadial>
        </SvgDefs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#introBrandBg)" />
      </Svg>
      <CardParticles count={28} color="#B2E08A" peachColor="#F0B488" />
    </View>
  )
}

const FERN_GLOW = 300
/**
 * Aura verde detrás del helecho — un radial SVG que desvanece a transparente
 * (suave, SIN bordes ni "zonas" como tenían los discos de boxShadow) y respira
 * lento (~6s, seno) vía un wrapper Animated. UI thread; reduce-motion lo aparca.
 */
function FernAura() {
  const reduced = useReducedMotion()
  const breath = useSharedValue(reduced ? 0.6 : 0)
  useEffect(() => {
    if (reduced) {
      breath.value = 0.6
      return
    }
    breath.value = withRepeat(
      withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    )
    return () => cancelAnimation(breath)
  }, [reduced, breath])
  const style = useAnimatedStyle(() => ({
    opacity: 0.55 + breath.value * 0.45,
    transform: [{ scale: 0.92 + breath.value * 0.16 }],
  }))
  return (
    <Animated.View pointerEvents="none" style={[styles.auraWrap, style]}>
      <Svg width={FERN_GLOW} height={FERN_GLOW}>
        <SvgDefs>
          <SvgRadial id="fernAura" cx="50%" cy="50%" r="50%">
            <SvgStop offset="0%" stopColor="#9FE08A" stopOpacity="0.42" />
            <SvgStop offset="42%" stopColor="#9FE08A" stopOpacity="0.16" />
            <SvgStop offset="100%" stopColor="#9FE08A" stopOpacity="0" />
          </SvgRadial>
        </SvgDefs>
        <Rect width={FERN_GLOW} height={FERN_GLOW} fill="url(#fernAura)" />
      </Svg>
    </Animated.View>
  )
}

/**
 * Entrada del helecho: "crece desde la base" — escala 0.5 → overshoot 1.06 y
 * asienta con spring (el `obGrow` del handoff, pulido). El arte va estático
 * (FernLogo animate=false) para que el grow lea limpio. Respeta reduce-motion.
 */
function GrowIn({
  play,
  children,
  style,
}: {
  play: boolean
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const reduced = useReducedMotion()
  const on = play && !reduced
  const scale = useSharedValue(on ? 0.5 : 1)
  const opacity = useSharedValue(on ? 0 : 1)
  useEffect(() => {
    if (!on) {
      scale.value = 1
      opacity.value = 1
      return
    }
    scale.value = 0.5
    opacity.value = 0
    scale.value = withDelay(
      80,
      withSequence(
        withTiming(1.06, { duration: 520, easing: Easing.out(Easing.cubic) }),
        withSpring(1, { damping: 11, stiffness: 150, mass: 0.9 }),
      ),
    )
    opacity.value = withDelay(80, withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) }))
    return () => {
      cancelAnimation(scale)
      cancelAnimation(opacity)
    }
  }, [on, scale, opacity])
  const aStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }))
  return <Animated.View style={[style, aStyle]}>{children}</Animated.View>
}

// ── Slide 1 · Marca ────────────────────────────────────────────────────
export function SlideBrand({ width, active, scrollX, index }: IntroSlideProps) {
  const { t } = useTranslation()
  const n = usePlayOnActive(active)
  const skip = n === 0
  const tStyle = useSlideTransition(scrollX, index, width)
  return (
    <View style={[styles.slide, { width }]}>
      <BrandBackdrop />
      {/* Composición CENTRADA: helecho + texto como un solo bloque, centrado
          verticalmente — sin el gap grande de fern-arriba / texto-pegado-abajo. */}
      <Animated.View key={n} style={[styles.brandStack, tStyle]}>
        <View style={styles.fernBox}>
          <FernAura />
          <GrowIn play={!skip}>
            <FernLogo size={210} palette="light" animate={false} />
          </GrowIn>
        </View>
        <View style={styles.brandText}>
          <RiseView skipEntering={skip} delay={420}>
            <Text style={styles.eyebrow}>{t('onboarding:intro.slide1.eyebrow')}</Text>
          </RiseView>
          <RiseView skipEntering={skip} delay={520}>
            <Text style={styles.titleBrand}>
              {t('onboarding:intro.slide1.titleLead')}{' '}
              <Text style={styles.titleAccent}>{t('onboarding:intro.slide1.titleAccent')}</Text>
            </Text>
          </RiseView>
          <RiseView skipEntering={skip} delay={660}>
            <Text style={styles.subtitleLight}>{t('onboarding:intro.slide1.subtitle')}</Text>
          </RiseView>
        </View>
      </Animated.View>
    </View>
  )
}

/**
 * Contenedor de las slides feature (card real + texto). Scroll vertical: el
 * contenido se CENTRA cuando entra y SCROLLEA si es más alto que la pantalla,
 * así la card real NUNCA queda recortada por el chrome ni por la altura del
 * device. `paddingHorizontal: 20` = mismo ancho de card que la Home (Screen
 * body). El BrandBackdrop (radial + partículas) va detrás, fijo.
 */
function FeatureSlide({ width, children }: { width: number; children: ReactNode }) {
  return (
    <View style={[styles.featureSlide, { width }]}>
      <BrandBackdrop />
      <ScrollView
        style={StyleSheet.absoluteFill}
        contentContainerStyle={styles.featureScroll}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {children}
      </ScrollView>
    </View>
  )
}

const noop = () => {}

// ── Slide 2 · Un número claro (HomeHeroCard real) ──────────────────────
export function SlideNumber({ width, active, scrollX, index }: IntroSlideProps) {
  const { t } = useTranslation()
  const n = usePlayOnActive(active)
  const skip = n === 0
  const tStyle = useSlideTransition(scrollX, index, width)
  // Mismo chip que muestra la Home cuando hay meta de ahorro configurada
  // (computeSavingsHeroChip arma el label/a11y reales). Datos ilustrativos.
  const savingsChip = useMemo(
    () =>
      computeSavingsHeroChip({
        savingsGoal: 150_000,
        savingsRemaining: 120_000,
        savingsGoalPercent: 12,
        incomeConfigured: true,
      }),
    [],
  )
  return (
    <FeatureSlide width={width}>
      <Animated.View key={n} style={[styles.featureStack, tStyle]}>
        {/* Montada EXACTAMENTE como en home-dashboard (mismas props: trend,
            savingsChip, usdConversion, onPressConfigureIncome) → se ve la card
            COMPLETA, idéntica a la Home, no una versión recortada. */}
        <HomeHeroCard
          data={INTRO_HERO_METRICS}
          projectedCloseTrend={-0.08}
          savingsChip={savingsChip}
          usdConversion={null}
          onPressConfigureIncome={noop}
        />
        <View style={styles.brandText}>
          <RiseView skipEntering={skip} delay={420}>
            <Text style={styles.titleFeature}>{t('onboarding:intro.slide2.title')}</Text>
          </RiseView>
          <RiseView skipEntering={skip} delay={520}>
            <Text style={styles.subtitleLight}>{t('onboarding:intro.slide2.subtitle')}</Text>
          </RiseView>
        </View>
      </Animated.View>
    </FeatureSlide>
  )
}

// ── Slide 3 · Fijos, ingresos y el día a día (FijosHeroCard + IncomeRow) ─
export function SlideMovements({ width, active, scrollX, index }: IntroSlideProps) {
  const { t } = useTranslation()
  const n = usePlayOnActive(active)
  const skip = n === 0
  const tStyle = useSlideTransition(scrollX, index, width)
  return (
    <FeatureSlide width={width}>
      <Animated.View key={n} style={[styles.featureStack, tStyle]}>
        {/* Los 3 tipos de movimiento con sus componentes REALES: el hero de
            Fijos (overview + % del sueldo), una fila de gasto del día y una de
            ingreso. Las filas (GastoRow/IncomeRow) traen esquinas redondeadas
            solo a la izquierda (esperan el SwipeRow del listado) → las
            envolvemos en un rowCard (overflow hidden) para que queden como
            tarjeta completa, igual que se ven en la sección real. */}
        <RiseView skipEntering={skip}>
          <FijosHeroCard {...INTRO_FIJOS_PROPS} />
        </RiseView>
        <RiseView skipEntering={skip} delay={140} style={styles.rowFrame}>
          <View style={styles.rowClip}>
            <GastoRow {...INTRO_GASTO_PROPS} />
          </View>
        </RiseView>
        <RiseView skipEntering={skip} delay={220} style={styles.rowFrame}>
          <View style={styles.rowClip}>
            <IncomeRow {...INTRO_INCOME_PROPS} />
          </View>
        </RiseView>
        <View style={styles.brandText}>
          <RiseView skipEntering={skip} delay={340}>
            <Text style={styles.titleFeature}>{t('onboarding:intro.slide3.title')}</Text>
          </RiseView>
          <RiseView skipEntering={skip} delay={440}>
            <Text style={styles.subtitleLight}>{t('onboarding:intro.slide3.subtitle')}</Text>
          </RiseView>
        </View>
      </Animated.View>
    </FeatureSlide>
  )
}

/**
 * Preview acotado de la celebración "Cierre de semana" (la real): los 7 brotes
 * (Sprout en estado fern) que CRECEN escalonados, con luciérnagas (BroteFireflies)
 * ORBITANDO cada uno + un campo ambiente de luciérnagas (CardParticles) — los
 * MISMOS componentes que monta week-close-celebration.tsx, acá en un panel
 * acotado (sin el scrim full-screen, sin háptica ni botón). Eso ES la floración:
 * 7 helechos rodeados de luciérnagas. El eyebrow y el conteo usan el copy
 * localizado de la celebración real (es+en).
 */
function WeekCloseCelebrationPreview({ play }: { play: boolean }) {
  const { t } = useTranslation()
  const wc = INTRO_WEEK_CLOSE
  return (
    <View style={styles.weekClosePanel}>
      {/* Campo de luciérnagas ambiente, acotado al panel (overflow hidden). */}
      <CardParticles count={9} color="#FFFBF2" accentColor="#F0B488" />
      <Text style={styles.eyebrow}>{t('garden:weekCloseCelebration.eyebrow')}</Text>
      <View style={styles.wcChip}>
        <Text style={styles.wcChipCount}>
          {t('garden:weekCloseCelebration.count', { score: wc.score })}
        </Text>
      </View>
      <View style={styles.wcBrotesRow}>
        {wc.days.map((day, i) => (
          <View key={i} style={styles.wcBroteCol}>
            <View style={styles.wcBroteSlot}>
              <Sprout
                stage={day.registered ? 'fern' : 'missed'}
                fernSize={40}
                tone="dark"
                animateIn={play}
                animateInDelay={i * 70}
              />
              {/* Luciérnagas que orbitan este brote (entran escalonadas con el growIn). */}
              {day.registered && <BroteFireflies delay={i * 70 + 240} />}
            </View>
            <Text
              style={[styles.wcBroteLetter, { color: day.registered ? '#9FE08A' : '#8CA285' }]}
            >
              {day.letter}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// ── Slide 4 · Tu jardín (cierre de semana real: 7 brotes + luciérnagas) ──
// Fondo oscuro de marca (handoff + slides 1/5): el panel translúcido del cierre
// despega los brotes del verde en ambos temas.
export function SlideGarden({ width, active, scrollX, index }: IntroSlideProps) {
  const { t } = useTranslation()
  const n = usePlayOnActive(active)
  const skip = n === 0
  const tStyle = useSlideTransition(scrollX, index, width)
  return (
    <FeatureSlide width={width}>
      <Animated.View key={n} style={[styles.featureStack, tStyle]}>
        <RiseView skipEntering={skip}>
          <WeekCloseCelebrationPreview play={!skip} />
        </RiseView>
        <RiseView skipEntering={skip} delay={360}>
          <Text style={styles.titleFeature}>{t('onboarding:intro.slide4.title')}</Text>
        </RiseView>
        <RiseView skipEntering={skip} delay={440}>
          <Text style={styles.subtitleLight}>{t('onboarding:intro.slide4.subtitle')}</Text>
        </RiseView>
      </Animated.View>
    </FeatureSlide>
  )
}

// ── Slide 5 · CTA ──────────────────────────────────────────────────────
interface SlideCtaProps extends IntroSlideProps {
  onCreate: () => void
  onLogin: () => void
}

export function SlideCta({ width, active, scrollX, index, onCreate, onLogin }: SlideCtaProps) {
  const n = usePlayOnActive(active)
  const tStyle = useSlideTransition(scrollX, index, width)
  return (
    <View style={[styles.featureSlide, { width }]}>
      {/* Slide 5 = la WelcomeScreen REAL → correlatividad total con la pantalla
          que ve el usuario al crear cuenta (mismos CTA "Empezar"/"Ya tengo
          cuenta", fineprint de Términos/Privacidad, fondo, aurora). El key={n}
          la monta/anima la PRIMERA vez que se llega (latch, no se reinicia al
          volver); tStyle le da el crossfade+zoom ligado al scroll en la entrada. */}
      <Animated.View key={n} style={[styles.welcomeHost, tStyle]}>
        <WelcomeScreen onCreate={onCreate} onLogin={onLogin} />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
  },
  // Slides feature: el contenedor ocupa toda la pantalla; el centrado + padding
  // que despeja el chrome (Saltar arriba, footer abajo) vive en el contentContainer
  // del ScrollView (featureScroll) para que la card pueda scrollear si no entra.
  featureSlide: { flex: 1 },
  welcomeHost: { flex: 1 },
  featureScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20, // = ancho de card de la Home
    paddingTop: 72,
    paddingBottom: 108,
  },
  slideBrand: {
    justifyContent: 'flex-end',
    paddingBottom: 140,
  },
  brandBase: { backgroundColor: '#0E2A19' },
  brandSvg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  brandStack: { gap: 30, alignItems: 'stretch' },
  brandText: { gap: 14, alignItems: 'flex-start' },
  // Helecho: caja que se autocentra en el bloque; la aura (auraWrap) la llena
  // y centra el radial SVG sobre el helecho.
  fernBox: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  auraWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  featureStack: { gap: 18 },
  // Panel del cierre de semana: translúcido (despega los brotes del verde en
  // ambos temas) + overflow hidden para acotar las luciérnagas ambiente al panel.
  weekClosePanel: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  wcChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 8,
  },
  wcChipCount: { fontSize: 12.5, fontWeight: '700', color: '#C4D6BC' },
  wcBrotesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: 18,
  },
  wcBroteCol: { alignItems: 'center', gap: 8, flex: 1 },
  wcBroteSlot: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  wcBroteLetter: { fontSize: 11, fontWeight: '700' },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.6,
    textTransform: 'uppercase',
    color: '#9FCB93',
  },
  // Slide 1 · Marca: título grande (handoff 42/900/-.03em/lh1.04, blanco puro).
  titleBrand: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1.3,
    lineHeight: 44,
    color: '#FFFFFF',
  },
  titleAccent: {
    color: '#9FE08A',
    fontStyle: 'italic',
    fontWeight: '800',
  },
  subtitleLight: {
    fontSize: 15.5,
    fontWeight: '500',
    lineHeight: 23,
    color: CREAM_DIM,
    maxWidth: 320,
  },
  // Título de slides feature (2 · Número, 3 · Movimientos, 4 · Jardín) — claro
  // sobre fondo de marca, mismo lenguaje que el slide 1 pero más chico (hay una
  // card arriba). Handoff ≈ 29-31px.
  titleFeature: {
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 36,
    color: CREAM,
  },
  // GastoRow/IncomeRow vienen con esquinas redondeadas SOLO a la izquierda
  // (esperan el SwipeRow del listado). Las clippeamos en una tarjeta completa
  // (overflow hidden redondea las 4 esquinas) → se ven como en la sección real.
  // Las filas (GastoRow/IncomeRow) en DARK son surfaceMuted (#0F2E1F) ≈ el fondo
  // verde (#0E2A19) → casi invisibles (1.05:1). Mismo recurso que el StreakWeekWidget:
  // un panel translúcido (frame de 5px + borde) las despega del fondo en dark; en
  // light la card cream ya resalta y el frame queda sutil. rowClip redondea las 4
  // esquinas (las filas vienen redondeadas solo a la izquierda).
  rowFrame: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    padding: 5,
  },
  rowClip: { borderRadius: 16, overflow: 'hidden' },
})
