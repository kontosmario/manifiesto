import { useCallback, useEffect, useRef, useState } from 'react'
import {
  InteractionManager,
  TextInput,
  type StyleProp,
  type TextStyle,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  interpolateColor,
  withTiming,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { animLog } from '@/lib/dev/anim-log'

type CountUnit = 'money' | 'integer'

interface CountUpTextProps {
  value: number
  duration?: number
  format: (n: number) => string
  style?: StyleProp<TextStyle>
  accessibilityLabel?: string
  /** Etiqueta para el log dev de cambios de valor (solo __DEV__). */
  debugLabel?: string
  maxFontSizeMultiplier?: number
  /** Monto PRINCIPAL del hero: conteo FLUIDO en el UI thread (TextInput +
   *  useAnimatedProps) + flourish al asentar (rebote spring + glow). El número
   *  trepa sin un solo `setState` → corre a 60/120fps, imposible que se trabe.
   *  Default false → el resto de los montos siguen con el conteo JS. */
  flourish?: boolean
  /** Unidad del formateo en el modo fluido (worklet, sin Intl). 'money' →
   *  "$1.234.567"; 'integer' → "847" (p.ej. DÍAS). Default 'money'. */
  unit?: CountUnit
  /** Color del halo del destello (sólo con `flourish`). */
  glowColor?: string
}

// `fontVariant: 'tabular-nums'` mantiene el ancho de cada dígito estable.
const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] }
// TextInput trae padding/altura propios — los reseteamos para que el número
// quede igual que un <Text> en el layout del hero.
const TEXTINPUT_RESET: TextStyle = {
  padding: 0,
  margin: 0,
  includeFontPadding: false, // Android: matchea la métrica de <Text>
}

const COUNT_EASING = Easing.out(Easing.cubic)
const SAMPLE_INTERVAL_MS = 52
// Pico del destello (0–1). Sutil: alpha ~0.45 y radio ~0.45·18 ≈ 8px al pico.
const GLOW_PEAK = 0.45

// Formateo SEGURO PARA WORKLET (Intl crashea en el UI runtime). 'money' agrega
// separador de miles con puntos (es-AR) y "$"; 'integer' es el entero pelado.
function formatCountWorklet(n: number, unit: CountUnit): string {
  'worklet'
  if (unit === 'integer') return `${Math.round(n)}`
  const r = Math.round(Math.abs(n))
  const s = `${r}`
  const len = s.length
  let out = ''
  for (let i = 0; i < len; i++) {
    if (i > 0 && (len - i) % 3 === 0) out += '.'
    out += s[i]
  }
  return `$${out}`
}

// `text` no es animable en TextInput por default — hay que whitelistearlo.
Animated.addWhitelistedNativeProps({ text: true })
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput)

export function CountUpText(props: CountUpTextProps) {
  // El monto principal (flourish) usa el conteo FLUIDO en UI thread; el resto
  // (montos secundarios, más chicos) sigue con el conteo JS clásico.
  return props.flourish ? (
    <FluidCountText {...props} />
  ) : (
    <JsCountText {...props} />
  )
}

// ─── Conteo FLUIDO (UI thread, TextInput + useAnimatedProps) ───────────────
function FluidCountText({
  value,
  duration = 1200,
  format,
  style,
  accessibilityLabel,
  debugLabel,
  maxFontSizeMultiplier = 1.4,
  unit = 'money',
  glowColor = '#A6EF8F', // = theme.colors.heroAccent (lime); los heroes lo pasan
}: CountUpTextProps) {
  const reduced = useReducedMotion()
  const progress = useSharedValue(reduced ? value : 0)
  const glow = useSharedValue(0)

  // El string del número se DERIVA de `progress` en el UI thread y se inyecta
  // como `text` del TextInput vía useAnimatedProps → cero setState/render por
  // frame → fluido a 60/120fps.
  const text = useDerivedValue(() => formatCountWorklet(progress.value, unit))
  const animatedProps = useAnimatedProps(
    () =>
      ({
        text: text.value,
        defaultValue: text.value,
      }) as Partial<{ text: string; defaultValue: string }>,
  )

  const hasRevealedRef = useRef(false)
  useEffect(() => {
    const first = !hasRevealedRef.current
    animLog('countup', debugLabel ?? 'value', { value, first })
    if (reduced) {
      progress.value = value
      return
    }
    if (first) {
      hasRevealedRef.current = true
      progress.value = 0
    }
    progress.value = withTiming(
      value,
      { duration, easing: COUNT_EASING },
      (finished) => {
        'worklet'
        if (!finished) return
        // Destello al asentar (variante 6): brillo breve del accent que
        // sube rápido (pico ~25%) y se disuelve. Sin rebote de escala.
        // El pico se queda en GLOW_PEAK (no 1) → halo sutil (alpha y radio
        // escalan juntos con `glow`).
        glow.value = withSequence(
          withTiming(GLOW_PEAK, { duration: 170, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: 430, easing: Easing.inOut(Easing.quad) }),
        )
      },
    )
  }, [value, duration, reduced, progress, glow, debugLabel])

  // El destello: el halo (textShadow) sube de 0 al accent y vuelve. Animamos
  // color (alpha) y radio juntos para un fundido limpio. Sin transform.
  const animatedStyle = useAnimatedStyle(() => ({
    textShadowColor: interpolateColor(
      glow.value,
      [0, 1],
      ['rgba(166,239,143,0)', glowColor],
    ),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: glow.value * 18,
  }))

  return (
    <AnimatedTextInput
      editable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      accessible
      accessibilityLabel={accessibilityLabel ?? format(value)}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      animatedProps={animatedProps}
      style={[TABULAR, TEXTINPUT_RESET, style, animatedStyle]}
    />
  )
}

// ─── Conteo JS clásico (montos secundarios) ────────────────────────────────
function JsCountText({
  value,
  duration = 1000,
  format,
  style,
  accessibilityLabel,
  debugLabel,
  maxFontSizeMultiplier = 1.4,
}: CountUpTextProps) {
  const reduced = useReducedMotion()
  const [display, setDisplay] = useState(() => format(reduced ? value : 0))
  const progress = useSharedValue(reduced ? value : 0)
  const tweening = useSharedValue(0)
  const sampleAcc = useSharedValue(0)

  const formatRef = useRef(format)
  useEffect(() => {
    formatRef.current = format
  }, [format])

  const applyDisplay = useCallback((n: number) => {
    setDisplay(formatRef.current(n))
  }, [])

  const hasRevealedRef = useRef(false)
  useEffect(() => {
    const first = !hasRevealedRef.current
    animLog('countup', debugLabel ?? 'value', { value, first })
    if (reduced) {
      progress.value = value
      setDisplay(formatRef.current(value))
      return
    }
    if (first) {
      hasRevealedRef.current = true
      progress.value = 0
    }
    const handle = InteractionManager.runAfterInteractions(() => {
      sampleAcc.value = SAMPLE_INTERVAL_MS
      tweening.value = 1
      progress.value = withTiming(
        value,
        { duration, easing: COUNT_EASING },
        (finished) => {
          'worklet'
          tweening.value = 0
          if (!finished) return
          runOnJS(applyDisplay)(value)
        },
      )
    })
    return () => handle.cancel()
  }, [value, duration, reduced, progress, tweening, sampleAcc, applyDisplay, debugLabel])

  useFrameCallback((info) => {
    'worklet'
    if (tweening.value !== 1) return
    sampleAcc.value += info.timeSincePreviousFrame ?? 16
    if (sampleAcc.value < SAMPLE_INTERVAL_MS) return
    sampleAcc.value = 0
    runOnJS(applyDisplay)(Math.round(progress.value))
  })

  return (
    <Animated.Text
      style={[TABULAR, style]}
      accessibilityLabel={accessibilityLabel ?? display}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
    >
      {display}
    </Animated.Text>
  )
}
