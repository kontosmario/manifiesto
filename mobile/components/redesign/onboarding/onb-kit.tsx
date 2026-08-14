import { forwardRef, useEffect, useState, type PropsWithChildren } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { BrotMascot, BrotParticles, type BrotPose } from '@/components/brot'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'
import { ONB_PROGRESS_SEGMENTS, ONB_SPEC, type OnbMode } from './onb-spec'

/**
 * Kit compartido del flujo de onboarding del rediseño (Turno 5).
 * Cada pieza transcribe el markup literal del par 5a/5ao — las
 * pantallas componen estas piezas y agregan solo lo suyo.
 *
 * Réplicas bajo gate de aprobación: fidelidad primero. Performance:
 * todo estático salvo partículas/Brot (Skia, UI thread).
 */

// ─── Shell de pantalla ───────────────────────────────────────────────

export function OnbScreenShell({ mode, children }: PropsWithChildren<{ mode: OnbMode }>) {
  const s = ONB_SPEC[mode]
  return <View style={[styles.shell, { backgroundColor: s.bg }]}>{children}</View>
}

// ─── Cuerpos de pantalla: el gutter horizontal vive ACÁ ──────────────
//
// El host del flujo NO pone paddingHorizontal (feedback owner
// 2026-07-15): si el gutter de 22px queda AFUERA de un ScrollView, el
// viewport del scroll recorta las sombras neumórficas exactamente en
// el borde de las cards. Cada pantalla envuelve su contenido en
// OnbBody (sin scroll) u OnbScrollBody (con scroll, gutter adentro
// del content container → las sombras respiran dentro del viewport).

/** Gutter horizontal del mockup (frames de 393px con 22px por lado). */
const BODY_GUTTER = 22
/**
 * Aire vertical dentro del scroll para la sombra del primer elemento
 * (back circular: offset 6 + blur 12). Se compensa con marginTop
 * negativo en el ScrollView para que el header quede en la MISMA
 * posición que en las pantallas sin scroll (el host ya aporta
 * insets.top + 10) — el viewport arranca 12px más arriba y la sombra
 * deja de guillotinarse en reposo.
 */
const SHADOW_PAD = 12

/** Columna sin scroll para pantallas cuyo contenido entra (5a/5b/5c/5e/5f). */
export function OnbBody({ children }: PropsWithChildren) {
  return <View style={styles.body}>{children}</View>
}

/**
 * ScrollView full-bleed para pantallas más altas que el viewport
 * (5d/5e2). El gutter va en el contentContainer — el contenido queda
 * 22px adentro de los bounds del scroll y las sombras (offsets 8–10 +
 * blur que se desvanece) entran en ese margen sin recorte horizontal.
 * flexGrow:1 mantiene los CTA con marginTop:'auto' anclados abajo
 * cuando el contenido es corto.
 */
// forwardRef backward-compatible: el ref es opcional y se reenvía al
// ScrollView interno (lo usa el keyboard-avoidance del numpad para
// scrollear la card de monto por encima de la hoja). Los llamadores
// que no pasan ref siguen funcionando igual.
//
// `onScroll` + `extraBottomPad` los cablea el keyboard-avoidance del
// numpad (useNumpadScrollAvoid): trackear el offset y agregar aire al
// fondo para que la card baja pueda subir sobre la hoja. Ambos
// opcionales — las pantallas sin numpad no los pasan.
interface OnbScrollBodyProps extends PropsWithChildren {
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void
  extraBottomPad?: number
}
export const OnbScrollBody = forwardRef<ScrollView, OnbScrollBodyProps>(function OnbScrollBody(
  { children, onScroll, extraBottomPad = 0 },
  ref,
) {
  return (
    <ScrollView
      ref={ref}
      contentContainerStyle={[
        styles.scrollBodyContent,
        extraBottomPad > 0 ? { paddingBottom: extraBottomPad } : null,
      ]}
      keyboardShouldPersistTaps="handled"
      onScroll={onScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      style={styles.scrollBody}
    >
      {children}
    </ScrollView>
  )
})

// ─── Header: back circular 44 + título centrado 22/900 ──────────────

export function OnbHeader({
  mode,
  title,
  onBack,
}: {
  mode: OnbMode
  title: string
  onBack?: () => void
}) {
  const s = ONB_SPEC[mode]
  return (
    <View style={styles.headerRow}>
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={[
          styles.backCircle,
          {
            backgroundColor: s.backBackground,
            boxShadow: s.backShadow,
          },
          s.backGradient
            ? {
                experimental_backgroundImage: `linear-gradient(145deg, ${s.backGradient[0]}, ${s.backGradient[1]})`,
              }
            : null,
        ]}
      >
        <Svg width={17} height={17} viewBox="0 0 24 24">
          <Path
            d="M15 6l-6 6 6 6"
            stroke={s.text}
            strokeWidth={2.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </Pressable>
      <View pointerEvents="none" style={styles.headerTitleWrap}>
        <Text style={[styles.headerTitle, { color: s.text }]}>{title}</Text>
      </View>
    </View>
  )
}

// ─── Progreso: 5 segmentos 6px, radius 3, gap 8 ──────────────────────

export function OnbProgress({
  mode,
  active,
  segments = ONB_PROGRESS_SEGMENTS,
}: {
  mode: OnbMode
  /** Índice (0-based) del paso actual; los anteriores también van sólidos. */
  active: number
  segments?: number
}) {
  const s = ONB_SPEC[mode]
  return (
    <View style={styles.progressRow}>
      {Array.from({ length: segments }, (_, i) => (
        <View
          key={i}
          style={[
            styles.progressSegment,
            i <= active
              ? { backgroundColor: s.progressActive }
              : {
                  backgroundColor: s.progressIdleBackground,
                  boxShadow: s.progressIdleShadow,
                },
          ]}
        />
      ))}
    </View>
  )
}

// ─── Hero verde con partículas ×7 y Brot ─────────────────────────────

export function OnbHero({
  mode,
  title,
  subtitle,
  brotPose = 'wave',
}: {
  mode: OnbMode
  title: string
  subtitle: string
  /** null = hero sin Brot (5b/5c/5d/5e/5e2): título/sub a ancho completo. */
  brotPose?: BrotPose | null
}) {
  const s = ONB_SPEC[mode]
  return (
    <View
      style={[
        styles.hero,
        {
          experimental_backgroundImage: s.heroGradientCss,
          backgroundColor: mode === 'dark' ? '#1B3A26' : '#4C9A52',
          boxShadow: s.heroShadow,
        },
      ]}
    >
      <BrotParticles colors={s.particleColors} count={7} borderRadius={26} />
      {brotPose === null ? (
        <>
          <Text style={[styles.heroTitle, { color: s.heroTitle }]}>{title}</Text>
          <Text style={[styles.heroSub, { color: s.heroSub }]}>{subtitle}</Text>
        </>
      ) : (
        <View style={styles.heroRow}>
          <View style={styles.heroTextCol}>
            <Text style={[styles.heroTitle, { color: s.heroTitle }]}>{title}</Text>
            <Text style={[styles.heroSub, { color: s.heroSub }]}>{subtitle}</Text>
          </View>
          <BrotMascot pose={brotPose} size={64} shadow={false} />
        </View>
      )}
    </View>
  )
}

// ─── Well hundido (display de input) ─────────────────────────────────

export function OnbWell({
  mode,
  children,
}: PropsWithChildren<{ mode: OnbMode }>) {
  const s = ONB_SPEC[mode]
  return (
    <View
      style={[
        styles.well,
        { backgroundColor: s.wellBackground, boxShadow: s.wellShadow },
      ]}
    >
      {children}
    </View>
  )
}

// ─── Chip informativo verde con sparkle ──────────────────────────────

export function OnbInfoChip({ mode, text }: { mode: OnbMode; text: string }) {
  const s = ONB_SPEC[mode]
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: s.chipBackground, boxShadow: s.chipShadow },
      ]}
    >
      <Svg width={14} height={14} viewBox="0 0 24 24">
        <Path d="M12 3l2.1 6.9L21 12l-6.9 2.1L12 21l-2.1-6.9L3 12l6.9-2.1z" fill={s.chipIcon} />
      </Svg>
      <Text style={[styles.chipText, { color: s.chipText }]}>{text}</Text>
    </View>
  )
}

// ─── Fila helper: texto izquierda + contador derecha ─────────────────

export function OnbHelperRow({
  mode,
  left,
  right,
}: {
  mode: OnbMode
  left: string
  right?: string
}) {
  const s = ONB_SPEC[mode]
  return (
    <View style={styles.helperRow}>
      <Text style={[styles.helperLeft, { color: s.helper }]}>{left}</Text>
      {right !== undefined ? (
        <Text style={[styles.helperRight, { color: s.counter }]}>{right}</Text>
      ) : null}
    </View>
  )
}

// ─── CTA del flujo + caption + validación bloqueante ─────────────────
//
// Deshabilitado = hundido con texto apagado (receta literal de 3c:
// inset 5/10, texto #9AA694 claro / #7C917A sobre #142519 oscuro).
// La transición activo↔deshabilitado es un crossfade de las dos capas
// de fondo (los strings de gradiente/boxShadow no son animables).
// Tap con el CTA deshabilitado → hint estilo 3c: Brot `think` + texto
// durazno explicando qué falta.

const CTA_DISABLED = {
  light: {
    text: '#9AA694',
    background: undefined,
    shadow: 'inset 5px 5px 10px rgba(151,160,136,0.42), inset -5px -5px 10px rgba(255,255,255,0.92)',
    hintText: '#B0764A',
  },
  dark: {
    text: '#7C917A',
    background: '#142519',
    shadow: 'inset 5px 5px 10px rgba(0,0,0,0.5), inset -5px -5px 10px rgba(101,152,113,0.08)',
    hintText: '#F2A87E',
  },
} as const

export function OnbCta({
  mode,
  label,
  caption,
  onPress,
  disabled = false,
  disabledHint,
  busy = false,
}: {
  mode: OnbMode
  label: string
  caption?: string
  onPress?: () => void
  /** Validación bloqueante: hundido + sin acción hasta que valide. */
  disabled?: boolean
  /** "Falta …" — se muestra con Brot think al tocar deshabilitado. */
  disabledHint?: string
  /** Operación live en vuelo: presses ignorados, visual activo (patrón
   *  AuthCta del kit de auth). Solo lo usa el cableado real — el caller
   *  suele acompañarlo con un label "…ando…". */
  busy?: boolean
}) {
  const s = ONB_SPEC[mode]
  const d = CTA_DISABLED[mode]
  const [hintVisible, setHintVisible] = useState(false)

  const active = useSharedValue(disabled ? 0 : 1)
  useEffect(() => {
    active.value = withTiming(disabled ? 1 : 0, { duration: motionDurations.standard })
    if (!disabled) setHintVisible(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled])
  // active.value: 0 = habilitado, 1 = deshabilitado (ver withTiming).
  const activeLayer = useAnimatedStyle(() => ({ opacity: 1 - active.value }))
  const disabledLayer = useAnimatedStyle(() => ({ opacity: active.value }))

  const handlePress = () => {
    if (busy) return
    if (disabled) {
      void triggerHaptic('light')
      if (disabledHint) setHintVisible(true)
      return
    }
    onPress?.()
  }

  return (
    <View style={styles.ctaBlock}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        onPress={handlePress}
        style={styles.cta}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ctaLayer,
            activeLayer,
            {
              experimental_backgroundImage: s.ctaBackgroundCss,
              backgroundColor: mode === 'dark' ? '#EDEAD8' : '#2A4432',
              boxShadow: s.ctaShadow,
            },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ctaLayer,
            disabledLayer,
            { backgroundColor: d.background, boxShadow: d.shadow },
          ]}
        />
        <Text style={[styles.ctaLabel, { color: disabled ? d.text : s.ctaText }]}>{label}</Text>
      </Pressable>
      {hintVisible && disabled && disabledHint ? (
        <Animated.View
          entering={FadeInDown.duration(motionDurations.standard)}
          style={styles.ctaHintRow}
        >
          <BrotMascot pose="think" size={34} shadow={false} />
          <Text style={[styles.ctaHintText, { color: d.hintText }]}>{disabledHint}</Text>
        </Animated.View>
      ) : null}
      {caption !== undefined ? (
        <Text style={[styles.ctaCaption, { color: s.helper }]}>{caption}</Text>
      ) : null}
    </View>
  )
}

// ─── Anillo de foco/selección animado ────────────────────────────────
//
// Overlay del "anillo" del doc (inputs activos en 4c, tiles elegidos):
// 2.5px verde, fade suave al enfocar/desenfocar. Absoluto: el padre
// debe tener position relative implícita (View) y el mismo radio.

export function OnbActiveRing({
  mode,
  focused,
  radius,
}: {
  mode: OnbMode
  focused: boolean
  radius: number
}) {
  const ringColor = mode === 'dark' ? '#A4E3A6' : '#2E7C39'
  const visible = useSharedValue(focused ? 1 : 0)
  useEffect(() => {
    visible.value = withTiming(focused ? 1 : 0, { duration: motionDurations.quick })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused])
  const ringStyle = useAnimatedStyle(() => ({ opacity: visible.value }))
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        ringStyle,
        { borderRadius: radius, borderWidth: 2.5, borderColor: ringColor },
      ]}
    />
  )
}

// ─── Estilos (valores literales de 5a/5ao) ───────────────────────────

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: BODY_GUTTER,
  },
  scrollBody: {
    flex: 1,
    // Compensa el paddingTop del contenido: header alineado con las
    // pantallas sin scroll y 12px de viewport extra para las sombras.
    marginTop: -SHADOW_PAD,
  },
  scrollBodyContent: {
    paddingHorizontal: BODY_GUTTER,
    paddingTop: SHADOW_PAD,
    // Aire para la sombra del último bloque al llegar al fondo.
    paddingBottom: 24,
    flexGrow: 1,
  },
  headerRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  backCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  progressRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  progressSegment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  hero: {
    position: 'relative',
    marginTop: 16,
    borderRadius: 26,
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroTextCol: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 21,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  heroSub: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginTop: 3,
  },
  well: {
    marginTop: 20,
    borderRadius: 22,
    padding: 18,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  chipText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  helperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 10,
  },
  helperLeft: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  helperRight: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  ctaBlock: {
    marginTop: 'auto',
    paddingBottom: 16,
  },
  cta: {
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
  },
  // Capas de fondo del CTA (activa/deshabilitada) para el crossfade.
  ctaLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
  },
  ctaHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 12,
  },
  ctaHintText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  ctaLabel: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  ctaCaption: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    marginTop: 10,
  },
})
