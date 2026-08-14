import { useEffect, useRef, type FC, type ReactNode } from 'react'
import {
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, {
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
import { FernLogo } from '@/components/auth/fern-logo'
import { BrotMascot, BrotParticles, type BrotPose } from '@/components/brot'
import { BroteFireflies } from '@/components/garden/brote-fireflies'
import { DayBrot, poseForDay } from '@/components/garden/day-brot'
import { RiseView } from '@/components/home/animated/rise-view'
import { AUTH_SPEC, type AuthMode } from '@/components/redesign/auth/auth-spec'
import { FijosHero } from '@/components/redesign/fijos/fijos-screen'
import { GastosMovRow, type MovRowVM } from '@/components/redesign/gastos/gastos-screen'
import { HomeHero } from '@/components/redesign/home/home-screen'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { buildHeroContent } from '@/features/fijos/neo-fijos-view-model'
import { INCOME_KIND_BY_KEY } from '@/features/income/income-kinds'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import {
  decorativeDurations,
  motionDurations,
  motionEasings,
  motionSprings,
} from '@/lib/motion/tokens'
import { NeoWelcomeScreen } from '@/screens/auth/neo/neo-welcome-screen'
import { neoMaterial, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { formatMoney } from '@/utils/money'
import {
  INTRO_FIJOS_PROPS,
  INTRO_GASTO_PROPS,
  INTRO_HERO_METRICS,
  INTRO_INCOME_PROPS,
  INTRO_WEEK_CLOSE,
} from '@/features/onboarding-intro/illustrative-data'

export interface IntroSlideProps {
  width: number
  /** Tema resuelto de la app — el pager entero (incluido el slide 5) lo sigue. */
  mode: AuthMode
  /** True when this is the slide currently centered in the pager. */
  active: boolean
  /** Offset horizontal del pager (px) — para la transición ligada al scroll. */
  scrollX: SharedValue<number>
  /** Índice de esta slide en el pager (0..4). */
  index: number
}

/**
 * Tintas del intro por tema. Se arman UNA vez por modo al cargar el módulo
 * (los dos objetos son inmutables), así el render solo elige uno: nada se
 * recalcula por frame y las referencias de estilo quedan estables para los
 * `memo` de los kits.
 */
interface IntroInk {
  backdrop: ViewStyle
  aura: string
  particleColors: readonly string[]
  fernPalette: 'dark' | 'light'
  eyebrow: TextStyle
  title: TextStyle
  titleAccent: TextStyle
  subtitle: TextStyle
  panel: ViewStyle
  chip: ViewStyle
  chipText: TextStyle
  letterOn: TextStyle
  letterOff: TextStyle
}

function buildInk(mode: AuthMode): IntroInk {
  const s = AUTH_SPEC[mode]
  const neo = neoTokens(mode)
  // Acento para TEXTO CHICO (eyebrow 12px, letras de día 11px). En claro el
  // verde del spec da 4.29:1 sobre el fondo de bienvenida y 4.01:1 sobre el
  // stop oscuro del material raised — bajo el 4.5:1 que AA exige a ese
  // tamaño. `greenDeep` es el mismo verde un escalón más profundo y llega a
  // 6.90:1 en el peor par. En oscuro el menta ya da ≥8.98:1 y se conserva.
  const accentInk = mode === 'light' ? neo.greenDeep : s.linkAccent
  return {
    backdrop: { backgroundColor: s.welcomeBg },
    aura: s.linkAccent,
    particleColors: s.particleColors,
    fernPalette: s.fernPalette,
    eyebrow: { color: accentInk },
    title: { color: s.text },
    // Display 42px/900: texto grande, el acento de marca del spec pasa AA
    // (4.29:1 ≥ 3:1) y mantiene el contraste de color con el resto del título.
    titleAccent: { color: s.linkAccent },
    subtitle: { color: s.textSoft },
    panel: neoMaterial(mode, 'raisedLg'),
    // Pozo hundido. En Android sin soporte de inset el pozo se aplana en
    // silencio: un hairline lo mantiene delimitado.
    chip: {
      backgroundColor: neo.well,
      boxShadow: neo.shadows.insetSm,
      borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
      borderColor: neo.sheetDivider,
    },
    chipText: { color: neo.text },
    letterOn: { color: accentInk },
    // `textTertiary` da 1.97:1 sobre el stop oscuro del panel claro: la letra
    // del día sin registrar necesita el nivel de texto, no el de relleno.
    letterOff: { color: neo.textMuted },
  }
}

const INK: Record<AuthMode, IntroInk> = {
  light: buildInk('light'),
  dark: buildInk('dark'),
}

/** Relación ancho/alto del viewBox de Brot fuera de la pose `peek`. */
const BROT_ASPECT = 84 / 108

/**
 * Devuelve un key que es 0 hasta que la slide se activa por PRIMERA vez, y a
 * partir de ahí queda en 1 (LATCH). Como key del contenido → la animación de
 * entrada (RiseView stagger, count-up, brote) corre UNA sola vez al revelarse
 * y la slide queda montada: volver a ella (atrás o adelante) NO la reinicia.
 * Mientras es 0 (nunca vista) los RiseView saltan su entrada (estado final
 * off-screen, sin worklets desperdiciados).
 */
function usePlayOnActive(active: boolean): number {
  // Latch monotónico calculado EN RENDER (no en effect): una vez que la slide
  // se activó, queda en 1 para siempre. Mutar el ref durante el render es
  // idempotente y no dispara renders en cascada — cuando `active` pasa a true
  // el padre ya re-renderiza este slide (es un prop), así que el ref se lee
  // correcto en ese mismo render sin necesidad de un setState extra. Evita el
  // anti-patrón react-hooks/set-state-in-effect.
  const seenRef = useRef(active)
  if (active) seenRef.current = true
  return seenRef.current ? 1 : 0
}

/**
 * Transición entre slides LIGADA AL SCROLL: el contenido de la slide centrada
 * está a opacidad/escala plena; al deslizar, las adyacentes se desvanecen y
 * encogen levemente (crossfade + zoom). Va atada al gesto (no es una animación
 * discreta) → no "reinicia" nada al volver. Se aplica al CONTENIDO, no al
 * fondo, para que el fondo no parpadee entre slides.
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
 * Fondo del pager: el MISMO material de la Bienvenida (`welcomeBg` plano +
 * campo de partículas de la paleta del spec) para que el paso del slide 4 al
 * 5 —que monta la Bienvenida real— no tenga costura.
 *
 * `active` gatea el loop de Skia: las 5 slides quedan montadas a la vez y sin
 * el gate los 4 campos invisibles seguirían grabando a 60fps.
 */
function BrandBackdrop({ ink, active }: { ink: IntroInk; active: boolean }) {
  return (
    <View style={[StyleSheet.absoluteFill, ink.backdrop]} pointerEvents="none">
      <BrotParticles colors={ink.particleColors} count={18} animated={active} />
    </View>
  )
}

const FERN_GLOW = 300
/**
 * Aura verde detrás del helecho — un radial SVG que desvanece a transparente
 * (suave, SIN bordes ni "zonas" como tenían los discos de boxShadow) y respira
 * lento (seno). UI thread; reduce-motion lo aparca, igual que salir del slide.
 */
function FernAura({ color, play }: { color: string; play: boolean }) {
  const reduced = useReducedMotion()
  const on = play && !reduced
  const breath = useSharedValue(on ? 0 : 0.6)
  useEffect(() => {
    if (!on) {
      cancelAnimation(breath)
      breath.value = 0.6
      return
    }
    breath.value = withRepeat(
      withTiming(1, { duration: decorativeDurations.ambient, easing: motionEasings.warm }),
      -1,
      true,
    )
    return () => cancelAnimation(breath)
  }, [on, breath])
  const style = useAnimatedStyle(() => ({
    opacity: 0.55 + breath.value * 0.45,
    transform: [{ scale: 0.92 + breath.value * 0.16 }],
  }))
  return (
    <Animated.View pointerEvents="none" style={[styles.auraWrap, style]}>
      <Svg width={FERN_GLOW} height={FERN_GLOW}>
        <SvgDefs>
          <SvgRadial id="fernAura" cx="50%" cy="50%" r="50%">
            <SvgStop offset="0%" stopColor={color} stopOpacity="0.42" />
            <SvgStop offset="42%" stopColor={color} stopOpacity="0.16" />
            <SvgStop offset="100%" stopColor={color} stopOpacity="0" />
          </SvgRadial>
        </SvgDefs>
        <Rect width={FERN_GLOW} height={FERN_GLOW} fill="url(#fernAura)" />
      </Svg>
    </Animated.View>
  )
}

/**
 * Entrada "crece desde la base" — escala 0.5 → overshoot y asienta con spring
 * (el `obGrow` del handoff, pulido). Respeta reduce-motion.
 */
function GrowIn({
  play,
  delay = motionDurations.micro,
  children,
  style,
}: {
  play: boolean
  delay?: number
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
      delay,
      withSequence(
        withTiming(1.06, { duration: motionDurations.slow, easing: motionEasings.decelerate }),
        withSpring(1, motionSprings.celebrate),
      ),
    )
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: motionDurations.deliberate, easing: motionEasings.standard }),
    )
    return () => {
      cancelAnimation(scale)
      cancelAnimation(opacity)
    }
  }, [on, delay, scale, opacity])
  const aStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }))
  return <Animated.View style={[style, aStyle]}>{children}</Animated.View>
}

/**
 * Brot dentro del pager. Dos gates distintos:
 *   · `mounted` (latch de la slide) — hasta que la slide se ve por primera
 *     vez no se monta el canvas de Skia; queda un hueco del mismo tamaño para
 *     que el layout no salte al aparecer.
 *   · `animated` (slide centrada) — con las 5 slides montadas, los Brot de
 *     las que no se ven no deben grabar frames.
 */
function IntroBrot({
  pose,
  size,
  mounted,
  animated,
  delay,
  shadow = false,
  style,
}: {
  pose: BrotPose
  size: number
  mounted: boolean
  animated: boolean
  delay?: number
  shadow?: boolean
  style?: StyleProp<ViewStyle>
}) {
  if (!mounted) {
    return <View pointerEvents="none" style={[{ width: size * BROT_ASPECT, height: size }, style]} />
  }
  return (
    <GrowIn play delay={delay} style={style}>
      <BrotMascot pose={pose} size={size} animated={animated} shadow={shadow} />
    </GrowIn>
  )
}

// ── Slide 1 · Marca ────────────────────────────────────────────────────
export function SlideBrand({ width, mode, active, scrollX, index }: IntroSlideProps) {
  const { t } = useTranslation()
  const ink = INK[mode]
  const n = usePlayOnActive(active)
  const skip = n === 0
  const tStyle = useSlideTransition(scrollX, index, width)
  return (
    <View style={[styles.slide, { width }]}>
      <BrandBackdrop ink={ink} active={active} />
      {/* Composición CENTRADA: helecho + Brot + texto como un solo bloque,
          centrado verticalmente — sin el gap grande de fern-arriba /
          texto-pegado-abajo. */}
      <Animated.View key={n} style={[styles.brandStack, tStyle]}>
        <View style={styles.fernRow}>
          <View style={styles.fernBox}>
            <FernAura color={ink.aura} play={active} />
            <GrowIn play={!skip}>
              <FernLogo size={186} palette={ink.fernPalette} animate={false} />
            </GrowIn>
          </View>
          {/* Brot PROTAGONISTA del saludo: parado al pie del helecho, con su
              sombra apoyada. Entra después del helecho (el orden del handoff:
              primero crece la marca, después aparece quien te acompaña). */}
          <IntroBrot
            pose="wave"
            size={104}
            mounted={!skip}
            animated={active}
            delay={motionDurations.deliberate}
            shadow
            style={styles.brandBrot}
          />
        </View>
        <View style={styles.brandText}>
          <RiseView skipEntering={skip} delay={420}>
            <Text style={[styles.eyebrow, ink.eyebrow]}>
              {t('onboarding:intro.slide1.eyebrow')}
            </Text>
          </RiseView>
          <RiseView skipEntering={skip} delay={520}>
            <Text style={[styles.titleBrand, ink.title]}>
              {t('onboarding:intro.slide1.titleLead')}{' '}
              <Text style={[styles.titleAccent, ink.titleAccent]}>
                {t('onboarding:intro.slide1.titleAccent')}
              </Text>
            </Text>
          </RiseView>
          <RiseView skipEntering={skip} delay={660}>
            <Text style={[styles.subtitleLight, ink.subtitle]}>
              {t('onboarding:intro.slide1.subtitle')}
            </Text>
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
 * body). El BrandBackdrop va detrás, fijo.
 */
function FeatureSlide({
  width,
  ink,
  active,
  children,
}: {
  width: number
  ink: IntroInk
  active: boolean
  children: ReactNode
}) {
  return (
    <View style={[styles.featureSlide, { width }]}>
      <BrandBackdrop ink={ink} active={active} />
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

// ── Slide 2 · Un número claro (hero de la Home neo) ────────────────────
export function SlideNumber({ width, mode, active, scrollX, index }: IntroSlideProps) {
  const { t } = useTranslation()
  const ink = INK[mode]
  const n = usePlayOnActive(active)
  const skip = n === 0
  const tStyle = useSlideTransition(scrollX, index, width)
  return (
    <FeatureSlide width={width} ink={ink} active={active}>
      <Animated.View key={n} style={[styles.featureStack, tStyle]}>
        <View style={styles.cardWithBrot}>
          {/* Brot SUB-PROTAGONISTA: asoma detrás del borde superior de la
              card (va primero en el árbol y la card lleva zIndex → queda
              apoyado en ella en iOS y en Android por igual). `zen` es la
              lectura del slide: un número y nada de ruido. */}
          <IntroBrot
            pose="zen"
            size={62}
            mounted={!skip}
            animated={active}
            delay={motionDurations.standard}
            style={styles.brotOnCardRight}
          />
          <View style={styles.cardLayer}>
            {/* El hero de la Home con los mismos datos ilustrativos y las
                mismas claves de copy que el cableado real. Sin medidor de
                cupo ni chips: el dataset ilustrativo no tiene gasto promedio
                ni eventos de ciclo, y el kit oculta los bloques completos
                cuando faltan. */}
            <HomeHero
              mode={mode}
              balanceLabel={t('home:hero.balanceLabel')}
              balance={formatMoney(INTRO_HERO_METRICS.availableToday)}
              balanceValue={INTRO_HERO_METRICS.availableToday}
              formatBalance={formatMoney}
              usdLine={null}
              dayPill={t('home:hero.cycleDay', {
                day: INTRO_HERO_METRICS.cycleDay,
                total: INTRO_HERO_METRICS.cycleTotalDays,
              })}
              eventChip={null}
              fixedChip={null}
              gauge={null}
            />
          </View>
        </View>
        <View style={styles.brandText}>
          <RiseView skipEntering={skip} delay={420}>
            <Text style={[styles.titleFeature, ink.title]}>
              {t('onboarding:intro.slide2.title')}
            </Text>
          </RiseView>
          <RiseView skipEntering={skip} delay={520}>
            <Text style={[styles.subtitleLight, ink.subtitle]}>
              {t('onboarding:intro.slide2.subtitle')}
            </Text>
          </RiseView>
        </View>
      </Animated.View>
    </FeatureSlide>
  )
}

/**
 * Ciclo del dataset ilustrativo (10 jun → 10 jul). De las dos fechas el hero
 * de Fijos sólo lee el NOMBRE DEL MES del último día (eyebrow).
 */
const INTRO_CYCLE_LAST_DAY = new Date(2026, 6, 9)
const INTRO_CYCLE_START = new Date(2026, 5, 10)
const INTRO_FIJOS_ACTIVE_COUNT =
  INTRO_FIJOS_PROPS.cantidadPagados +
  INTRO_FIJOS_PROPS.cantidadPendientes +
  INTRO_FIJOS_PROPS.cantidadVencidos

// ── Slide 3 · Fijos, ingresos y el día a día ───────────────────────────
export function SlideMovements({ width, mode, active, scrollX, index }: IntroSlideProps) {
  const { t } = useTranslation()
  const ink = INK[mode]
  const n = usePlayOnActive(active)
  const skip = n === 0
  const tStyle = useSlideTransition(scrollX, index, width)

  // Mismo builder que la vista viva: la copy del hero sale de las claves
  // reales de Fijos, alimentado con los montos ilustrativos.
  const fijosContent = buildHeroContent({
    variant: 'E2',
    isEmptyNoFijos: false,
    cycleLastDay: INTRO_CYCLE_LAST_DAY,
    cycleStart: INTRO_CYCLE_START,
    daysIntoCycle: INTRO_FIJOS_PROPS.cycleDayIndex,
    salaryPaymentDay: 1,
    paidCount: INTRO_FIJOS_PROPS.cantidadPagados,
    pendingCount: INTRO_FIJOS_PROPS.cantidadPendientes,
    overdueCount: INTRO_FIJOS_PROPS.cantidadVencidos,
    cycleActiveCount: INTRO_FIJOS_ACTIVE_COUNT,
    paidAmount: INTRO_FIJOS_PROPS.montoPagado,
    pendingAmount: INTRO_FIJOS_PROPS.totalFijos - INTRO_FIJOS_PROPS.montoPagado,
    overdueAmount: 0,
    total: INTRO_FIJOS_PROPS.totalFijos,
    paidPct: Math.round(
      (INTRO_FIJOS_PROPS.montoPagado / Math.max(1, INTRO_FIJOS_PROPS.totalFijos)) * 100,
    ),
    hasIncome: true,
    monthlyIncome: INTRO_HERO_METRICS.monthlyIncome,
    availableRaw: INTRO_FIJOS_PROPS.dineroLibre,
    pctOfIncome: INTRO_FIJOS_PROPS.porcentajeSueldo,
    segmentToday: false,
  })

  const gastoRow: MovRowVM = {
    kind: 'expense',
    emoji: '🧾',
    tile: 'mint',
    title: INTRO_GASTO_PROPS.title ?? '',
    sub: `${INTRO_GASTO_PROPS.whoName ?? ''} · ${INTRO_GASTO_PROPS.categoryName ?? ''}`,
    amount: `−${formatMoney(Math.abs(INTRO_GASTO_PROPS.amount ?? 0))}`,
    catName: INTRO_GASTO_PROPS.categoryRawName,
  }
  const incomeMeta = INCOME_KIND_BY_KEY[INTRO_INCOME_PROPS.kind]
  const incomeRow: MovRowVM = {
    kind: 'income',
    emoji: incomeMeta.emoji,
    tile: 'mint',
    title: INTRO_INCOME_PROPS.title ?? '',
    sub: `${t(incomeMeta.labelKey)} · ${INTRO_INCOME_PROPS.time ?? ''}`,
    amount: `+${formatMoney(INTRO_INCOME_PROPS.amount ?? 0)}`,
  }

  return (
    <FeatureSlide width={width} ink={ink} active={active}>
      <Animated.View key={n} style={[styles.featureStack, tStyle]}>
        {/* Los 3 tipos de movimiento con las piezas vivas: el hero de Fijos
            (pozo + peso sobre el sueldo) y las filas del feed de Gastos, un
            gasto del día y un ingreso a favor. */}
        <RiseView skipEntering={skip}>
          <View style={styles.cardWithBrot}>
            {/* Brot SUB-PROTAGONISTA, del lado opuesto al del slide 2 para
                que las dos vitrinas informativas no se lean calcadas.
                `coach` = está explicando la card sobre la que se apoya. */}
            <IntroBrot
              pose="coach"
              size={62}
              mounted={!skip}
              animated={active}
              delay={motionDurations.standard}
              style={styles.brotOnCardLeft}
            />
            <View style={styles.cardLayer}>
              <FijosHero
                {...fijosContent}
                mode={mode}
                variant="E2"
                animated={false}
                paused={!active}
              />
            </View>
          </View>
        </RiseView>
        <RiseView skipEntering={skip} delay={140}>
          <GastosMovRow mode={mode} row={gastoRow} />
        </RiseView>
        <RiseView skipEntering={skip} delay={220}>
          <GastosMovRow mode={mode} row={incomeRow} />
        </RiseView>
        <View style={styles.brandText}>
          <RiseView skipEntering={skip} delay={340}>
            <Text style={[styles.titleFeature, ink.title]}>
              {t('onboarding:intro.slide3.title')}
            </Text>
          </RiseView>
          <RiseView skipEntering={skip} delay={440}>
            <Text style={[styles.subtitleLight, ink.subtitle]}>
              {t('onboarding:intro.slide3.subtitle')}
            </Text>
          </RiseView>
        </View>
      </Animated.View>
    </FeatureSlide>
  )
}

/**
 * Preview acotado de la celebración "Cierre de semana" (la real): el Brot que
 * festeja + los 7 mini-Brots que entran escalonados, con luciérnagas
 * (BroteFireflies) ORBITANDO cada uno y un campo ambiente de partículas — los
 * MISMOS componentes que monta week-close-celebration.tsx, acá en un panel
 * acotado (sin el scrim full-screen, sin háptica ni botón). El eyebrow y el
 * conteo usan el copy localizado de la celebración real (es+en).
 */
function WeekCloseCelebrationPreview({
  ink,
  play,
  active,
}: {
  ink: IntroInk
  play: boolean
  active: boolean
}) {
  const { t } = useTranslation()
  const wc = INTRO_WEEK_CLOSE
  return (
    <View style={[styles.weekClosePanel, ink.panel]}>
      {/* Campo de partículas ambiente, acotado al panel (clip por radio). */}
      <BrotParticles
        colors={ink.particleColors}
        count={9}
        borderRadius={neoRadii.card}
        animated={active}
      />
      <Text style={[styles.eyebrow, ink.eyebrow]}>{t('garden:weekCloseCelebration.eyebrow')}</Text>
      <View style={[styles.wcChip, ink.chip]}>
        <Text style={[styles.wcChipCount, ink.chipText]}>
          {t('garden:weekCloseCelebration.count', { score: wc.score })}
        </Text>
      </View>
      {/* Brot PROTAGONISTA del hito, como en la celebración real (que lo pone
          a 150 entre el chip y la fila de días); acá a escala de panel. */}
      <IntroBrot
        pose="cheer"
        size={78}
        mounted={play}
        animated={active}
        delay={motionDurations.quick}
        style={styles.wcHeroBrot}
      />
      <View style={styles.wcBrotesRow}>
        {wc.days.map((day, i) => (
          <View key={i} style={styles.wcBroteCol}>
            <View style={styles.wcBroteSlot}>
              {play ? (
                <>
                  <DayBrot pose={poseForDay(day.registered, day.recovered)} delay={i * 70} />
                  {/* Luciérnagas que orbitan este brote (entran escalonadas
                      con el growIn). Sólo mientras la slide está centrada: son
                      7 órbitas × 4 partículas en loop infinito y el pager deja
                      las 5 slides montadas. Al volver re-entran con su fade —
                      los brotes, que sí son estructura, no se remontan. */}
                  {day.registered && active && <BroteFireflies delay={i * 70 + 240} />}
                </>
              ) : null}
            </View>
            <Text
              style={[styles.wcBroteLetter, day.registered ? ink.letterOn : ink.letterOff]}
            >
              {day.letter}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// ── Slide 4 · Tu jardín (cierre de semana real: Brot + 7 brotes) ────────
export function SlideGarden({ width, mode, active, scrollX, index }: IntroSlideProps) {
  const { t } = useTranslation()
  const ink = INK[mode]
  const n = usePlayOnActive(active)
  const skip = n === 0
  const tStyle = useSlideTransition(scrollX, index, width)
  return (
    <FeatureSlide width={width} ink={ink} active={active}>
      <Animated.View key={n} style={[styles.featureStack, tStyle]}>
        <RiseView skipEntering={skip}>
          <WeekCloseCelebrationPreview ink={ink} play={!skip} active={active} />
        </RiseView>
        <RiseView skipEntering={skip} delay={360}>
          <Text style={[styles.titleFeature, ink.title]}>
            {t('onboarding:intro.slide4.title')}
          </Text>
        </RiseView>
        <RiseView skipEntering={skip} delay={440}>
          <Text style={[styles.subtitleLight, ink.subtitle]}>
            {t('onboarding:intro.slide4.subtitle')}
          </Text>
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

export function SlideCta({ width, mode, active, scrollX, index, onCreate, onLogin }: SlideCtaProps) {
  const n = usePlayOnActive(active)
  const tStyle = useSlideTransition(scrollX, index, width)
  return (
    <View style={[styles.featureSlide, { width }]}>
      {/* Slide 5 = la Bienvenida REAL del rediseño (NeoWelcomeScreen →
          réplica 3a neumórfica) → correlatividad total con la pantalla
          que ve el usuario al llegar a la bienvenida live. Mismos CTA
          "Empezar"/"Ya tengo cuenta" y fineprint de Términos/Privacidad.
          El key={n} la monta/anima la PRIMERA vez que se llega (latch, no
          se reinicia al volver); tStyle le da el crossfade+zoom ligado al
          scroll en la entrada.

          `forceMode` recibe el MISMO modo que el resto del pager: la
          bienvenida y las 4 vitrinas anteriores tienen que compartir fondo
          y status bar (la 3a pide la suya con `mode === 'dark' ? 'light' :
          'dark'`, igual que el pager).

          SIN Brot encima: la 3a se aprobó sin mascota (decisión del owner
          2026-07-17) y este slide es esa misma pantalla — meterle uno acá
          rompería la continuidad con la bienvenida live que sigue. */}
      <Animated.View key={n} style={[styles.welcomeHost, tStyle]}>
        <NeoWelcomeScreen forceMode={mode} onCreate={onCreate} onLogin={onLogin} />
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
  // que despeja el chrome (footer abajo) vive en el contentContainer del
  // ScrollView (featureScroll) para que la card pueda scrollear si no entra.
  featureSlide: { flex: 1 },
  welcomeHost: { flex: 1 },
  featureScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20, // = ancho de card de la Home
    paddingTop: 72,
    paddingBottom: 108,
  },
  brandStack: { gap: 30, alignItems: 'stretch' },
  brandText: { gap: 14, alignItems: 'flex-start' },
  // Helecho + Brot al pie: se centran como bloque. `flex-end` alinea los dos
  // sobre la misma línea de piso.
  fernRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  // La caja del helecho no crece: en 320pt el bloque (186 + 81 − 22) entra sin
  // empujar a Brot fuera del padding de 28.
  fernBox: { alignItems: 'center', justifyContent: 'center' },
  brandBrot: { marginLeft: -22, marginBottom: 6 },
  auraWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  featureStack: { gap: 18 },
  // Brot apoyado en la card: la card va en su propia capa con zIndex por
  // encima, así el Brot asoma sólo por arriba del borde en las dos plataformas.
  cardWithBrot: { position: 'relative' },
  cardLayer: { zIndex: 1 },
  brotOnCardRight: { position: 'absolute', top: -46, right: 18, zIndex: 0 },
  brotOnCardLeft: { position: 'absolute', top: -46, left: 18, zIndex: 0 },
  // Panel del cierre de semana: card raised del vocabulario neo. `overflow`
  // acota las partículas ambiente al panel.
  weekClosePanel: {
    alignSelf: 'stretch',
    borderRadius: neoRadii.card,
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  wcChip: {
    borderRadius: neoRadii.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 8,
  },
  wcChipCount: {
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  wcHeroBrot: { marginTop: 10 },
  wcBrotesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: 14,
  },
  wcBroteCol: { alignItems: 'center', gap: 8, flex: 1 },
  wcBroteSlot: {
    // Mismo alto que la fila de la celebración real: mini-Brot (34) + aire.
    height: 40,
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  wcBroteLetter: { fontSize: 11, fontWeight: '800', fontFamily: nunitoFamily('800') },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 2.6,
    textTransform: 'uppercase',
  },
  // Slide 1 · Marca: título grande (handoff 42/900/-.03em/lh1.04).
  titleBrand: {
    fontSize: 42,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -1.3,
    lineHeight: 44,
  },
  titleAccent: {
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  subtitleLight: {
    fontSize: 15.5,
    fontWeight: '500',
    fontFamily: nunitoFamily('500'),
    lineHeight: 23,
    maxWidth: 320,
  },
  // Título de slides feature (2 · Número, 3 · Movimientos, 4 · Jardín) — mismo
  // lenguaje que el slide 1 pero más chico (hay una card arriba).
  // Handoff ≈ 29-31px.
  titleFeature: {
    fontSize: 31,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.8,
    lineHeight: 36,
  },
})
