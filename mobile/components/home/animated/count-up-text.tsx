import { useCallback, useEffect, useRef, useState } from 'react'
import {
  InteractionManager,
  // eslint-disable-next-line @typescript-eslint/no-restricted-imports -- createAnimatedComponent necesita el componente nativo crudo (el wrapper de app-text es un function component y perdería la ref para `animatedProps`); la escala de la app se aplica a mano acá abajo con `useFontScaleFactor`
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
  type SharedValue,
} from 'react-native-reanimated'
import { AnimatedText } from '@/components/ui/app-text'
import { useFontScaleFactor } from '@/features/preferences/font-scale-provider'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { animLog } from '@/lib/dev/anim-log'
import { scaledTextOverrides } from '@/lib/font-scale'
import { motionEasings } from '@/lib/motion/tokens'

type CountUnit = 'money' | 'moneySigned' | 'moneyDelta' | 'integer'

interface CountUpTextProps {
  value: number
  duration?: number
  format: (n: number) => string
  style?: StyleProp<TextStyle>
  accessibilityLabel?: string
  /** Etiqueta para el log dev de cambios de valor (solo __DEV__). */
  debugLabel?: string
  maxFontSizeMultiplier?: number
  /**
   * `false` = PINEADO: el número se dibuja al tamaño del diseño y NO
   * escala con la preferencia de la app (mismo contrato que el wrapper
   * de `app-text`). El escalado del OS está apagado siempre, en los dos
   * caminos — este prop es el ÚNICO opt-out que queda, y reemplaza al
   * viejo `maxFontSizeMultiplier={1}`, que quedó inocuo.
   *
   * Lo usan las réplicas pixel-perfect (el Wrapped): ahí la composición
   * no tiene dónde crecer y el tamaño ya se resuelve por el largo del
   * string formateado. Default: escala.
   */
  allowFontScaling?: boolean
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
  /**
   * Gate del PRIMER reveal (sólo `flourish`, como `unit`/`glowColor`).
   *
   * Mientras sea `false` el número se queda en 0 y NO arranca ninguna
   * animación; al pasar a `true` corre el conteo completo. Una vez
   * revelado se IGNORA: los cambios posteriores de `value` animan desde
   * donde está el número, nunca desde 0 (la regla "CountUpText nunca
   * resetea a 0" sigue intacta — ver el comentario del efecto).
   *
   * Existe porque el conteo del hero de Home arrancaba en el mount del
   * árbol de tabs, DETRÁS del splash de post-login: para cuando la card
   * se veía, el `Easing.out(cubic)` ya había consumido casi todo el
   * recorrido y el usuario nunca veía el número trepar.
   */
  startWhen?: boolean
  /**
   * Shared value EXTERNO donde vive el valor EN VUELO (sólo `flourish`).
   *
   * Si se pasa, el componente lo usa COMO su `progress` interno: el
   * caller es el dueño y puede derivar estilo del número mientras trepa
   * (el hero tiñe el monto según cuánto se acerca a cero). Debe
   * inicializarse en 0 — o en `value` si hay reduced motion. NADIE más
   * puede escribirlo.
   */
  flightValue?: SharedValue<number>
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

/**
 * Curva del conteo JS clásico (montos secundarios). `Easing.out(cubic)`
 * arranca a velocidad máxima: la mitad del recorrido se consume en el
 * primer ~20 % del tiempo. En un monto chico eso está bien —el número
 * "aparece" y asienta— y es el feel que ya tienen las vistas aprobadas.
 */
const COUNT_EASING = Easing.out(Easing.cubic)

/**
 * Curva del conteo FLUIDO (el monto principal de los heroes).
 *
 * `motionEasings.warm` es la simétrica inOut del sistema: ambos extremos
 * lentos, el medio acelera. Para el número grande —el que el usuario mira
 * fijo mientras trepa— eso se lee MUCHO más suave que el out-cubic, que
 * salta al inicio y después arrastra los últimos dígitos (pedido del owner
 * 2026-08-13: "si podemos hacerlo más smooth, mejor"). Es la misma curva
 * que el repo ya reserva para las entradas contemplativas.
 */
const COUNT_EASING_FLUID = motionEasings.warm
const SAMPLE_INTERVAL_MS = 52
// Pico del destello (0–1). Sutil: alpha ~0.45 y radio ~0.45·18 ≈ 8px al pico.
const GLOW_PEAK = 0.45

// Formateo SEGURO PARA WORKLET (Intl crashea en el UI runtime, y getIntlLocale
// lee i18n.language que no existe en el worklet thread). Por eso el separador de
// miles queda HARDCODEADO a "." (estilo es-AR) — NO es locale-aware a propósito:
// el conteo fluido corre en el UI thread y no puede tocar Intl/i18n. Es la única
// excepción i18n del módulo; el path JS (JsCountText) sí formatea con el
// `format` prop del caller, que ya es locale-aware. 'integer' es el entero pelado.
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
  // 'moneySigned' es la unidad del saldo del ciclo, que PUEDE ser negativo
  // (hogar que se pasó del plan). `unit: 'money'` conserva el `Math.abs` de
  // siempre: sus callers (meta-card, step-savings) cuentan montos que no
  // tienen signo, y ahí un menos sería ruido.
  //
  // El sign check va sobre `r`, no sobre `n`: un valor intermedio de la
  // animación como -0.4 redondea a 0, y "-$0" al cruzar el cero se vería como
  // un parpadeo del glifo.
  // 'moneyDelta' es la unidad del monto héroe del veredicto del wrapped:
  // el saldo del cierre SIEMPRE lleva signo explícito ("+$324.617" /
  // "-$1.6M") porque el signo ES el veredicto. Mismo criterio de r>0 para
  // no parpadear "+$0"/"-$0" al cruzar el cero.
  const sign =
    unit === 'moneyDelta' && r > 0
      ? n < 0
        ? '-'
        : '+'
      : unit === 'moneySigned' && n < 0 && r > 0
        ? '-'
        : ''
  return `${sign}$${out}`
}

/** Acceso al formateador del worklet para tests. El path fluido IGNORA el prop
 *  `format` del caller (no puede tocar Intl en el UI thread), así que esta es
 *  la única función que decide cómo se ve el número grande del hero — y por lo
 *  tanto la única que puede tragarse un signo sin que nadie se entere. */
export function formatCountForTest(n: number, unit: CountUnit): string {
  return formatCountWorklet(n, unit)
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
  // Un poco más largo que el JS (1200): con la curva simétrica el número
  // necesita aire para que se lea el tramo del medio, que es donde se
  // percibe el conteo. Más de ~1600 empieza a sentirse lento.
  duration = 1600,
  format,
  style,
  accessibilityLabel,
  debugLabel,
  maxFontSizeMultiplier = 1.4,
  allowFontScaling,
  unit = 'money',
  glowColor = '#A6EF8F', // = theme.colors.heroAccent (lime); los heroes lo pasan
  startWhen = true,
  flightValue,
}: CountUpTextProps) {
  const reduced = useReducedMotion()
  // Escala de texto de la app, A MANO: este número no pasa por el wrapper de
  // `app-text` (necesita el TextInput nativo crudo para `animatedProps`), así
  // que el factor se resuelve acá en JS —fuera del worklet, que no puede
  // llamar código JS— y viaja como un fontSize ya multiplicado.
  // Con `allowFontScaling={false}` el caller pinea el número al tamaño del
  // diseño: no hay overrides que componer.
  const fontScaleFactor = useFontScaleFactor()
  const fontScaleOverrides =
    allowFontScaling === false ? null : scaledTextOverrides(style, fontScaleFactor)
  // `ownProgress` se crea SIEMPRE (orden de hooks estable); cuando el caller
  // trae el suyo, el interno queda inerte — un shared value que nadie lee no
  // cuesta nada.
  const ownProgress = useSharedValue(reduced ? value : 0)
  const progress = flightValue ?? ownProgress
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
    // ORDEN CRÍTICO: reduced → gate → reveal.
    // 1) Reduced motion es un gate de HARDWARE (deviceYearClass < 2020):
    //    ahí no hay animación que esperar, así que el valor final se asigna
    //    en seco SIEMPRE, aunque `startWhen` sea false — si no, el número
    //    quedaría congelado en $0 en esos equipos.
    if (reduced) {
      animLog('countup', debugLabel ?? 'value', { value, first, reduced: true })
      hasRevealedRef.current = true
      progress.value = value
      return
    }
    // 2) Gate del PRIMER reveal. `progress` ya nace en 0, no hay nada que
    //    escribir. NO se marca `hasRevealedRef`: el reveal sigue PENDIENTE,
    //    así que cuando el gate abre corre el conteo entero.
    if (first && !startWhen) return
    // 3) Reveal / actualización. `progress.value = 0` vive SÓLO dentro de
    //    `if (first)`, y `first` sale de un ref que sobrevive todo
    //    re-render → volver a la tab nunca recuenta desde cero.
    animLog('countup', debugLabel ?? 'value', { value, first })
    if (first) {
      hasRevealedRef.current = true
      progress.value = 0
    }
    progress.value = withTiming(
      value,
      { duration, easing: COUNT_EASING_FLUID },
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
  }, [value, duration, reduced, progress, glow, debugLabel, startWhen])

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
      // Mismo contrato que el wrapper de `app-text`: el tamaño lo gobierna la
      // preferencia de la app, nunca el fontScale del OS. `maxFontSizeMultiplier`
      // queda inocuo con el escalado nativo apagado.
      allowFontScaling={false}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      animatedProps={animatedProps}
      style={[TABULAR, TEXTINPUT_RESET, style, fontScaleOverrides, animatedStyle]}
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
  allowFontScaling,
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

  // Arranca APAGADO y sólo vive mientras dura el conteo: un callback por
  // frame que se queda registrado para siempre cuesta un worklet por frame
  // por instancia, y una pantalla puede montar varios (la tira del jardín
  // monta 3) que quedan corriendo aunque la pantalla esté tapada por otra.
  const frameCallback = useFrameCallback((info) => {
    'worklet'
    if (tweening.value !== 1) return
    sampleAcc.value += info.timeSincePreviousFrame ?? 16
    if (sampleAcc.value < SAMPLE_INTERVAL_MS) return
    sampleAcc.value = 0
    runOnJS(applyDisplay)(Math.round(progress.value))
  }, false)

  const setFrameActive = useCallback(
    (active: boolean) => frameCallback.setActive(active),
    [frameCallback],
  )

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
      setFrameActive(true)
      progress.value = withTiming(
        value,
        { duration, easing: COUNT_EASING },
        (finished) => {
          'worklet'
          tweening.value = 0
          runOnJS(setFrameActive)(false)
          if (!finished) return
          runOnJS(applyDisplay)(value)
        },
      )
    })
    return () => {
      handle.cancel()
      setFrameActive(false)
    }
  }, [
    value,
    duration,
    reduced,
    progress,
    tweening,
    sampleAcc,
    applyDisplay,
    setFrameActive,
    debugLabel,
  ])

  return (
    // El path JS sí puede pasar por el wrapper: acá el texto es un child común
    // (no un `animatedProps`), así que `AnimatedText` le aplica la escala de la
    // app y le apaga el fontScale del OS sin perder nada del conteo. El pin del
    // caller viaja tal cual: `AnimatedText` lo lee como "tampoco escala con la
    // app".
    <AnimatedText
      style={[TABULAR, style]}
      accessibilityLabel={accessibilityLabel ?? display}
      allowFontScaling={allowFontScaling}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
    >
      {display}
    </AnimatedText>
  )
}
