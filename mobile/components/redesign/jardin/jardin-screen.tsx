// @i18n-ignore-file — kit de rediseño bajo gate; copy literal (tuteo neutro por [OWNER-1]), i18n en el pase posterior
import { memo, useCallback, useReducer, useState } from 'react'
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Path } from 'react-native-svg'
import { BrotMascot, type BrotPose } from '@/components/brot/brot-mascot'
import { BrotParticles } from '@/components/brot/brot-particles'
import { CATEGORY_ICONS } from '@/components/category/category-icon-registry'
import { RiseView } from '@/components/home/animated/rise-view'
import { HomeStatusBar } from '@/components/redesign/home/home-screen'
import {
  JARDIN_GEOMETRY,
  JARDIN_SPEC,
  type JardinSpec,
} from '@/components/redesign/jardin/jardin-spec'
import { GrowthRing } from '@/components/redesign/jardin/parts/growth-ring'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import type { MedalVM } from '@/features/achievements/achievement-progress'
import {
  ADELANTO_MAX,
  brotSizeForHours,
  deriveAdelanto,
  etapaPorHoras,
  horasDeCrecimiento,
  type DayRingState,
  type EtapaCrecimiento,
  type HeroState,
  type RingTone,
} from '@/features/garden/crecimiento-model'
import { useLoopAnimation } from '@/hooks/use-loop-animation'
import { usePressScale } from '@/hooks/use-press-scale'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { cssGradient, neoMaterial, neoParticlePresets, neoTokens } from '@/theme/neo-tokens'
import type { ResolvedThemeMode } from '@/theme/palette'
import { nunitoFamily } from '@/theme/typography'

/**
 * Kit réplica de **Mi jardín** (handoff `design/jardin-2026-08`) — Task 3 del
 * plan `docs/superpowers/plans/2026-08-11-jardin-rediseno-integracion.md`.
 *
 * Transcripción del mockup de teléfono (HTML:458–534 claro / 535–609 oscuro) y
 * del sistema de hero 2a–2f (HTML:333–444), con los tokens de `jardin-spec` y
 * la geometría de aros de `parts/growth-ring`.
 *
 * ARQUITECTURA (la misma de `gastos-screen`): sub-componentes PRESENTACIONALES
 * exportados + los tipos VM del §5 del plan + una `JardinFinalScreen`
 * AUTO-CONDUCIDA (`useReducer` + datos demo) para que el owner pueda tocar la
 * pantalla en el preview. El cableado de T9 compone los mismos sub-componentes
 * llenando los VMs con datos reales: el render no cambia.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DECISIONES DE ESTE ARCHIVO (las que el código no muestra solo)
 * ─────────────────────────────────────────────────────────────────────
 *
 *  [OWNER-1] Copy en tuteo neutro. Los copys del handoff vienen en voseo y se
 *      neutralizan ACÁ, no en el pase de i18n: "Plantá"→"Planta",
 *      "Registrá"→"Registra", "Sumá"→"Suma", "volvé"→"vuelve".
 *
 *  [OWNER-2] El fondo es `neoTokens(mode).bg` y las cards usan el material del
 *      sistema (`neoMaterial(mode,'raisedLg')`), no el `#EEEDE9` del handoff.
 *      Excepción literal: el botón de volver del header y la card de "Semana
 *      pasada", que el mockup dibuja con fill propio (el back en claro sale
 *      PLANO del canvas — es su relieve; la card de semana pasada tiene su
 *      propio gradiente `semanaCardGradientCss`).
 *
 *  [OWNER-5] Partículas = `BrotParticles` con el preset `hero`, dentro de una
 *      capa absoluta propia con `overflow:'hidden'` — la card del hero NO
 *      clipea, porque contiene un Brot y su tinta sobresale de la caja.
 *      El `count` viaja en el VM (el mockup varía 8/10/14 por estado) y se
 *      topea en 12 por la regla ⑥2 del handoff ("partículas ≤12").
 *
 *  [OWNER-6] El aro es CRECIMIENTO, no riego: los chips y la leyenda dicen
 *      "adelanta el crecimiento", nunca "regado". El cupo entra como TONO
 *      (verde / ámbar / celeste), no como porcentaje.
 *
 *  [A] Los días PASADOS plantados van LLENOS (100% verde), no al porcentaje
 *      alcanzado — el mockup dibuja el miércoles al 40% y acá no.
 *
 *  · **Bleed del Brot**: ningún contenedor de un Brot lleva `overflow:'hidden'`
 *    (ni los pozos de los aros ni las medallas). El único `overflow:'hidden'`
 *    del archivo es la capa de partículas, que no tiene Brot adentro.
 *
 *  · **La fila chip + 7 dots del hero NO se dibuja** (README:30 la eliminó por
 *    redundancia con el componente semanal). `HeroVM.chip` sigue en el contrato
 *    del §5 —lo computa el cableado— y acá alimenta el `accessibilityLabel` del
 *    hero, que es donde ese estado todavía tiene que existir para un lector de
 *    pantalla.
 *
 *  · **Círculos punteados en SVG, no `borderStyle:'dashed'`**: en Android un
 *    borde dashed con `borderRadius > 0` se rinde SÓLIDO (misma razón que
 *    `gastos/parts/ghost.tsx`).
 *
 *  · **Android API < 29 descarta las sombras inset en silencio**: todo pozo
 *    cae a un `hairline` cuando `SUPPORTS_INSET_SHADOW` es falso, o el pozo
 *    desaparece y el Brot queda flotando.
 *
 *  · **El día en calma [OWNER-4]** se dibuja con anillo DOBLE + `calmaRing` +
 *    Brot `zen`. El glyph `crecimiento/brote-bebe` acompaña sólo al aro GRANDE
 *    y a la leyenda: dentro del pozo de 28px de la fila un sticker de ~11px es
 *    ruido, no señal — el peso ahí lo cargan el anillo doble y la pose.
 *
 *  · **Poses**: la única fuente es la tabla del §5 del plan. Las de la card de
 *    "Semana pasada" (que la tabla no cubre) siguen al cierre de semana:
 *    perfecta `cheer` · buena `love` · floja `think` · cortada `sad`.
 */

// ─── Contrato kit↔live (§5 del plan) ─────────────────────────────────
//
// Los tipos que YA existen en los módulos puros se importan y se re-exportan,
// nunca se redefinen: una segunda declaración estructuralmente igual compila
// hoy y se desincroniza mañana.

export type JardinMode = ResolvedThemeMode

/** Alias del contrato: `HeroState` del modelo es la misma unión de 6 estados. */
export type HeroKind = HeroState

export type { DayRingState, MedalVM, RingTone }

export interface HeroVM {
  kind: HeroKind
  label: string
  title: string
  sub: string
  chip: { text: string; kind: 'neutral' | 'ok' | 'risk' | 'lost' }
  cta?: { text: string; tone: 'green' | 'amber'; onPress: () => void }
  pill?: string
  brotPose: BrotPose
  particleCount: number
}

export interface DayRingVM {
  letter: string
  state: DayRingState
  pct: number
  tone: RingTone
  /** Día en calma — vale también con `state: 'today'`. */
  noSpend: boolean
  /** Etapa por horas (§3.2). */
  stage: EtapaCrecimiento
  brotPose: BrotPose | null
  /** Tamaño continuo en horas, dentro de `ringDay.brotMin/brotMax`. */
  brotSize: number
}

/** Dot de una semana en el resumen y en el sheet de historial. */
export type HistoryDot = 'full' | 'calma' | 'missed' | 'recovered' | 'pre'

export interface CrecimientoVM {
  /**
   * El foco es el pozo grande: su Brot va SIEMPRE a
   * `JARDIN_GEOMETRY.ringFocus.brot` (52), no al `brotSize` de la fila.
   * La etapa se comunica en palabras en el chip, no por tamaño.
   */
  focus: Omit<DayRingVM, 'brotSize'> & { chipDot: 'sand' | 'water' | 'green'; chipText: string }
  /** 7, L→D. */
  days: DayRingVM[]
  footer: { kind: 'cta' | 'pill'; text: string; onPress?: () => void }
  /** "Marcar día sin gastos" (D4). */
  secondary?: { text: string; onPress: () => void }
  history: { rows: HistoryDot[][]; onOpen: () => void } | null
}

export type WeekCloseVariant = 'perfecta' | 'buena' | 'floja' | 'cortada'

export interface SemanaPasadaVM {
  variant: WeekCloseVariant
  title: string
  sub: string
  unseenDot: boolean
  onOpenCierre: () => void
}

export interface LogrosAccessVM {
  medals: MedalVM[]
  countText: string
  onPress: () => void
}

/** Una fila del sheet de historial (HTML:300–329). */
export interface HistorialWeekVM {
  range: string
  dots: HistoryDot[]
  chip: { text: string; tone: 'ok' | 'neutral' }
}

// ─── Motion (⑥ del handoff · Apéndice B del plan) ────────────────────

/** Halo del hero 2d — pulse 3s loop. */
const HALO_LEG_MS = 1500 // @motion-allow: media vuelta del pulse 3s del halo (matriz ①4)
/** CTA de 2e — scale 1.03 cada 4s. */
const CTA_PULSE_LEG_MS = 320 // @motion-allow: ida/vuelta del pulse del CTA en riesgo (matriz ①5)
const CTA_PULSE_REST_MS = 3360 // @motion-allow: resto del ciclo de 4s del CTA en riesgo
const CTA_PULSE_SCALE = 1.03
/** Borde ámbar de 2e — fade-in 400ms al entrar al estado. */
const AMBER_EDGE_MS = 400 // @motion-allow: fade-in del borde ámbar (matriz ①5)
/** Dot naranja de "cierre sin ver" — pulse 2s. */
const UNSEEN_LEG_MS = 1000 // @motion-allow: media vuelta del pulse 2s del dot sin ver (matriz ③5)
/** Skeleton — shimmer 1.2s sobre los pozos. */
const SKELETON_LEG_MS = 600 // @motion-allow: media vuelta del shimmer 1.2s del skeleton (matriz ①8)
const SKELETON_FLOOR = 0.45
/** Dots del sheet de historial — stagger 40ms (matriz ②8). */
const SHEET_DOT_STAGGER_MS = 40
/** Entrada de cards — stagger 60ms + rise 12px (matriz ⑥5). */
const CARD_STAGGER_MS = 60
const CARD_RISE = 12

const EASE_IN_OUT = Easing.inOut(Easing.quad)

/** Trazo del círculo punteado del día futuro (`border: 2.5px dashed`). */
const DASH_PATTERN = '5 4'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/** El sticker de "brote bebé" ya vive en el registry y nunca se usó (D4). */
const CALMA_GLYPH = CATEGORY_ICONS['crecimiento/brote-bebe']

// ─── Primitivas ──────────────────────────────────────────────────────

/**
 * Pozo neumórfico. Cae a un `hairline` donde Android descarta el inset
 * (API < 29), o el hueco no existe y su contenido queda flotando.
 */
function wellStyle(s: JardinSpec, background: string, shadow: string): ViewStyle {
  return SUPPORTS_INSET_SHADOW
    ? { backgroundColor: background, boxShadow: shadow }
    : { backgroundColor: background, borderWidth: 1, borderColor: s.hairline }
}

function ChevronLeftGlyph({ color }: { color: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 6l-6 6 6 6"
        stroke={color}
        strokeWidth={2.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function ChevronRightGlyph({ color }: { color: string }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 6l6 6-6 6"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Círculo punteado del día futuro / previo al alta. SVG y no `dashed`: ver docblock. */
function DashedRing({ color, size, opacity = 1 }: { color: string; size: number; opacity?: number }) {
  const stroke = JARDIN_GEOMETRY.dashedWidth
  const r = (size - stroke) / 2
  // La opacidad va en un `View` envolvente: el `style` de `Svg` no acepta un
  // objeto suelto (su tipo pide un array/RegisteredStyle).
  return (
    <View style={{ opacity }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={DASH_PATTERN}
        />
      </Svg>
    </View>
  )
}

/**
 * Sticker del día en calma (D4).
 *
 * No usa `CategorySticker` —que ya resuelve la placa clara del modo oscuro—
 * porque ése lee el tema con `useThemeTokens()`, y en el preview el owner
 * alterna el `mode` del kit sin tocar el tema del sistema: saldría con la placa
 * al revés. Se replica su regla acá: los stickers están ilustrados para fondo
 * CLARO (bordes oscuros + brillos blancos), así que en oscuro van sobre una
 * placa o pierden la silueta.
 */
function CalmaGlyph({ mode, size }: { mode: JardinMode; size: number }) {
  const image = (
    <Image
      source={CALMA_GLYPH}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  )
  if (mode === 'light') return image
  return (
    <View
      style={[
        styles.calmaGlyphPlate,
        { width: size, height: size, borderRadius: Math.round(size * 0.3) },
      ]}
    >
      {image}
    </View>
  )
}

// ─── ① Header ────────────────────────────────────────────────────────

export interface JardinHeaderProps {
  mode: JardinMode
  title?: string
  sub?: string
  onBack?: () => void
}

/**
 * Header de la vista: botón de volver 44px + título 30/900 + sub 12.5/700.
 *
 * El botón hace el press neumórfico REAL del handoff (⑥1): raised → inset. No
 * se anima la sombra (RN no interpola strings de `boxShadow`), se cambia la
 * receta y el `usePressScale` aporta la curva de 120/180ms.
 */
export function JardinHeader({
  mode,
  title = 'Mi jardín',
  sub = 'Completa los 7 días y tu jardín florece.',
  onBack,
}: JardinHeaderProps) {
  const s = JARDIN_SPEC[mode]
  const neo = neoTokens(mode)
  const [pressed, setPressed] = useState(false)
  const press = usePressScale({ pressedScale: 0.94 })

  return (
    <View style={styles.header}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel="Volver"
        onPress={onBack}
        onPressIn={() => {
          setPressed(true)
          press.onPressIn()
        }}
        onPressOut={() => {
          setPressed(false)
          press.onPressOut()
        }}
        style={press.animatedStyle}
      >
        <View
          style={[
            styles.backButton,
            // El mockup dibuja el back PLANO sobre el canvas en claro y con el
            // material raised en oscuro (HTML:31 vs 265). Se transcribe así.
            mode === 'dark'
              ? cssGradient(neo.raisedGradientCss, neo.surface)
              : { backgroundColor: neo.bg },
            {
              boxShadow:
                pressed && SUPPORTS_INSET_SHADOW ? neo.shadows.insetMd : neo.shadows.raisedMd,
            },
          ]}
        >
          <ChevronLeftGlyph color={s.cardTitleInk} />
        </View>
      </AnimatedPressable>
      <View style={styles.headerTexts}>
        <Text style={[styles.headerTitle, { color: s.cardTitleInk }]}>{title}</Text>
        <Text style={[styles.headerSub, { color: s.cardSubInk }]}>{sub}</Text>
      </View>
    </View>
  )
}

// ─── ② Hero de estado (2a–2f) ────────────────────────────────────────

/** Halo radial del 2d, con su pulse de 3s. */
function HeroHalo({ s, size, animated }: { s: JardinSpec; size: number; animated: boolean }) {
  const pulse = useSharedValue(0)
  useLoopAnimation(
    () => {
      // El hook sólo gatea reduced-motion; el `animated` del caller (preview
      // estático, Brot congelado) se chequea acá.
      if (!animated) return
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: HALO_LEG_MS, easing: EASE_IN_OUT }),
          withTiming(0, { duration: HALO_LEG_MS, easing: EASE_IN_OUT }),
        ),
        -1,
        false,
      )
    },
    [pulse],
    [animated],
  )
  const style = useAnimatedStyle(() => ({
    opacity: 0.75 + pulse.value * 0.25,
    transform: [{ scale: 0.92 + pulse.value * 0.12 }],
  }))
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.heroHalo,
        { width: size, height: size, borderRadius: size / 2 },
        cssGradient(s.heroHaloCss, 'transparent'),
        style,
      ]}
    />
  )
}

/** Barra ámbar de 2e (`inset 4px 0 0 #E8A664` del handoff, acá como capa propia
 *  para poder animarle la opacidad — Apéndice B). */
function HeroAmberEdge({ animated }: { animated: boolean }) {
  const enter = useSharedValue(animated ? 0 : 1)
  useLoopAnimation(
    () => {
      if (!animated) return
      enter.value = withTiming(1, { duration: AMBER_EDGE_MS, easing: EASE_IN_OUT })
    },
    [enter],
    [animated],
  )
  const style = useAnimatedStyle(() => ({ opacity: animated ? enter.value : 1 }))
  return <Animated.View pointerEvents="none" style={[styles.heroAmberEdge, style]} />
}

/** CTA del hero. `pulse` = el latido de 4s del estado en riesgo (①5). */
function HeroCta({
  s,
  cta,
  animated,
}: {
  s: JardinSpec
  cta: NonNullable<HeroVM['cta']>
  animated: boolean
}) {
  const amber = cta.tone === 'amber'
  const press = usePressScale({ pressedScale: 0.97 })
  const beat = useSharedValue(1)
  const pulsing = animated && amber
  useLoopAnimation(
    () => {
      if (!pulsing) return
      // La tercera pata es el REPOSO del ciclo de 4s: anima a su propio valor,
      // así el latido no se encadena con el siguiente.
      beat.value = withRepeat(
        withSequence(
          withTiming(CTA_PULSE_SCALE, { duration: CTA_PULSE_LEG_MS, easing: EASE_IN_OUT }),
          withTiming(1, { duration: CTA_PULSE_LEG_MS, easing: EASE_IN_OUT }),
          withTiming(1, { duration: CTA_PULSE_REST_MS, easing: Easing.linear }),
        ),
        -1,
        false,
      )
    },
    [beat],
    [pulsing],
  )
  const beatStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulsing ? beat.value : 1 }] }))

  return (
    <Animated.View style={beatStyle}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={cta.text}
        onPress={cta.onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.heroCtaSpacing, press.animatedStyle]}
      >
        <View
          style={[
            styles.heroCta,
            cssGradient(
              amber ? s.ctaAmberGradientCss : s.ctaGreenGradientCss,
              amber ? s.ctaAmberFallback : s.ctaGreenFallback,
            ),
            { boxShadow: amber ? s.ctaAmberShadow : s.ctaGreenShadow },
          ]}
        >
          <Text
            maxFontSizeMultiplier={1.3}
            style={[
              styles.heroCtaText,
              amber ? styles.heroCtaTextAmber : null,
              { color: amber ? s.ctaAmberInk : s.ctaGreenInk },
            ]}
          >
            {cta.text}
          </Text>
        </View>
      </AnimatedPressable>
    </Animated.View>
  )
}

export interface JardinHeroProps {
  mode: JardinMode
  vm: HeroVM
  animated?: boolean
}

/**
 * Hero 2a–2f (HTML:333–444 + el del teléfono, HTML:483–485 con radius 32).
 *
 * Sin la fila chip + 7 dots (README:30). La card NO clipea: contiene un Brot y
 * la tinta del brote sobresale de su caja; las partículas viven en su propia
 * capa recortada.
 */
export function JardinHero({ mode, vm, animated = true }: JardinHeroProps) {
  const s = JARDIN_SPEC[mode]
  const reduceMotion = useReducedMotion()
  const motion = animated && !reduceMotion
  const cortada = vm.kind === 'cortada'
  const empezar = vm.kind === 'empezar'
  const radiante = vm.kind === 'floreciendo'
  const brotSize = radiante ? JARDIN_GEOMETRY.heroBrotRadiante : JARDIN_GEOMETRY.heroBrot
  // ⑥3 — reduced motion apaga el campo de partículas por completo.
  const particleCount = motion ? Math.min(vm.particleCount, 12) : 0

  const gradientCss = cortada
    ? s.heroCortadaGradientCss
    : empezar
      ? s.heroEmpezarGradientCss
      : s.heroVivoGradientCss
  const fallback = cortada
    ? s.heroCortadaFallback
    : empezar
      ? s.heroEmpezarFallback
      : s.heroVivoFallback

  return (
    <View
      accessible
      accessibilityLabel={`${vm.title}. ${vm.sub}. ${vm.chip.text}`}
      style={[
        styles.hero,
        cssGradient(gradientCss, fallback),
        { boxShadow: cortada ? s.heroCortadaShadow : s.heroShadow },
      ]}
    >
      {particleCount > 0 ? (
        // Doble clip (wrapper + prop): en Android el clip de esquinas sobre un
        // <Canvas> de Skia no es confiable. Es la ÚNICA capa con overflow del
        // archivo, y no tiene ningún Brot adentro.
        <View style={styles.heroParticles} pointerEvents="none">
          <BrotParticles
            {...neoParticlePresets.hero}
            count={particleCount}
            borderRadius={JARDIN_GEOMETRY.radii.hero}
          />
        </View>
      ) : null}

      {vm.kind === 'enRiesgo' ? <HeroAmberEdge animated={motion} /> : null}

      <View style={styles.heroRow}>
        <View style={styles.heroBrotSlot}>
          {radiante ? <HeroHalo s={s} size={brotSize + 46} animated={motion} /> : null}
          <View
            style={{
              // Sombra proyectada del Brot: en claro la tinta del handoff, en
              // oscuro su glow verde. Es la `drop-shadow` del mockup — en iOS
              // la sombra sale de la silueta del canvas; Android la ignora sin
              // `elevation`, y ahí el hero ya se lee sin ella.
              shadowColor: s.heroBrotShadowColor,
              shadowOpacity: 1,
              shadowRadius: s.heroBrotShadowRadius,
              shadowOffset: s.heroBrotShadowOffset,
            }}
          >
            {/* Los loops de pose (sway 2.5s de `seed`, saludo cada 6s de
                `wave`) los corre el propio `BrotMascot` en el hilo de UI; acá
                sólo se decide si el reloj camina. */}
            <BrotMascot pose={vm.brotPose} size={brotSize} animated={motion} shadow={false} />
          </View>
        </View>
        <View style={styles.heroTexts}>
          <Text
            maxFontSizeMultiplier={1.3}
            style={[
              styles.heroLabel,
              {
                color: cortada
                  ? s.heroLabelCortadaInk
                  : vm.kind === 'enRiesgo'
                    ? s.heroLabelRiesgoInk
                    : s.heroLabelInk,
              },
            ]}
          >
            {vm.label}
          </Text>
          <Text
            maxFontSizeMultiplier={1.2}
            style={[
              styles.heroTitle,
              radiante ? styles.heroTitleXl : null,
              vm.kind === 'enRiesgo' ? styles.heroTitleSm : null,
              { color: cortada ? s.heroTitleCortadaInk : s.heroTitleInk },
            ]}
          >
            {vm.title}
          </Text>
          <Text
            maxFontSizeMultiplier={1.3}
            style={[styles.heroSub, { color: cortada ? s.heroSubCortadaInk : s.heroSubInk }]}
          >
            {vm.sub}
          </Text>
        </View>
      </View>

      {vm.cta ? <HeroCta s={s} cta={vm.cta} animated={motion} /> : null}
      {!vm.cta && vm.pill ? (
        <View
          style={[
            styles.heroPill,
            { backgroundColor: s.heroPillBackground, boxShadow: s.heroPillShadow },
          ]}
        >
          <Text maxFontSizeMultiplier={1.3} style={[styles.heroPillText, { color: s.heroPillInk }]}>
            {vm.pill}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

// ─── ③ Tu jardín · semana vigente ────────────────────────────────────

/** Tono del aro: el día en calma tiene el suyo; los pasados van verdes [A]; el
 *  resto toma el TONO del cupo (§3.3), que es estado y no progreso. */
function ringColorFor(s: JardinSpec, day: Pick<DayRingVM, 'state' | 'tone' | 'noSpend'>): string {
  if (day.noSpend) return s.calmaRing
  if (day.state === 'planted') return s.ringGreen
  if (day.state === 'recovered') return s.recoveredInk
  if (day.tone === 'amber') return s.ringAmber
  if (day.tone === 'green') return s.ringGreen
  return s.ringWater
}

function wellBackgroundFor(s: JardinSpec, day: Pick<DayRingVM, 'state' | 'noSpend'>): string {
  if (day.noSpend) return s.calmaWell
  if (day.state === 'today') return s.ringTodayWellBackground
  return s.ringWellBackground
}

/** Una celda de la fila de 7: aro 40/4 + pozo 28 + letra. */
const DayRingCell = memo(function DayRingCell({
  s,
  day,
  animated,
}: {
  s: JardinSpec
  day: DayRingVM
  animated: boolean
}) {
  const g = JARDIN_GEOMETRY.ringDay
  const isToday = day.state === 'today'
  const label = isToday ? 'HOY' : day.letter

  let ring: React.ReactNode
  if (day.state === 'future' || day.state === 'pre') {
    // El día previo al alta NUNCA se pinta como perdido (§3.5b, "sin culpa"):
    // es el mismo molde punteado del futuro, un punto más tenue.
    ring = (
      <View style={[styles.dayRingBox, { width: g.size, height: g.size }]}>
        <DashedRing color={s.ringDashed} size={g.size} opacity={day.state === 'pre' ? 0.45 : 1} />
      </View>
    )
  } else {
    ring = (
      <GrowthRing
        size={g.size}
        stroke={g.stroke}
        pct={day.pct}
        color={ringColorFor(s, day)}
        trackColor={s.ringTrack}
        double={day.noSpend}
        animated={animated}
      >
        <View
          style={[
            styles.ringWell,
            { width: g.well, height: g.well, borderRadius: g.well / 2 },
            wellStyle(s, wellBackgroundFor(s, day), s.ringDayWellShadow),
          ]}
        >
          {day.brotPose ? (
            <View
              style={
                day.state === 'missed' ? { opacity: JARDIN_GEOMETRY.wiltedOpacity } : undefined
              }
            >
              {/* Estáticos por diseño (`animated="false"` en el mockup): 7
                  canvas animados en una fila serían ruido y costo. */}
              <BrotMascot pose={day.brotPose} size={day.brotSize} animated={false} shadow={false} />
            </View>
          ) : null}
        </View>
      </GrowthRing>
    )
  }

  return (
    <View style={styles.dayCol}>
      {ring}
      <Text
        maxFontSizeMultiplier={1.2}
        style={[
          styles.dayLabel,
          isToday ? styles.dayLabelToday : null,
          { color: isToday ? s.todayLabelInk : s.dayLabelInk },
        ]}
      >
        {label}
      </Text>
    </View>
  )
})

/** Dot de la leyenda + su texto. */
function LegendItem({ s, color, text }: { s: JardinSpec; color: string; text: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text maxFontSizeMultiplier={1.2} style={[styles.legendText, { color: s.legendInk }]}>
        {text}
      </Text>
    </View>
  )
}

function historyDotColor(s: JardinSpec, dot: HistoryDot): string {
  // `pre`: antes del alta no hay nada que juzgar (§3.5b, "sin culpa"). Va con el
  // gris del punteado del futuro, el único del vocabulario que no lee como
  // "lo perdiste" — el `historyDotPartial` del handoff es un verde claro y acá
  // nunca aparece: los días pasados plantados van LLENOS [A].
  const byDot: Record<HistoryDot, string> = {
    full: s.historyDotFull,
    calma: s.calmaRing,
    recovered: s.recoveredInk,
    missed: s.historyDotMissed,
    pre: s.ringDashed,
  }
  return byDot[dot]
}

export interface CrecimientoCardProps {
  mode: JardinMode
  vm: CrecimientoVM
  animated?: boolean
  title?: string
  tag?: string
}

/**
 * Card "Tu jardín · semana vigente": aro grande de foco (130/10 + pozo 100 +
 * Brot 52) + chip + fila de 7 aros + leyenda + acción secundaria + footer +
 * fila de historial.
 */
export function CrecimientoCard({
  mode,
  vm,
  animated = true,
  title = 'Tu jardín',
  tag = 'semana vigente',
}: CrecimientoCardProps) {
  const s = JARDIN_SPEC[mode]
  const reduceMotion = useReducedMotion()
  const motion = animated && !reduceMotion
  const g = JARDIN_GEOMETRY.ringFocus
  const focus = vm.focus
  const chipDotColor =
    focus.chipDot === 'green' ? s.accentDot : focus.chipDot === 'water' ? s.ringWater : s.ringDashed
  const footerPress = usePressScale({ pressedScale: 0.97 })
  const historyPress = usePressScale({ pressedScale: 0.98 })

  return (
    <View style={[styles.card, neoMaterial(mode, 'raisedLg')]}>
      <View style={styles.cardHead}>
        <Text maxFontSizeMultiplier={1.2} style={[styles.cardTitle, { color: s.cardTitleInk }]}>
          {title}
        </Text>
        <Text maxFontSizeMultiplier={1.2} style={[styles.cardTag, { color: s.accentInk }]}>
          {tag}
        </Text>
      </View>

      <View style={styles.focusBlock}>
        <GrowthRing
          size={g.size}
          stroke={g.stroke}
          pct={focus.pct}
          color={ringColorFor(s, focus)}
          trackColor={s.ringTrack}
          double={focus.noSpend}
          animated={motion}
        >
          <View
            style={[
              styles.ringWell,
              { width: g.well, height: g.well, borderRadius: g.well / 2 },
              wellStyle(s, wellBackgroundFor(s, focus), s.ringWellShadow),
            ]}
          >
            {focus.brotPose ? (
              <BrotMascot pose={focus.brotPose} size={g.brot} animated={motion} shadow={false} />
            ) : null}
            {focus.noSpend ? (
              <View style={styles.calmaGlyphSlot} pointerEvents="none">
                <CalmaGlyph mode={mode} size={20} />
              </View>
            ) : null}
          </View>
        </GrowthRing>

        <View
          style={[
            styles.focusChip,
            { backgroundColor: s.chipBackground, boxShadow: s.chipShadow },
            SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: s.hairline },
          ]}
        >
          <View style={[styles.focusChipDot, { backgroundColor: chipDotColor }]} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.focusChipText, { color: s.chipInk }]}>
            {focus.chipText}
          </Text>
        </View>
      </View>

      <View style={styles.daysRow}>
        {vm.days.map((day, i) => (
          <DayRingCell key={`${day.letter}-${i}`} s={s} day={day} animated={motion} />
        ))}
      </View>

      {/* Leyenda (README:52), reescrita por [OWNER-6]: el aro es crecimiento. */}
      <View style={styles.legendRow}>
        <LegendItem s={s} color={s.accentDot} text="día completo" />
        <LegendItem s={s} color={s.ringWater} text="crecimiento de hoy" />
        <LegendItem s={s} color={s.calmaRing} text="día en calma" />
      </View>

      {vm.secondary ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={vm.secondary.text}
          onPress={vm.secondary.onPress}
          style={styles.secondaryAction}
        >
          <CalmaGlyph mode={mode} size={16} />
          <Text
            maxFontSizeMultiplier={1.3}
            style={[styles.secondaryActionText, { color: s.cardSubInk }]}
          >
            {vm.secondary.text}
          </Text>
        </Pressable>
      ) : null}

      {vm.footer.kind === 'cta' ? (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={vm.footer.text}
          onPress={vm.footer.onPress}
          onPressIn={footerPress.onPressIn}
          onPressOut={footerPress.onPressOut}
          style={[styles.footerSpacing, footerPress.animatedStyle]}
        >
          <View
            style={[
              styles.footerCta,
              cssGradient(s.ctaGreenGradientCss, s.ctaGreenFallback),
              { boxShadow: s.ctaGreenShadow },
            ]}
          >
            <Text maxFontSizeMultiplier={1.3} style={[styles.footerCtaText, { color: s.ctaGreenInk }]}>
              {vm.footer.text}
            </Text>
          </View>
        </AnimatedPressable>
      ) : (
        <View
          style={[
            styles.footerSpacing,
            styles.footerPill,
            { backgroundColor: s.chipBackground, boxShadow: s.chipShadow },
            SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: s.hairline },
          ]}
        >
          <Text maxFontSizeMultiplier={1.3} style={[styles.footerPillText, { color: s.chipInk }]}>
            {vm.footer.text}
          </Text>
        </View>
      )}

      {vm.history ? (
        // Sin botón ni chevron: TODA la fila abre el sheet (README:56).
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="Semanas anteriores"
          onPress={vm.history.onOpen}
          onPressIn={historyPress.onPressIn}
          onPressOut={historyPress.onPressOut}
          style={[styles.historyRow, { borderTopColor: s.historyDivider }, historyPress.animatedStyle]}
        >
          <Text
            maxFontSizeMultiplier={1.2}
            style={[styles.historyLabel, { color: s.historyLabelInk }]}
          >
            Semanas anteriores
          </Text>
          <View style={styles.historyDots}>
            {vm.history.rows.map((row, i) => (
              <View key={i} style={styles.historyDotsRow}>
                {row.map((dot, j) => (
                  <View
                    key={j}
                    style={[
                      styles.historyDot,
                      { backgroundColor: historyDotColor(s, dot) },
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>
        </AnimatedPressable>
      ) : null}
    </View>
  )
}

// ─── ④ Semana pasada ─────────────────────────────────────────────────

const SEMANA_POSE: Record<WeekCloseVariant, BrotPose> = {
  perfecta: 'cheer',
  buena: 'love',
  floja: 'think',
  cortada: 'sad',
}

/** Dot naranja de "cierre sin ver" (③5): pulse 2s, se apaga al abrir. */
function UnseenDot({ color, animated }: { color: string; animated: boolean }) {
  const pulse = useSharedValue(1)
  useLoopAnimation(
    () => {
      if (!animated) return
      pulse.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: UNSEEN_LEG_MS, easing: EASE_IN_OUT }),
          withTiming(1, { duration: UNSEEN_LEG_MS, easing: EASE_IN_OUT }),
        ),
        -1,
        false,
      )
    },
    [pulse],
    [animated],
  )
  const style = useAnimatedStyle(() => ({ opacity: animated ? pulse.value : 1 }))
  return <Animated.View style={[styles.unseenDot, { backgroundColor: color }, style]} />
}

export interface SemanaPasadaCardProps {
  mode: JardinMode
  vm: SemanaPasadaVM
  animated?: boolean
}

/** Card "Semana pasada" (HTML:507–514 / README:32). */
export function SemanaPasadaCard({ mode, vm, animated = true }: SemanaPasadaCardProps) {
  const s = JARDIN_SPEC[mode]
  const reduceMotion = useReducedMotion()
  const motion = animated && !reduceMotion
  const press = usePressScale({ pressedScale: 0.96 })

  return (
    <View
      style={[
        styles.semanaCard,
        cssGradient(s.semanaCardGradientCss, s.semanaCardFallback),
        { boxShadow: neoTokens(mode).shadows.raisedLg },
      ]}
    >
      {/* `cheer` sólo late en la perfecta (③1–4): en las otras tres el Brot
          está quieto y el estado lo comunica la pose. */}
      <BrotMascot
        pose={SEMANA_POSE[vm.variant]}
        size={JARDIN_GEOMETRY.semanaPasadaBrot}
        animated={motion && vm.variant === 'perfecta'}
        shadow={false}
      />
      <View style={styles.semanaTexts}>
        <Text maxFontSizeMultiplier={1.2} style={[styles.semanaTitle, { color: s.cardTitleInk }]}>
          {vm.title}
        </Text>
        <Text maxFontSizeMultiplier={1.3} style={[styles.semanaSub, { color: s.cardSubInk }]}>
          {vm.sub}
        </Text>
      </View>
      <View style={styles.semanaCtaSlot}>
        {vm.unseenDot ? <UnseenDot color={s.ringAmber} animated={motion} /> : null}
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="Ver cierre"
          onPress={vm.onOpenCierre}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          style={press.animatedStyle}
        >
          <View
            style={[
              styles.semanaCta,
              cssGradient(s.ctaGreenGradientCss, s.ctaGreenFallback),
              { boxShadow: s.ctaGreenSmShadow },
            ]}
          >
            <Text maxFontSizeMultiplier={1.2} style={[styles.semanaCtaText, { color: s.ctaGreenInk }]}>
              Ver cierre ›
            </Text>
          </View>
        </AnimatedPressable>
      </View>
    </View>
  )
}

// ─── ⑤ Acceso a Logros ───────────────────────────────────────────────

/**
 * Medalla del stack de acceso (34px, HTML:515–526).
 *
 * Es su propia pieza y no `parts/medal.tsx` (T5): el handoff le da tokens
 * distintos a este tamaño (`medalAccess*` cierra el radial más arriba que los
 * discos de 48/54) y el stack agrega borde de superficie y solape. Las ramas de
 * `MedalVM` que no aportan nada a 34px —`icon`, que a esta escala sería un
 * sticker ilegible— caen al pozo con "?", que es lo que dibuja el mockup.
 *
 * SIN `overflow:'hidden'`: el Brot de la medalla desbloqueada sobresale de su
 * caja y cualquier clip acá lo guillotina (D3).
 */
function AccessMedal({ s, vm, index }: { s: JardinSpec; vm: MedalVM; index: number }) {
  const size = JARDIN_GEOMETRY.radii.medalAccess
  const base: StyleProp<ViewStyle> = [
    styles.accessMedal,
    {
      width: size,
      height: size,
      borderRadius: size / 2,
      borderWidth: JARDIN_GEOMETRY.medalBorderWidth,
      borderColor: s.medalBorderColor,
      marginLeft: index === 0 ? 0 : JARDIN_GEOMETRY.medalOverlap,
    },
  ]

  if (vm.kind === 'brot') {
    return (
      <View
        style={[
          base,
          cssGradient(s.medalAccessGradientCss, s.medalAccessFallback),
          { boxShadow: s.medalShadowAccess },
        ]}
      >
        <BrotMascot pose={vm.pose} size={24} animated={false} shadow={false} />
      </View>
    )
  }

  if (vm.kind === 'progress') {
    return (
      <View
        style={[
          base,
          cssGradient(s.medalAccessGradientCss, s.medalAccessFallback),
          { boxShadow: s.medalShadowAccess },
        ]}
      >
        <Text maxFontSizeMultiplier={1.2} style={[styles.accessMedalNumber, { color: s.medalNumberInk }]}>
          {vm.current}
        </Text>
      </View>
    )
  }

  return (
    <View style={[base, wellStyle(s, s.wellLockedBackground, s.wellLockedShadow)]}>
      <Text maxFontSizeMultiplier={1.2} style={[styles.accessMedalLocked, { color: s.wellLockedInk }]}>
        ?
      </Text>
    </View>
  )
}

export interface LogrosAccessCardProps {
  mode: JardinMode
  vm: LogrosAccessVM
  title?: string
}

/** Card de acceso a Logros (HTML:515–526 / README:33). */
export function LogrosAccessCard({ mode, vm, title = 'Logros' }: LogrosAccessCardProps) {
  const s = JARDIN_SPEC[mode]
  const press = usePressScale({ pressedScale: 0.98 })

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${vm.countText}`}
      onPress={vm.onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.animatedStyle}
    >
      <View style={[styles.logrosCard, neoMaterial(mode, 'raisedLg')]}>
        <View style={styles.logrosStack}>
          {vm.medals.map((medal, i) => (
            <AccessMedal key={i} s={s} vm={medal} index={i} />
          ))}
        </View>
        <View style={styles.logrosTexts}>
          <Text maxFontSizeMultiplier={1.2} style={[styles.logrosTitle, { color: s.cardTitleInk }]}>
            {title}
          </Text>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
            style={[styles.logrosSub, { color: s.cardSubInk }]}
          >
            {vm.countText}
          </Text>
        </View>
        <View
          style={[
            styles.chevronDisc,
            {
              backgroundColor: s.chevronBackground ?? 'transparent',
              boxShadow: s.chevronShadow,
            },
            SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: s.hairline },
          ]}
        >
          <ChevronRightGlyph color={s.chevronInk} />
        </View>
      </View>
    </AnimatedPressable>
  )
}

// ─── ⑥ Nota educativa ────────────────────────────────────────────────

export interface NotaEducativaProps {
  mode: JardinMode
  text?: string
  onDismiss?: () => void
}

/**
 * Nota educativa (⑤1). El copy del handoff hablaba de "riego"; con [OWNER-6]
 * la primera oración es la frase canónica del §3.1 del plan.
 *
 * El "×" es propio: la matriz ⑤2 exige poder descartarla y el handoff no le dio
 * visual. Va como disco inset de 24px arriba a la derecha, sin quitarle ancho
 * al texto (la nota es centrada y el disco flota encima).
 */
export function NotaEducativa({
  mode,
  text = 'Cada gasto que registras adelanta el crecimiento de tu brote. Completa los 7 días y tu jardín florece. ¿Sin gastos? Marca el día y tu brote crece el doble.',
  onDismiss,
}: NotaEducativaProps) {
  const s = JARDIN_SPEC[mode]
  const neo = neoTokens(mode)
  return (
    <View
      style={[
        styles.nota,
        { backgroundColor: s.notaBackground, boxShadow: s.notaShadow },
        SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: s.hairline },
      ]}
    >
      <Text maxFontSizeMultiplier={1.4} style={[styles.notaText, { color: s.notaInk }]}>
        {text}
      </Text>
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Descartar la nota"
          onPress={onDismiss}
          hitSlop={10}
          style={[
            styles.notaClose,
            SUPPORTS_INSET_SHADOW
              ? { boxShadow: neo.shadows.insetSm }
              : { borderWidth: 1, borderColor: s.hairline },
          ]}
        >
          <Text maxFontSizeMultiplier={1.2} style={[styles.notaCloseGlyph, { color: s.notaCloseInk }]}>
            ×
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

// ─── ⑦ Sheet de historial ────────────────────────────────────────────

export interface HistorialSheetProps {
  mode: JardinMode
  weeks: HistorialWeekVM[]
  monthLabel: string
  onClose: () => void
  title?: string
}

/**
 * Sheet "Semanas anteriores" (HTML:300–329 · 7f). El handoff sólo lo dibuja en
 * claro; los tokens oscuros están derivados en `jardin-spec` [E].
 *
 * Entra con spring 350ms y los dots escalonan 40ms (②8). El scrim es el del
 * sistema, no un negro alpha (el vocabulario neumórfico usa color sólido).
 */
export function HistorialSheet({
  mode,
  weeks,
  monthLabel,
  onClose,
  title = 'Semanas anteriores',
}: HistorialSheetProps) {
  const s = JARDIN_SPEC[mode]
  const neo = neoTokens(mode)
  const reduceMotion = useReducedMotion()

  return (
    <View style={styles.sheetOverlay}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar"
        onPress={onClose}
        style={[styles.sheetScrim, { backgroundColor: neo.scrim }]}
      />
      <Animated.View
        entering={
          reduceMotion
            ? undefined
            : SlideInDown.springify().damping(22).stiffness(200).reduceMotion(ReduceMotion.System)
        }
        style={[styles.sheet, { backgroundColor: neo.sheet, boxShadow: neo.shadows.sheet }]}
      >
        <View style={[styles.sheetGrabber, { backgroundColor: neo.sheetHandle }]} />
        <View style={styles.sheetHead}>
          <Text maxFontSizeMultiplier={1.2} style={[styles.sheetTitle, { color: s.sheetTitleInk }]}>
            {title}
          </Text>
          <Text maxFontSizeMultiplier={1.2} style={[styles.sheetMonth, { color: s.sheetMonthInk }]}>
            {monthLabel}
          </Text>
        </View>
        {weeks.map((week, i) => (
          <RiseView
            key={week.range}
            delay={i * SHEET_DOT_STAGGER_MS}
            translateY={6}
            style={styles.sheetRow}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
              style={[styles.sheetRange, { color: s.sheetRangeInk }]}
            >
              {week.range}
            </Text>
            <View style={styles.sheetDots}>
              {week.dots.map((dot, j) => (
                <View key={j} style={[styles.sheetDot, { backgroundColor: historyDotColor(s, dot) }]} />
              ))}
            </View>
            <View
              style={[
                styles.sheetChip,
                {
                  backgroundColor:
                    week.chip.tone === 'ok' ? s.sheetChipOkBackground : s.sheetChipNeutralBackground,
                  boxShadow: s.sheetChipShadow,
                },
              ]}
            >
              <Text
                maxFontSizeMultiplier={1.2}
                style={[
                  styles.sheetChipText,
                  { color: week.chip.tone === 'ok' ? s.sheetChipOkInk : s.sheetChipNeutralInk },
                ]}
              >
                {week.chip.text}
              </Text>
            </View>
          </RiseView>
        ))}
      </Animated.View>
    </View>
  )
}

// ─── ⑧ Skeleton de carga (①8) ────────────────────────────────────────

/** Placa de pozo con el shimmer de 1.2s. */
function SkeletonWell({
  s,
  style,
  animated,
}: {
  s: JardinSpec
  style: StyleProp<ViewStyle>
  animated: boolean
}) {
  const sheen = useSharedValue(1)
  useLoopAnimation(
    () => {
      if (!animated) return
      sheen.value = withRepeat(
        withSequence(
          withTiming(SKELETON_FLOOR, { duration: SKELETON_LEG_MS, easing: EASE_IN_OUT }),
          withTiming(1, { duration: SKELETON_LEG_MS, easing: EASE_IN_OUT }),
        ),
        -1,
        false,
      )
    },
    [sheen],
    [animated],
  )
  const sheenStyle = useAnimatedStyle(() => ({ opacity: animated ? sheen.value : 1 }))
  return (
    <Animated.View
      style={[style, wellStyle(s, s.ringWellBackground, s.ringWellShadow), sheenStyle]}
    />
  )
}

export interface JardinSkeletonProps {
  mode: JardinMode
  animated?: boolean
}

/** ①8 — "skeleton de pozos": los huecos donde van el hero, el aro y la fila. */
export function JardinSkeleton({ mode, animated = true }: JardinSkeletonProps) {
  const s = JARDIN_SPEC[mode]
  const reduceMotion = useReducedMotion()
  const motion = animated && !reduceMotion
  const focus = JARDIN_GEOMETRY.ringFocus
  const day = JARDIN_GEOMETRY.ringDay

  return (
    <View>
      <SkeletonWell s={s} animated={motion} style={styles.skeletonHero} />
      <View style={[styles.card, neoMaterial(mode, 'raisedLg')]}>
        <View style={styles.cardHead}>
          <SkeletonWell s={s} animated={motion} style={styles.skeletonTitle} />
          <SkeletonWell s={s} animated={motion} style={styles.skeletonTag} />
        </View>
        <View style={styles.focusBlock}>
          <SkeletonWell
            s={s}
            animated={motion}
            style={{ width: focus.size, height: focus.size, borderRadius: focus.size / 2 }}
          />
          <SkeletonWell s={s} animated={motion} style={styles.skeletonChip} />
        </View>
        <View style={styles.daysRow}>
          {Array.from({ length: 7 }, (_, i) => (
            <SkeletonWell
              key={i}
              s={s}
              animated={motion}
              style={{ width: day.size, height: day.size, borderRadius: day.size / 2 }}
            />
          ))}
        </View>
      </View>
      <SkeletonWell s={s} animated={motion} style={styles.skeletonCard} />
      <SkeletonWell s={s} animated={motion} style={styles.skeletonCard} />
    </View>
  )
}

// ─── Estado + datos demo de la pantalla auto-conducida ───────────────

/**
 * Estado del mock. El preview (T6) siembra cada seed de la matriz con un
 * `Partial<JardinDemoState>`; la pantalla se conduce sola desde ahí.
 */
export interface JardinDemoState {
  heroKind: HeroKind
  /** Registros de HOY. Cada uno adelanta 6 h = 25% del aro (§3.3). */
  registros: number
  /** HOY marcado como día sin gastos (D4). */
  noSpend: boolean
  /** Tono del cupo (§3.3): verde dentro · ámbar fuera · celeste sin datos. */
  tone: RingTone
  /** ②5 — los 7 días plantados: la semana florecida. */
  florecida: boolean
  /** ②6 — el lunes de la fila va perdido. */
  diaPerdido: boolean
  /**
   * ②4 en un día PASADO: el martes queda en calma (anillo doble + `calmaRing`
   * + `zen`). Es un estado distinto de `today` + `noSpend` —el pozo no lleva el
   * tinte de HOY— y el mockup no lo dibuja, así que va apagado por defecto.
   */
  diaCalmaPasado: boolean
  /** Día recuperado por escudo: lleno coral (§3.4). Apagado por defecto. */
  diaRecuperado: boolean
  /** ②9/③6 — primera semana: sin historial ni card de semana pasada. */
  primeraSemana: boolean
  semanaPasadaVariant: WeekCloseVariant | null
  /** ③5 — el cierre está disponible y todavía no se abrió. */
  semanaPasadaUnseen: boolean
  showSheet: boolean
  noteDismissed: boolean
  /** ①8. */
  loading: boolean
}

export const JARDIN_INITIAL_STATE: JardinDemoState = {
  heroKind: 'aTiempo',
  registros: 3,
  noSpend: false,
  tone: 'water',
  florecida: false,
  diaPerdido: false,
  diaCalmaPasado: false,
  diaRecuperado: false,
  primeraSemana: false,
  semanaPasadaVariant: 'perfecta',
  semanaPasadaUnseen: false,
  showSheet: false,
  noteDismissed: false,
  loading: false,
}

type JardinAction =
  | { type: 'registrar' }
  | { type: 'marcarSinGastos' }
  | { type: 'toggleSheet' }
  | { type: 'dismissNote' }
  | { type: 'verCierre' }

function jardinReducer(st: JardinDemoState, a: JardinAction): JardinDemoState {
  switch (a.type) {
    case 'registrar':
      // ②2 "regando": cada gasto sube el aro y, al cuarto, el hero pasa a
      // "plantado". El aro NUNCA baja por registrar (§3.3).
      return {
        ...st,
        registros: st.registros + 1,
        heroKind: st.heroKind === 'floreciendo' ? 'floreciendo' : 'plantado',
      }
    case 'marcarSinGastos':
      return { ...st, noSpend: true, heroKind: 'plantado' }
    case 'toggleSheet':
      return { ...st, showSheet: !st.showSheet }
    case 'dismissNote':
      return { ...st, noteDismissed: true }
    case 'verCierre':
      return { ...st, semanaPasadaUnseen: false }
    default:
      return st
  }
}

/** Copy del hero por estado (mockups 2a–2f, neutralizado por [OWNER-1]). */
const HERO_COPY: Record<
  HeroKind,
  Omit<HeroVM, 'cta' | 'kind'> & { ctaText?: string; ctaTone?: 'green' | 'amber' }
> = {
  empezar: {
    label: 'EMPIEZA HOY',
    title: 'Planta tu primer brote',
    sub: 'Registra un gasto o un día sin gastos.',
    chip: { text: 'Sin racha aún', kind: 'neutral' },
    brotPose: 'seed',
    particleCount: 0,
    ctaText: 'Plantar mi primer brote',
    ctaTone: 'green',
  },
  aTiempo: {
    label: 'HOY · MARTES 7',
    title: 'Planta para sumar',
    sub: 'Vas 3 días seguidos. Suma el de hoy.',
    chip: { text: 'A tiempo', kind: 'ok' },
    brotPose: 'wave',
    particleCount: 8,
    ctaText: 'Plantar hoy',
    ctaTone: 'green',
  },
  plantado: {
    label: 'HOY · LISTO',
    title: '¡Brote plantado!',
    sub: 'Sumaste el día. Racha 4 ↑',
    chip: { text: 'Plantaste hoy', kind: 'ok' },
    pill: 'Listo por hoy · vuelve mañana para seguir',
    brotPose: 'love',
    particleCount: 10,
  },
  floreciendo: {
    label: 'TU JARDÍN',
    title: 'Floreciendo',
    sub: 'Racha 12 · récord 28 · 90% cuidado',
    chip: { text: 'Al día', kind: 'ok' },
    pill: 'Ver mi jardín ›',
    brotPose: 'radiant',
    // El mockup pide 14; ⑥2 topea en 12 y `JardinHero` lo clampea igual.
    particleCount: 12,
  },
  enRiesgo: {
    label: 'ESTA NOCHE · 22:40',
    title: 'Tu racha está en riesgo',
    sub: 'Racha 4 sin plantar hoy. Te queda poco.',
    chip: { text: 'En riesgo', kind: 'risk' },
    brotPose: 'worried',
    particleCount: 0,
    ctaText: 'Plantar antes de medianoche',
    ctaTone: 'amber',
  },
  cortada: {
    label: 'RACHA CORTADA',
    title: 'Se cortó tu racha',
    sub: 'Ayer no plantaste. Récord 28 guardado.',
    chip: { text: '✕ Perdida', kind: 'lost' },
    brotPose: 'sad',
    particleCount: 0,
    ctaText: 'Empezar de nuevo',
    ctaTone: 'green',
  },
}

const SEMANA_COPY: Record<WeekCloseVariant, { title: string; sub: string }> = {
  perfecta: { title: 'Semana pasada: perfecta', sub: 'Tu jardín floreció · 7 de 7 días' },
  buena: { title: 'Semana pasada: casi perfecta', sub: 'Te faltó un día · 6 de 7' },
  floja: { title: 'Semana pasada: floja', sub: 'Tu jardín aguantó · 3 de 7 días' },
  cortada: { title: 'Semana pasada: se cortó', sub: 'Tu récord sigue guardado · 1 de 7' },
}

const WEEK_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const
/** HOY en la fila demo (jueves), igual que el mockup. */
const TODAY_INDEX = 3
/** Hora local del mock — el status bar del handoff marca 9:41. */
const DEMO_HORA_LOCAL = 9.7

const HISTORIAL_DEMO: HistorialWeekVM[] = [
  {
    range: '19 – 25 may',
    dots: ['full', 'full', 'calma', 'full', 'full', 'full', 'full'],
    chip: { text: 'Florecida', tone: 'ok' },
  },
  {
    range: '12 – 18 may',
    dots: ['full', 'calma', 'missed', 'full', 'recovered', 'full', 'missed'],
    chip: { text: '5 de 7', tone: 'neutral' },
  },
  {
    range: '5 – 11 may',
    dots: ['full', 'full', 'full', 'full', 'full', 'full', 'full'],
    chip: { text: 'Florecida', tone: 'ok' },
  },
  {
    range: '28 abr – 4 may',
    dots: ['calma', 'missed', 'full', 'full', 'calma', 'missed', 'missed'],
    chip: { text: '4 de 7', tone: 'neutral' },
  },
]

/** Pose del aro grande — tabla del §5, única fuente. */
function focusPose(st: JardinDemoState): BrotPose {
  if (st.florecida) return 'radiant'
  if (st.noSpend) return 'zen'
  if (st.registros >= 4) return 'love'
  if (st.registros > 0) return 'sprout'
  return 'seed'
}

function focusChip(st: JardinDemoState): { dot: 'sand' | 'water' | 'green'; text: string } {
  if (st.noSpend) return { dot: 'green', text: 'Día en calma · tu brote creció el doble' }
  if (st.registros >= 4) return { dot: 'green', text: 'Día completo · tu brote creció un día entero' }
  if (st.registros > 0) {
    return { dot: 'water', text: `${st.registros} de 4 gastos registrados hoy` }
  }
  return { dot: 'sand', text: 'Tu brote espera el primer gasto de hoy' }
}

/**
 * Días demo de la fila. Se apoya en el modelo REAL (`crecimiento-model`) para
 * el adelanto, la etapa y el tamaño del brote: el preview tiene que mostrar la
 * curva que el cableado va a producir, no una imitación.
 */
function demoDays(st: JardinDemoState): DayRingVM[] {
  const pose = focusPose(st)
  return WEEK_LETTERS.map((letter, i) => {
    const ageDays = TODAY_INDEX - i
    const isToday = i === TODAY_INDEX
    const isFuture = i > TODAY_INDEX
    const perdido = st.diaPerdido && i === 0 && !st.florecida
    const pre = st.primeraSemana && i < TODAY_INDEX && !st.florecida
    const calmaPasado = st.diaCalmaPasado && i === 1 && !pre
    const recuperado = st.diaRecuperado && i === 2 && !pre
    const marcado = isToday ? st.noSpend : calmaPasado
    // Los días pasados demo van con 4 registros: llenos por [A]. El día en
    // calma y el recuperado no tienen gastos propios — su aro lo llenan la
    // marca (48 h) y el escudo.
    const sinGastos = perdido || pre || isFuture || calmaPasado || recuperado
    const registros = isToday ? st.registros : sinGastos ? 0 : 4
    const adelanto = deriveAdelanto({
      registros,
      marcadoSinGastos: marcado,
      discrecionales: marcado ? 0 : registros,
    })
    const horas = horasDeCrecimiento({ ageDays, horaLocal: DEMO_HORA_LOCAL, adelanto })

    let state: DayRingState
    if (isFuture) state = 'future'
    else if (pre) state = 'pre'
    else if (isToday) state = 'today'
    else if (perdido) state = 'missed'
    else if (calmaPasado) state = 'calma'
    else if (recuperado) state = 'recovered'
    else state = 'planted'

    const noSpend = isToday ? st.noSpend : calmaPasado
    // Tabla de poses del §5: `today` copia la del foco; el resto es fijo.
    const brotPose: BrotPose | null =
      state === 'future' || state === 'pre'
        ? null
        : state === 'today'
          ? pose
          : state === 'missed'
            ? 'wilted'
            : state === 'calma'
              ? 'zen'
              : state === 'recovered'
                ? 'seed'
                : 'idle'

    return {
      letter,
      state,
      pct: isToday
        ? Math.min(1, adelanto / ADELANTO_MAX)
        : state === 'planted' || state === 'calma' || state === 'recovered'
          ? 1
          : 0,
      tone: st.tone,
      noSpend,
      stage: etapaPorHoras(horas),
      brotPose,
      brotSize: brotSizeForHours(horas),
    }
  })
}

export interface JardinFinalScreenProps {
  mode: JardinMode
  /** Siembra del preview (T6): cada seed de la matriz es un `Partial`. */
  initialSeed?: Partial<JardinDemoState>
}

/**
 * Pantalla completa, AUTO-CONDUCIDA: el owner registra gastos, marca el día sin
 * gastos, abre el historial y descarta la nota, y la pantalla responde. El
 * preview sólo alterna tema y siembra el estado inicial.
 */
export function JardinFinalScreen({ mode, initialSeed }: JardinFinalScreenProps) {
  const neo = neoTokens(mode)
  const [state, dispatch] = useReducer(jardinReducer, {
    ...JARDIN_INITIAL_STATE,
    ...initialSeed,
  })

  const onRegistrar = useCallback(() => dispatch({ type: 'registrar' }), [])
  const onMarcar = useCallback(() => dispatch({ type: 'marcarSinGastos' }), [])
  const onToggleSheet = useCallback(() => dispatch({ type: 'toggleSheet' }), [])
  const onDismissNote = useCallback(() => dispatch({ type: 'dismissNote' }), [])
  const onVerCierre = useCallback(() => dispatch({ type: 'verCierre' }), [])

  const copy = HERO_COPY[state.heroKind]
  const heroVm: HeroVM = {
    kind: state.heroKind,
    label: copy.label,
    title: copy.title,
    sub: copy.sub,
    chip: copy.chip,
    pill: copy.pill,
    brotPose: copy.brotPose,
    particleCount: copy.particleCount,
    cta: copy.ctaText
      ? { text: copy.ctaText, tone: copy.ctaTone ?? 'green', onPress: onRegistrar }
      : undefined,
  }

  const chip = focusChip(state)
  const days = demoDays(state)
  const today = days[TODAY_INDEX]!
  const crecimientoVm: CrecimientoVM = {
    focus: {
      letter: today.letter,
      state: today.state,
      pct: today.pct,
      tone: today.tone,
      noSpend: today.noSpend,
      stage: today.stage,
      brotPose: focusPose(state),
      chipDot: chip.dot,
      chipText: chip.text,
    },
    days,
    footer: state.florecida
      ? { kind: 'cta', text: 'Ver cierre de semana ›', onPress: onVerCierre }
      : { kind: 'pill', text: 'Completa los 7 días y tu jardín florece' },
    secondary: state.noSpend
      ? undefined
      : { text: 'Marcar día sin gastos', onPress: onMarcar },
    history: state.primeraSemana
      ? null
      : {
          rows: HISTORIAL_DEMO.slice(0, 2).map((w) => w.dots),
          onOpen: onToggleSheet,
        },
  }

  // ③6 — la primera semana no tiene cierre que mostrar: la card no existe.
  const pasada = state.primeraSemana ? null : state.semanaPasadaVariant
  const semanaVm: SemanaPasadaVM | null = pasada
    ? {
        variant: pasada,
        title: SEMANA_COPY[pasada].title,
        sub: SEMANA_COPY[pasada].sub,
        unseenDot: state.semanaPasadaUnseen,
        onOpenCierre: onVerCierre,
      }
    : null

  const logrosVm: LogrosAccessVM = {
    // Mix D3 con códigos reales: `streak_90` es Brot (leyenda viva), la racha en
    // curso va como número, y el tercero es un secreto todavía sin revelar.
    medals: [
      { kind: 'brot', pose: 'radiant' },
      { kind: 'progress', current: 7 },
      { kind: 'secret' },
    ],
    // El "7 de 13 · próximo: 10 semanas florecidas" del handoff no existe: el
    // catálogo real es de 18 y ese logro se descartó (§4 del plan).
    countText: '7 de 18 · próximo: racha de 30 días',
    onPress: () => {},
  }

  return (
    <View style={[styles.shell, { backgroundColor: neo.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <HomeStatusBar mode={mode} />
        <View style={styles.content}>
          <JardinHeader mode={mode} />
          {state.loading ? (
            <JardinSkeleton mode={mode} />
          ) : (
            <>
              <RiseView translateY={CARD_RISE} style={styles.heroSpacing}>
                <JardinHero mode={mode} vm={heroVm} />
              </RiseView>
              <RiseView delay={CARD_STAGGER_MS} translateY={CARD_RISE}>
                <CrecimientoCard mode={mode} vm={crecimientoVm} />
              </RiseView>
              {semanaVm ? (
                <RiseView delay={CARD_STAGGER_MS * 2} translateY={CARD_RISE}>
                  <SemanaPasadaCard mode={mode} vm={semanaVm} />
                </RiseView>
              ) : null}
              <RiseView delay={CARD_STAGGER_MS * 3} translateY={CARD_RISE}>
                <LogrosAccessCard mode={mode} vm={logrosVm} />
              </RiseView>
              {state.noteDismissed ? null : (
                <RiseView delay={CARD_STAGGER_MS * 4} translateY={CARD_RISE}>
                  <NotaEducativa mode={mode} onDismiss={onDismissNote} />
                </RiseView>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {state.showSheet ? (
        <HistorialSheet
          mode={mode}
          weeks={HISTORIAL_DEMO}
          monthLabel="mayo"
          onClose={onToggleSheet}
        />
      ) : null}
    </View>
  )
}

// ─── Estilos ─────────────────────────────────────────────────────────
//
// UN solo `StyleSheet.create` para todo el kit, como en `gastos-screen` /
// `fijos-screen`: las medidas del handoff quedan juntas y se comparan de un
// vistazo contra el HTML.

const styles = StyleSheet.create({
  shell: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  content: { paddingHorizontal: 20, paddingTop: 10 },

  // ─── Header (HTML:29–41) ───
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  backButton: {
    width: JARDIN_GEOMETRY.backSize,
    height: JARDIN_GEOMETRY.backSize,
    borderRadius: JARDIN_GEOMETRY.backSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTexts: { flex: 1 },
  headerTitle: { fontSize: 30, fontWeight: '900', fontFamily: nunitoFamily('900'), lineHeight: 31.5 },
  headerSub: { fontSize: 12.5, fontWeight: '700', fontFamily: nunitoFamily('700'), marginTop: 2 },

  // ─── Hero 2a–2f (HTML:42–59) ───
  heroSpacing: { marginTop: 16 },
  hero: {
    borderRadius: JARDIN_GEOMETRY.radii.hero,
    paddingVertical: 19,
    paddingHorizontal: 18,
  },
  heroParticles: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: JARDIN_GEOMETRY.radii.hero,
    overflow: 'hidden',
  },
  heroAmberEdge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 4,
    backgroundColor: '#E8A664',
    borderTopLeftRadius: JARDIN_GEOMETRY.radii.hero,
    borderBottomLeftRadius: JARDIN_GEOMETRY.radii.hero,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroBrotSlot: { flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  heroHalo: { position: 'absolute' },
  heroTexts: { flex: 1, minWidth: 0 },
  heroLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.47,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    marginTop: 1,
    lineHeight: 23,
  },
  heroTitleXl: { fontSize: 27, lineHeight: 27 },
  heroTitleSm: { fontSize: 21, lineHeight: 22.7 },
  heroSub: { fontSize: 11.5, fontWeight: '700', fontFamily: nunitoFamily('700'), marginTop: 3 },
  heroCtaSpacing: { marginTop: 13 },
  heroCta: { borderRadius: 18, paddingVertical: 14, alignItems: 'center' },
  heroCtaText: { fontSize: 14.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  heroCtaTextAmber: { fontSize: 14 },
  heroPill: { marginTop: 13, borderRadius: 18, paddingVertical: 12, alignItems: 'center' },
  heroPillText: { fontSize: 12.5, fontWeight: '800', fontFamily: nunitoFamily('800') },

  // ─── Card "Tu jardín" (HTML:60–200) ───
  card: {
    marginTop: 16,
    borderRadius: JARDIN_GEOMETRY.radii.card,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '900', fontFamily: nunitoFamily('900') },
  cardTag: { fontSize: 11.5, fontWeight: '800', fontFamily: nunitoFamily('800') },

  focusBlock: { alignItems: 'center', marginTop: 12 },
  // SIN `overflow:'hidden'`: el pozo contiene un Brot y su tinta sobresale.
  ringWell: { alignItems: 'center', justifyContent: 'center' },
  calmaGlyphSlot: { position: 'absolute', right: 10, bottom: 10 },
  // Placa clara del sticker en oscuro (misma receta que `CategorySticker`).
  calmaGlyphPlate: { backgroundColor: '#F4F0E7', alignItems: 'center', justifyContent: 'center' },
  focusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 11,
    maxWidth: '100%',
    borderRadius: JARDIN_GEOMETRY.radii.chip,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  focusChipDot: {
    flexShrink: 0,
    width: JARDIN_GEOMETRY.chipDot,
    height: JARDIN_GEOMETRY.chipDot,
    borderRadius: JARDIN_GEOMETRY.chipDot / 2,
  },
  // Los chips del modelo real ("Día completo · tu brote creció un día entero")
  // son más largos que el demo del handoff: el texto encoge y envuelve en vez
  // de desbordar la card.
  focusChipText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    textAlign: 'center',
  },

  daysRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  dayCol: { alignItems: 'center', gap: 4 },
  dayRingBox: { alignItems: 'center', justifyContent: 'center' },
  dayLabel: { fontSize: 9.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
  dayLabelToday: { fontWeight: '900', fontFamily: nunitoFamily('900') },

  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: {
    width: JARDIN_GEOMETRY.legendDot,
    height: JARDIN_GEOMETRY.legendDot,
    borderRadius: JARDIN_GEOMETRY.legendDot / 2,
  },
  legendText: { fontSize: 9.5, fontWeight: '800', fontFamily: nunitoFamily('800') },

  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 4,
  },
  secondaryActionText: { fontSize: 12, fontWeight: '800', fontFamily: nunitoFamily('800') },

  footerSpacing: { marginTop: 13 },
  footerCta: { borderRadius: 18, paddingVertical: 13, alignItems: 'center' },
  footerCtaText: { fontSize: 13.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  footerPill: { borderRadius: 18, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center' },
  footerPillText: { fontSize: 12, fontWeight: '800', fontFamily: nunitoFamily('800') },

  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1.5,
  },
  historyLabel: { fontSize: 10.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
  historyDots: { flex: 1, gap: 4 },
  historyDotsRow: { flexDirection: 'row', gap: 5, justifyContent: 'flex-end' },
  historyDot: {
    width: JARDIN_GEOMETRY.historyDot,
    height: JARDIN_GEOMETRY.historyDot,
    borderRadius: JARDIN_GEOMETRY.historyDot / 2,
  },

  // ─── Semana pasada (HTML:201–209) ───
  semanaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 16,
    borderRadius: JARDIN_GEOMETRY.radii.cardSm,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  semanaTexts: { flex: 1, minWidth: 0 },
  semanaTitle: { fontSize: 14, fontWeight: '900', fontFamily: nunitoFamily('900') },
  semanaSub: { fontSize: 11.5, fontWeight: '700', fontFamily: nunitoFamily('700') },
  semanaCtaSlot: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  semanaCta: { borderRadius: 15, paddingVertical: 9, paddingHorizontal: 14 },
  semanaCtaText: { fontSize: 12, fontWeight: '900', fontFamily: nunitoFamily('900') },
  unseenDot: { width: 8, height: 8, borderRadius: 4 },

  // ─── Acceso a Logros (HTML:210–229) ───
  logrosCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    borderRadius: JARDIN_GEOMETRY.radii.cardSm,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  logrosStack: { flexShrink: 0, flexDirection: 'row', alignItems: 'center' },
  // SIN `overflow:'hidden'`: la medalla de Brot lo perdería la cabeza (D3).
  accessMedal: { alignItems: 'center', justifyContent: 'center' },
  accessMedalNumber: { fontSize: 14, fontWeight: '900', fontFamily: nunitoFamily('900') },
  accessMedalLocked: { fontSize: 15, fontWeight: '900', fontFamily: nunitoFamily('900') },
  logrosTexts: { flex: 1, minWidth: 0 },
  logrosTitle: { fontSize: 14.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  logrosSub: { fontSize: 11.5, fontWeight: '700', fontFamily: nunitoFamily('700') },
  chevronDisc: {
    flexShrink: 0,
    width: JARDIN_GEOMETRY.chevronDisc,
    height: JARDIN_GEOMETRY.chevronDisc,
    borderRadius: JARDIN_GEOMETRY.chevronDisc / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── Nota educativa (HTML:230) ───
  nota: {
    marginTop: 16,
    borderRadius: JARDIN_GEOMETRY.radii.nota,
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  notaText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 18.6,
    textAlign: 'center',
  },
  // Disco inset de 24px: la matriz ⑤2 exige el "×" y el handoff no le dio
  // visual, así que toma el vocabulario de disco hundido del propio jardín.
  notaClose: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notaCloseGlyph: { fontSize: 17, fontWeight: '800', fontFamily: nunitoFamily('800'), lineHeight: 19 },

  // ─── Sheet de historial (HTML:300–329) ───
  sheetOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' },
  sheetScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.72 },
  sheet: {
    borderTopLeftRadius: JARDIN_GEOMETRY.radii.sheet[0],
    borderTopRightRadius: JARDIN_GEOMETRY.radii.sheet[1],
    paddingTop: 12,
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: JARDIN_GEOMETRY.grabber.width,
    height: JARDIN_GEOMETRY.grabber.height,
    borderRadius: 3,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  sheetTitle: { fontSize: 15, fontWeight: '900', fontFamily: nunitoFamily('900') },
  sheetMonth: { fontSize: 11, fontWeight: '800', fontFamily: nunitoFamily('800') },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 13 },
  sheetRange: { flexShrink: 0, width: 88, fontSize: 10.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
  sheetDots: { flex: 1, flexDirection: 'row', gap: 6 },
  sheetDot: {
    width: JARDIN_GEOMETRY.sheetDot,
    height: JARDIN_GEOMETRY.sheetDot,
    borderRadius: JARDIN_GEOMETRY.sheetDot / 2,
  },
  sheetChip: { flexShrink: 0, borderRadius: 10, paddingVertical: 4, paddingHorizontal: 9 },
  sheetChipText: { fontSize: 9.5, fontWeight: '900', fontFamily: nunitoFamily('900') },

  // ─── Skeleton (①8) ───
  skeletonHero: { marginTop: 16, height: 168, borderRadius: JARDIN_GEOMETRY.radii.hero },
  skeletonTitle: { width: 96, height: 15, borderRadius: 7 },
  skeletonTag: { width: 84, height: 12, borderRadius: 6 },
  skeletonChip: { width: 190, height: 30, borderRadius: JARDIN_GEOMETRY.radii.chip, marginTop: 11 },
  skeletonCard: { marginTop: 16, height: 68, borderRadius: JARDIN_GEOMETRY.radii.cardSm },
})
