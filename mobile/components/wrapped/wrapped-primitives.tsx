import { useEffect, type ReactNode } from 'react'
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { BrotMascot, type BrotPose } from '@/components/brot'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { decorativeDurations, motionEasings } from '@/lib/motion/tokens'
import { cssGradient } from '@/theme/neo-tokens'
import { useThemeTokens } from '@/theme/theme-provider'
import { nunitoFamily, safeLineHeight } from '@/theme/typography'
import {
  WRAPPED_ANIM,
  wrappedSpec,
  type WrChipTokens,
  type WrTypeToken,
  type WrappedSpec,
} from './wrapped-spec'

/**
 * Primitivas visuales del Wrapped "La Edición" — el vocabulario que las
 * escenas componen. Todas resuelven el tema por `useWrappedSpec()`: el
 * wrapped SIGUE EL TEMA DEL SISTEMA ([OWNER-1] — decisión del owner
 * 2026-08-13), nocturno en oscuro y material del sistema en claro.
 *
 * Reglas heredadas del repo que estas primitivas encapsulan:
 *   · `boxShadow` inset se DESCARTA en silencio en Android < API 29 →
 *     los pozos caen a un hairline (`SUPPORTS_INSET_SHADOW`).
 *   · `fontFamily` SIEMPRE junto a `fontWeight` (regla ESLint — Nunito
 *     no resuelve por peso solo).
 *   · Nada de `Intl` en worklets; los montos formateados llegan como
 *     string o van por `CountUpText`.
 *   · Todo lo decorativo gatea por `active` (la escena visible).
 */

/** El spec del wrapped resuelto contra el tema vigente del sistema. */
export function useWrappedSpec(): WrappedSpec {
  const theme = useThemeTokens()
  return wrappedSpec(theme.mode)
}

/**
 * Aire de la escena según densidad — el primer absorbente cuando la
 * pantalla es más baja que el frame del handoff (ver `compact` en
 * SceneRenderArgs). Comprime al 60 %: es el margen que el propio handoff
 * declara elástico (ancla arriba con margin-top fijos + sobrante a auto).
 */
export function wrGap(base: number, compact: boolean): number {
  return compact ? Math.round(base * 0.6) : base
}

/**
 * Alto de un bloque fijo grande (sello 206, Brot 104/150…) según
 * densidad. 0.82 mantiene la jerarquía del diseño y recupera ~37pt en el
 * sello y ~19pt en un Brot de 104 — suficiente para que las escenas más
 * cargadas entren en un iPhone SE sin tocar tipografía.
 */
export function wrBlock(base: number, compact: boolean): number {
  return compact ? Math.round(base * 0.82) : base
}

/**
 * Texto del wrapped — SIN escalado de fuente del OS.
 *
 * La Edición es una réplica pixel-perfect del handoff: la composición
 * (sello 206px, rank 58px, montos 56px, tracking 0.24em) está calculada
 * para el frame de 393 y NO tiene dónde crecer. Con el escalado del OS
 * activo (multiplicador default 1.4 de RN) los labels trackeados y los
 * nombres del ranking desbordaban el borde ("texto cortado", QA del
 * owner 2026-08-13); intentar compensar con `adjustsFontSizeToFit`
 * encogió las categorías de más (iOS ajusta contra ancho Y alto de
 * línea). El recap es decorativo y dura segundos: se fija la escala del
 * diseño, mismo criterio que las réplicas de los otros handoffs.
 */
export function WrText(props: TextProps) {
  return <Text allowFontScaling={false} {...props} />
}

// ─── Tipografía ──────────────────────────────────────────────────────

/** Token tipográfico del spec → TextStyle RN (Nunito por peso;
 *  `letterSpacing = size × em`; `lineHeight` elevado al piso seguro por
 *  `safeLineHeight()` — la regla y sus métricas viven en
 *  `@/theme/typography`, compartidas con el resto de la app). */
export function wrType(
  t: WrTypeToken,
  opts?: {
    /** El contenido es sólo números/moneda → piso 1.2 en vez de 1.32. */
    numeric?: boolean
  },
): TextStyle {
  const weight = String(t.weight) as TextStyle['fontWeight']
  return {
    fontSize: t.size,
    fontWeight: weight,
    fontFamily: nunitoFamily(weight),
    ...(t.letterSpacingEm != null
      ? { letterSpacing: t.size * t.letterSpacingEm }
      : null),
    // Sin `lineHeight` declarado, iOS usa la caja natural de la fuente
    // (1.364) y nunca recorta — no hay nada que elevar.
    ...(t.lineHeight != null
      ? { lineHeight: safeLineHeight(t.size, t.lineHeight, opts) }
      : null),
    color: t.ink,
  }
}

// ─── Pozos inset (fallback Android viejo) ────────────────────────────

/** Estilo de pozo inset con el fallback del repo: si el device no dibuja
 *  inset (`Android < API 29`), un hairline sutil delimita el pozo. El
 *  color del hairline sale del spec (`shell.wellHairline`). */
export function wrWell(args: {
  bg: string
  boxShadow: string
  radius: number
  hairline: string
}): ViewStyle {
  return {
    backgroundColor: args.bg,
    borderRadius: args.radius,
    ...(SUPPORTS_INSET_SHADOW
      ? { boxShadow: args.boxShadow }
      : { borderWidth: 1, borderColor: args.hairline }),
  }
}

// ─── Tag editorial ───────────────────────────────────────────────────

/** Tag durazno "CIERRE DE CICLO" / "QUEDA UN SOBRANTE"… (HTML:46).
 *  A tamaño del diseño — el escalado del OS ya está fijado en WrText. */
export function WrTag({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  const spec = useWrappedSpec()
  return (
    <WrText numberOfLines={1} style={[wrType(spec.portada.tag), style]}>
      {children}
    </WrText>
  )
}

// ─── Chip inset ──────────────────────────────────────────────────────

/** Chip inset chico (rango en portada / decisión en contratapa). */
export function WrChip({
  children,
  tokens,
  style,
}: {
  children: ReactNode
  tokens: WrChipTokens
  style?: StyleProp<ViewStyle>
}) {
  const spec = useWrappedSpec()
  return (
    <View
      style={[
        {
          alignSelf: 'center',
          paddingVertical: tokens.paddingV,
          paddingHorizontal: tokens.paddingH,
          ...wrWell({
            bg: tokens.bg,
            boxShadow: tokens.boxShadow,
            radius: tokens.radius,
            hairline: spec.shell.wellHairline,
          }),
        },
        style,
      ]}
    >
      {/* El chip del rango llega a ~30 glifos trackeados: una línea con
          elipsis de último recurso (a escala del diseño entra en 393). */}
      <WrText numberOfLines={1} style={[wrType(tokens), styles.center]}>
        {children}
      </WrText>
    </View>
  )
}

// ─── Burbuja de Brot ─────────────────────────────────────────────────

export interface WrBrotBubbleProps {
  pose: BrotPose
  size: number
  /** Lado donde está BROT — la cola de la burbuja apunta hacia él. */
  side: 'left' | 'right'
  text: string
  /** La escena visible — gatea la animación idle de Brot. */
  active: boolean
  maxWidth?: number
  /** Burbuja compacta del paso 06 (padding 10×13, 12/700). */
  compact?: boolean
}

/** Brot + su burbuja raised (radius 18/18/18/4 o espejada). HTML:59/82 */
export function WrBrotBubble({
  pose,
  size,
  side,
  text,
  active,
  maxWidth,
  compact = false,
}: WrBrotBubbleProps) {
  const spec = useWrappedSpec()
  const b = spec.shell.burbuja
  const c = compact ? spec.destino.burbuja : b
  const bubble = (
    <View
      style={[
        cssGradient(b.bgCss, b.bgFallback),
        {
          paddingVertical: c.paddingV,
          paddingHorizontal: c.paddingH,
          boxShadow: b.boxShadow,
          borderRadius: b.radius,
          ...(side === 'left'
            ? { borderBottomLeftRadius: b.tailRadius }
            : { borderBottomRightRadius: b.tailRadius }),
          ...(maxWidth != null ? { maxWidth } : null),
          flexShrink: 1,
        },
      ]}
    >
      <WrText
        style={wrType({
          size: c.size,
          weight: c.weight,
          lineHeight: b.lineHeight,
          ink: b.ink,
        })}
      >
        {text}
      </WrText>
    </View>
  )
  // La tinta de Brot sobresale ~12u de su caja — NUNCA overflow:hidden
  // en ningún ancestro de esta fila (feedback_brot_tinta_fuera_de_su_caja).
  const brot = <BrotMascot pose={pose} size={size} animated={active} shadow={false} />
  return (
    <View style={styles.brotRow}>
      {side === 'left' ? brot : bubble}
      {side === 'left' ? bubble : brot}
    </View>
  )
}

// ─── CTA primario + link ─────────────────────────────────────────────

/** CTA del pie — crema plana en oscuro, radial verde del sistema en
 *  claro (el spec decide vía `cta.bgCss`). */
export function WrCta({
  label,
  onPress,
  disabled = false,
  busy = false,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  busy?: boolean
}) {
  const spec = useWrappedSpec()
  const press = usePressScale({ pressedScale: 0.97 })
  const c = spec.shell.cta
  return (
    <Animated.View style={press.animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: disabled || busy, busy }}
        disabled={disabled || busy}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[
          c.bgCss ? cssGradient(c.bgCss, c.bg) : { backgroundColor: c.bg },
          {
            borderRadius: c.radius,
            paddingVertical: c.paddingV,
            alignItems: 'center',
            boxShadow: c.boxShadow,
            opacity: disabled ? 0.55 : busy ? 0.75 : 1,
          },
        ]}
      >
        <WrText style={wrType({ size: c.size, weight: c.weight, ink: c.ink })}>
          {label}
        </WrText>
      </Pressable>
    </Animated.View>
  )
}

/** Link secundario de la contratapa. */
export function WrLink({ label, onPress }: { label: string; onPress: () => void }) {
  const spec = useWrappedSpec()
  const l = spec.contratapa.link
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
    >
      <WrText style={wrType({ size: l.size, weight: l.weight, ink: l.ink })}>
        {label}
      </WrText>
    </Pressable>
  )
}

// ─── Marcador de página ──────────────────────────────────────────────

/** "N DE M" al pie. HTML:62 */
export function WrMarker({ text }: { text: string }) {
  const spec = useWrappedSpec()
  return (
    <WrText numberOfLines={1} style={[wrType(spec.shell.marker), styles.center]}>
      {text}
    </WrText>
  )
}

// ─── Barra de progreso story ─────────────────────────────────────────

function WrProgressSegment({
  filled,
  spec,
}: {
  filled: boolean
  spec: WrappedSpec
}) {
  const fill = useSharedValue(filled ? 1 : 0)
  useEffect(() => {
    fill.value = withTiming(filled ? 1 : 0, {
      duration: decorativeDurations.wrappedSegment,
      easing: motionEasings.enterSmooth,
    })
  }, [filled, fill])
  const style = useAnimatedStyle(() => ({ opacity: fill.value }))
  const p = spec.shell.progress
  return (
    <View
      style={{
        flex: 1,
        height: p.height,
        borderRadius: p.radius,
        backgroundColor: p.rest,
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={[
          { flex: 1, borderRadius: p.radius, backgroundColor: p.active },
          style,
        ]}
      />
    </View>
  )
}

/** Barra de N segmentos — el recorrido (≤ actual) va en el acento pleno. */
export function WrProgressBar({ count, current }: { count: number; current: number }) {
  const spec = useWrappedSpec()
  return (
    <View style={[styles.progressRow, { gap: spec.shell.progress.gap }]}>
      {Array.from({ length: count }, (_, idx) => (
        <WrProgressSegment key={idx} filled={idx <= current} spec={spec} />
      ))}
    </View>
  )
}

// ─── Estampa del veredicto ───────────────────────────────────────────

export interface WrStampProps {
  label: string
  ink: string
  rotateDeg: number
  /** 'sella' = scale 1.4→1 + settle con haptic medio (MARGEN) ·
   *  'cae' = baja sin rebote (EXCEDIDO) · 'fade' = aparece suave (JUSTO). */
  mode: 'sella' | 'cae' | 'fade'
  /** La escena visible — la animación arranca al llegar, no al montar. */
  active: boolean
  reduced: boolean
  /** Delay para esperar el count-up del monto (README:88). */
  delayMs?: number
  /** Callback al asentar (dispara el burst de partículas en MARGEN). */
  onSealed?: () => void
}

export function WrStamp({
  label,
  ink,
  rotateDeg,
  mode,
  active,
  reduced,
  delayMs = 0,
  onSealed,
}: WrStampProps) {
  const spec = useWrappedSpec()
  const e = spec.veredicto.estampa
  const progress = useSharedValue(0)
  const played = useSharedValue(0)

  useEffect(() => {
    if (!active) return
    if (played.value === 1) return
    played.value = 1
    if (reduced) {
      progress.value = 1
      return
    }
    const settle = withTiming(1, {
      duration:
        mode === 'cae'
          ? decorativeDurations.wrappedEstampaCae
          : decorativeDurations.wrappedEstampa,
      easing: motionEasings.enterSmooth,
    })
    progress.value = delayMs > 0 ? withDelay(delayMs, settle) : settle
    if (mode === 'sella') {
      // Haptic MEDIO al sellar (README:88) + burst — en JS, sincronizado
      // con el fin del settle (delay + duración).
      const total = delayMs + decorativeDurations.wrappedEstampa
      const timer = setTimeout(() => {
        void triggerHaptic('medium')
        onSealed?.()
      }, total)
      return () => clearTimeout(timer)
    }
  }, [active, reduced, mode, delayMs, progress, played, onSealed])

  const style = useAnimatedStyle(() => {
    const p = progress.value
    if (mode === 'sella') {
      return {
        opacity: p,
        transform: [
          { scale: WRAPPED_ANIM.estampaScaleFrom - (WRAPPED_ANIM.estampaScaleFrom - 1) * p },
          { rotate: `${rotateDeg}deg` },
        ],
      }
    }
    if (mode === 'cae') {
      return {
        opacity: p,
        transform: [
          { translateY: -10 * (1 - p) },
          { rotate: `${rotateDeg}deg` },
        ],
      }
    }
    return { opacity: p, transform: [{ rotate: `${rotateDeg}deg` }] }
  })

  return (
    <Animated.View
      style={[
        {
          borderWidth: e.borderWidth,
          borderColor: ink,
          borderRadius: e.radius,
          paddingVertical: e.paddingV,
          paddingHorizontal: e.paddingH,
          alignSelf: 'center',
        },
        style,
      ]}
    >
      <WrText
        style={wrType({ size: e.size, weight: e.weight, letterSpacingEm: e.letterSpacingEm, ink })}
      >
        {label}
      </WrText>
    </Animated.View>
  )
}

// ─── Entrada decorativa (fade + rise) ────────────────────────────────

/** Fade + rise 10px con delay — la entrada estándar de los bloques de
 *  escena (filas de 02, puestos de 03). Gateada por `active`. */
export function WrRise({
  active,
  reduced,
  delayMs = 0,
  risePx = WRAPPED_ANIM.filasRisePx,
  children,
  style,
}: {
  active: boolean
  reduced: boolean
  delayMs?: number
  risePx?: number
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const progress = useSharedValue(0)
  const played = useSharedValue(0)
  useEffect(() => {
    if (!active || played.value === 1) return
    played.value = 1
    if (reduced) {
      progress.value = withTiming(1, {
        duration: decorativeDurations.wrappedReducedFade,
        easing: motionEasings.enterSmooth,
      })
      return
    }
    progress.value = withDelay(
      delayMs,
      withTiming(1, {
        duration: decorativeDurations.wrappedNav,
        easing: motionEasings.enterSmooth,
      }),
    )
  }, [active, reduced, delayMs, progress, played])
  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: risePx * (1 - progress.value) }],
  }))
  return <Animated.View style={[style, animStyle]}>{children}</Animated.View>
}

/** Pop del puesto #1 del ranking (1.05→1 al final del stagger). */
export function WrPop({
  active,
  reduced,
  delayMs = 0,
  children,
}: {
  active: boolean
  reduced: boolean
  delayMs?: number
  children: ReactNode
}) {
  const progress = useSharedValue(0)
  const played = useSharedValue(0)
  useEffect(() => {
    if (!active || played.value === 1) return
    played.value = 1
    if (reduced) {
      progress.value = 1
      return
    }
    progress.value = withDelay(
      delayMs,
      withSequence(
        withTiming(WRAPPED_ANIM.rankingPopScale, {
          duration: decorativeDurations.wrappedSegment,
          easing: motionEasings.enterSmooth,
        }),
        withTiming(1, {
          duration: decorativeDurations.wrappedSegment,
          easing: motionEasings.enterSmooth,
        }),
      ),
    )
  }, [active, reduced, delayMs, progress, played])
  const animStyle = useAnimatedStyle(() => {
    const p = progress.value
    return {
      opacity: p === 0 ? 0 : 1,
      transform: [{ scale: p === 0 ? 1 : p }],
    }
  })
  return <Animated.View style={animStyle}>{children}</Animated.View>
}

// ─── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  brotRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  link: { alignItems: 'center', paddingVertical: 8 },
  progressRow: { flexDirection: 'row' },
})
