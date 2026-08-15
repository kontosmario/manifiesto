// @i18n-ignore-file — primitivas presentacionales del kit Control; no hay copy propio.
import { useEffect, useRef } from 'react'
import { Platform, Pressable, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated, {
  Easing,
  Keyframe,
  ReduceMotion,
  cancelAnimation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import { CONTROL_RADII, type ControlSpec } from '@/components/redesign/control/control-spec'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { usePressScale } from '@/hooks/use-press-scale'
import { decorativeDurations, motionEasings } from '@/lib/motion/tokens'
import { startPulseLoop } from '@/lib/motion/pulse-loop'
import { nunitoFamily } from '@/theme/typography'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * Primitivas compartidas del kit CONTROL (design_handoff_control).
 * Portan los 5 `@keyframes` del markup a Reanimated:
 *  · `ctlDot`  → `CtlGlowDot` (halo pulsante detrás del punto — el glow
 *    de `box-shadow` 5→12px del markup se representa como un círculo
 *    semitransparente con opacity/scale en loop, mismo lenguaje que el
 *    `fijosLive` dot; animar el string de boxShadow por frame no).
 *  · `ctlKnob` → `CtlKnob` (idéntico mecanismo para la perilla HOY).
 *  · `ctlGrowX`/`ctlGrowY` → `GrowView` (entering Keyframe scaleX/Y
 *    0→1 con `transformOrigin`, curva = motionEasings.standard, que es
 *    EXACTAMENTE el cubic-bezier(0.22,0.9,0.3,1) del markup).
 *  · `ctlRing` → `ScoreRing` (strokeDashoffset animado vía
 *    useAnimatedProps sobre el Circle de react-native-svg).
 *  · `ctlRise` (entrada de secciones) NO vive acá: es `RiseView` con los
 *    delays escalonados del markup, lo monta el screen.
 *
 * Todos los loops respetan `animated === false` (reduced motion del
 * proyecto vía @/hooks/use-reduced-motion, decidido por el caller) y
 * los one-shots además gatean con ReduceMotion.System.
 */

// ─── ctlDot — punto con glow pulsante ─────────────────────────────────

export interface CtlGlowDotProps {
  color: string
  /** Diámetro del punto sólido (7 el trigger de ciclo, 8 las cards). */
  size?: number
  /** false = halo estático a media intensidad (sin loop). */
  animated?: boolean
  style?: StyleProp<ViewStyle>
}

export function CtlGlowDot({ color, size = 8, animated = true, style }: CtlGlowDotProps) {
  const reduceMotion = useReducedMotion()
  const loop = animated && !reduceMotion
  const pulse = useSharedValue(0)

  useEffect(() => {
    // Reduced motion conserva su reposo documentado (halo a media intensidad).
    if (reduceMotion) {
      cancelAnimation(pulse)
      pulse.value = 0.5
      return
    }
    // Pausa por foco: SÓLO cancelar. Escribir el valor acá (y resetear a 0 al
    // reanudar) se veía en las dos puntas de la transición de tab — ver
    // `startPulseLoop`.
    if (!loop) {
      cancelAnimation(pulse)
      return
    }
    startPulseLoop(pulse, {
      duration: decorativeDurations.ctlDotPulse,
      easing: motionEasings.warm,
    })
    return () => cancelAnimation(pulse)
  }, [loop, pulse, reduceMotion])

  // Opacidad BAJA a propósito: el markup difumina el glow con un
  // `box-shadow` (blur 5→12px) y acá el halo es un disco sólido sin
  // blur. Con alfa alta lee como una pelota alrededor del punto en vez
  // de un resplandor — el rango 0.10→0.30 reproduce la lectura del
  // mockup (mismo criterio que el `cycTrigDotGlow` translúcido de
  // Fijos, que resuelve el glow con un color ya de alfa baja).
  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.1, 0.3]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1.6, 2.6]) }],
  }))

  const dot: ViewStyle = { width: size, height: size, borderRadius: size / 2, backgroundColor: color }
  const halo: ViewStyle = {
    position: 'absolute',
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: color,
  }
  return (
    <View style={[styles.dotWrap, style]}>
      <Animated.View pointerEvents="none" style={[halo, haloStyle]} />
      <View style={dot} />
    </View>
  )
}

// ─── ctlKnob — perilla HOY del timeline con glow pulsante ─────────────

export interface CtlKnobProps {
  /** Fill del disco (p.ej. #EFF6E2). */
  color: string
  /** Color del glow (p.ej. rgba(201,243,198,1)). */
  glowColor: string
  size?: number
  animated?: boolean
  style?: StyleProp<ViewStyle>
}

export function CtlKnob({ color, glowColor, size = 14, animated = true, style }: CtlKnobProps) {
  const reduceMotion = useReducedMotion()
  const loop = animated && !reduceMotion
  const pulse = useSharedValue(0)

  useEffect(() => {
    // Mismo criterio que CtlGlowDot: reposo fijo con reduced motion, congelado
    // en su lugar cuando la pausa es por foco.
    if (reduceMotion) {
      cancelAnimation(pulse)
      pulse.value = 0.5
      return
    }
    if (!loop) {
      cancelAnimation(pulse)
      return
    }
    startPulseLoop(pulse, {
      duration: decorativeDurations.ctlKnobPulse,
      easing: motionEasings.warm,
    })
    return () => cancelAnimation(pulse)
  }, [loop, pulse, reduceMotion])

  // Mismo criterio que CtlGlowDot: sin blur real, un disco de alfa alta
  // lee como pelota. La perilla sí lleva algo más de presencia que los
  // dots (es el marcador de HOY del timeline).
  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.16, 0.42]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1.5, 2.2]) }],
  }))

  const knob: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: color,
    // La capa NO pulsante del markup: `0 2px 5px rgba(20,45,25,0.4)`.
    boxShadow: '0 2px 5px rgba(20,45,25,0.4)',
  }
  const halo: ViewStyle = {
    position: 'absolute',
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: glowColor,
  }
  return (
    <View style={[styles.dotWrap, style]}>
      <Animated.View pointerEvents="none" style={[halo, haloStyle]} />
      <View style={knob} />
    </View>
  )
}

// ─── ctlGrowX / ctlGrowY — barras que crecen desde su origen ──────────

export interface GrowViewProps {
  axis: 'x' | 'y'
  /** ms — mapea a decorativeDurations.growBar{Fast,,Slow} (.6/.7/.8s). */
  duration?: number
  delay?: number
  /** true = render directo al estado final (sin Keyframe). */
  skipEntering?: boolean
  style?: StyleProp<ViewStyle>
  children?: React.ReactNode
}

/**
 * Port de `ctlGrowX`/`ctlGrowY`: entering Keyframe scale 0→1 anclado al
 * origen (`transformOrigin` left/bottom). Mismo razonamiento que
 * RiseView: el Keyframe se aplica antes del primer paint (sin flash) y
 * en web se salta (soporte parcial de layout animations).
 */
export function GrowView({
  axis,
  duration = decorativeDurations.growBar,
  delay = 0,
  skipEntering = false,
  style,
  children,
}: GrowViewProps) {
  const entering =
    axis === 'x'
      ? new Keyframe({
          0: { transform: [{ scaleX: 0 }] },
          100: { transform: [{ scaleX: 1 }], easing: motionEasings.standard },
        })
          .duration(duration)
          .delay(delay)
          .reduceMotion(ReduceMotion.System)
      : new Keyframe({
          0: { transform: [{ scaleY: 0 }] },
          100: { transform: [{ scaleY: 1 }], easing: motionEasings.standard },
        })
          .duration(duration)
          .delay(delay)
          .reduceMotion(ReduceMotion.System)

  const origin: ViewStyle = { transformOrigin: axis === 'x' ? 'left center' : 'center bottom' }

  if (Platform.OS === 'web') {
    // Sin `origin`: en web no corre el Keyframe, así que el
    // transform-origin no tiene nada que anclar — y react-native-web lo
    // pasa crudo al DOM ("Invalid DOM property transform-origin").
    return <View style={style}>{children}</View>
  }
  return (
    <Animated.View entering={skipEntering ? undefined : entering} style={[origin, style]}>
      {children}
    </Animated.View>
  )
}

// ─── ctlRing — anillo del score que se dibuja ─────────────────────────

export interface ScoreRingProps {
  /** 0–100. */
  score: number
  spec: ControlSpec
  /** Lado del svg (56 en el header). */
  size?: number
  animated?: boolean
}

/** r=22, strokeWidth=6, C=138.2 — geometría literal del markup. El
 *  progreso anima strokeDashoffset C→final en 1.1s con la curva
 *  cubic-bezier(0.3,0.9,0.3,1) del markup (propia de ctlRing, distinta
 *  de la standard — se transcribe literal). */
export function ScoreRing({ score, spec, size = 56, animated = true }: ScoreRingProps) {
  const reduceMotion = useReducedMotion()
  const r = (size / 56) * 22
  const strokeWidth = (size / 56) * 6
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, score)) / 100
  const progress = useSharedValue(0)
  /**
   * Último valor YA dibujado. El efecto tiene `animated` en las deps y el
   * screen lo cablea como `animated && isFocused`, así que cada entrada a la
   * tab lo hacía pasar de false a true y el anillo se re-dibujaba desde 0
   * durante 1,1 s — con el número del centro ya escrito. Se leía como si la
   * pantalla se estuviera recargando, y `useIsFocused()` flipea al ARRANQUE de
   * la transición, así que el reset caía con el anillo ya en pantalla.
   *
   * El latch es por VALOR y no por bandera: el trazo vuelve a correr cuando el
   * puntaje CAMBIA de verdad (que es cuando significa algo), y en las
   * re-entradas el anillo aparece completo. Si el score cambió mientras Control
   * estaba sin foco, `clamped` difiere y el dibujo corre al volver.
   */
  const drawnForRef = useRef<number | null>(null)

  useEffect(() => {
    if (!animated || reduceMotion) {
      cancelAnimation(progress)
      progress.value = clamped
      return
    }
    if (drawnForRef.current === clamped) {
      progress.value = clamped
      return
    }
    drawnForRef.current = clamped
    progress.value = 0
    progress.value = withTiming(clamped, {
      duration: decorativeDurations.scoreRingDraw,
      easing: Easing.bezier(0.3, 0.9, 0.3, 1),
    })
    return () => cancelAnimation(progress)
  }, [animated, clamped, progress, reduceMotion])

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: c * (1 - progress.value),
  }))

  const center = size / 2
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={center} cy={center} r={r} fill="none" stroke={spec.scoreTrack} strokeWidth={strokeWidth} />
      <AnimatedCircle
        animatedProps={animatedProps}
        cx={center}
        cy={center}
        fill="none"
        r={r}
        rotation={-90}
        origin={`${center}, ${center}`}
        stroke={spec.scoreStroke}
        strokeDasharray={`${c}`}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
      />
    </Svg>
  )
}

// ─── Shells compartidos ───────────────────────────────────────────────

export interface ControlCardProps {
  spec: ControlSpec
  style?: StyleProp<ViewStyle>
  children: React.ReactNode
}

/** Card de sección: radius 26, padding 15/15/14, raise + gradiente 145deg
 *  en oscuro. */
export function ControlCard({ spec, style, children }: ControlCardProps) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: spec.cardBackground, boxShadow: spec.cardShadow },
        spec.cardGradientCss ? { experimental_backgroundImage: spec.cardGradientCss } : null,
        style,
      ]}
    >
      {children}
    </View>
  )
}

export interface SectionLabelProps {
  spec: ControlSpec
  label: string
  style?: StyleProp<TextStyle>
}

/** COMPARATIVA / TENDENCIA / HÁBITO / REPARTO / META. */
export function SectionLabel({ spec, label, style }: SectionLabelProps) {
  return <Text style={[styles.sectionLabel, { color: spec.sectionLabelInk }, style]}>{label}</Text>
}

export interface CardHeaderRowProps {
  spec: ControlSpec
  /** Color del dot de la izquierda (verde/naranja según estado). */
  dotColor: string
  /** false = dot estático (hábito/reparto/meta no laten en el markup). */
  dotAnimated?: boolean
  title: string
  /** Pill de veredicto a la derecha (armada por el caller). */
  right?: React.ReactNode
}

/** Fila superior de cada card: dot + título tracking 0.13em + pill. */
export function CardHeaderRow({ spec, dotColor, dotAnimated = false, title, right }: CardHeaderRowProps) {
  return (
    <View style={styles.cardHeaderRow}>
      <View style={styles.cardHeaderLeft}>
        <CtlGlowDot animated={dotAnimated} color={dotColor} size={8} />
        <Text numberOfLines={1} style={[styles.cardHeaderTitle, { color: spec.sub }]}>
          {title}
        </Text>
      </View>
      {right}
    </View>
  )
}

export interface VerdictPillProps {
  spec: ControlSpec
  ink: string
  label: string
  /** Ícono chico opcional a la izquierda (Svg armado por el caller). */
  icon?: React.ReactNode
  /** Fill sólido (pills del hero); si falta, va hundida con insMd. */
  background?: string
  /** Sombra explícita (pills flotantes del hero); default insMd. */
  shadow?: string
  style?: StyleProp<ViewStyle>
}

/** Pill de veredicto (radius 12, padding 5/10, 10.5/900). */
export function VerdictPill({ spec, ink, label, icon, background, shadow, style }: VerdictPillProps) {
  return (
    <View
      style={[
        styles.verdictPill,
        background ? { backgroundColor: background } : null,
        { boxShadow: shadow ?? (background ? undefined : spec.insMd) },
        style,
      ]}
    >
      {icon}
      <Text style={[styles.verdictPillLabel, { color: ink }]}>{label}</Text>
    </View>
  )
}

export interface InsetRowProps {
  spec: ControlSpec
  radius?: number
  style?: StyleProp<ViewStyle>
  children: React.ReactNode
}

/** Fila hundida genérica (insMd) — "Donde más gastaste", chips de meta,
 *  chips de insight. */
export function InsetRow({ spec, radius = CONTROL_RADII.topCatRow, style, children }: InsetRowProps) {
  return <View style={[styles.insetRow, { borderRadius: radius, boxShadow: spec.insMd }, style]}>{children}</View>
}

export interface RadialCtaProps {
  spec: ControlSpec
  label: string
  onPress?: () => void
  accessibilityLabel?: string
  radius?: number
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
}

/** CTA radial verde ("Sumar ahora" / "Definir ›" / "Ver fijos ›"). */
export function RadialCta({ spec, label, onPress, accessibilityLabel, radius = CONTROL_RADII.cta, style, textStyle }: RadialCtaProps) {
  const press = usePressScale({ pressedScale: 0.96 })
  const body = (
    <View
      style={[
        styles.radialCta,
        {
          borderRadius: radius,
          backgroundColor: spec.ctaRadialFallback,
          experimental_backgroundImage: spec.ctaRadialCss,
          boxShadow: spec.ctaShadow,
        },
        style,
      ]}
    >
      <Text style={[styles.radialCtaLabel, { color: spec.ctaInk }, textStyle]}>{label}</Text>
    </View>
  )
  if (!onPress) return body
  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.animatedStyle}
    >
      {body}
    </AnimatedPressable>
  )
}

export interface GhostCtaProps {
  spec: ControlSpec
  label: string
  onPress?: () => void
  radius?: number
  style?: StyleProp<ViewStyle>
}

/** CTA secundaria hundida ("Editar meta" / "Ver en qué se fue"). */
export function GhostCta({ spec, label, onPress, radius = CONTROL_RADII.cta, style }: GhostCtaProps) {
  const press = usePressScale({ pressedScale: 0.96 })
  const body = (
    <View style={[styles.ghostCta, { borderRadius: radius, boxShadow: spec.insMd }, style]}>
      <Text style={[styles.radialCtaLabel, { color: spec.ctaGhostInk }]}>{label}</Text>
    </View>
  )
  if (!onPress) return body
  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.animatedStyle}
    >
      {body}
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  dotWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: CONTROL_RADII.card,
    paddingBottom: 14,
    paddingHorizontal: 15,
    paddingTop: 15,
  },
  sectionLabel: {
    fontFamily: nunitoFamily('800'),
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 11 * 0.16,
    paddingHorizontal: 2,
    textTransform: 'uppercase',
  },
  cardHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardHeaderLeft: {
    alignItems: 'center',
    columnGap: 7,
    flexDirection: 'row',
    flexShrink: 1,
    marginRight: 8,
  },
  cardHeaderTitle: {
    flexShrink: 1,
    fontFamily: nunitoFamily('800'),
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 11 * 0.13,
    textTransform: 'uppercase',
  },
  verdictPill: {
    alignItems: 'center',
    borderRadius: CONTROL_RADII.verdictPill,
    columnGap: 5,
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  verdictPillLabel: {
    fontFamily: nunitoFamily('900'),
    fontSize: 10.5,
    fontWeight: '900',
  },
  insetRow: {
    alignItems: 'center',
    columnGap: 8,
    flexDirection: 'row',
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  radialCta: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  radialCtaLabel: {
    fontFamily: nunitoFamily('900'),
    fontSize: 11,
    fontWeight: '900',
  },
  ghostCta: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
})
