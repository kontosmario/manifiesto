import { useCallback, useEffect, useRef, useState } from 'react'
import { Text, type StyleProp, type TextStyle } from 'react-native'
import {
  useSharedValue,
  useAnimatedReaction,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { animLog } from '@/lib/dev/anim-log'

interface CountUpTextProps {
  value: number
  duration?: number
  format: (n: number) => string
  style?: StyleProp<TextStyle>
  accessibilityLabel?: string
  /** Etiqueta para el log dev de cambios de valor (solo __DEV__). Ayuda a
   *  identificar qué número del hero cambió (Gastos/Control/etc). */
  debugLabel?: string
  /** Cap on system font scaling. Avoids overflow when iOS Dynamic
   *  Type or Android Larger Text inflate large hero figures past
   *  their container. Defaults to 1.4 — generous enough for
   *  accessibility without breaking the hero card geometry. */
  maxFontSizeMultiplier?: number
}

// `fontVariant: 'tabular-nums'` keeps each digit at the same width so the
// label doesn't resize frame-by-frame as the count animates. Without it,
// proportional digits (e.g. 1 vs 8) change glyph width and push siblings
// around, which reads as jitter.
const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] }

export function CountUpText({
  value,
  duration = 1600,
  format,
  style,
  accessibilityLabel,
  debugLabel,
  maxFontSizeMultiplier = 1.4,
}: CountUpTextProps) {
  const reduced = useReducedMotion()
  const [display, setDisplay] = useState(() => format(reduced ? value : 0))
  const progress = useSharedValue(reduced ? value : 0)

  // Keep the latest formatter in a ref so the count-up effect below does NOT
  // depend on `format`. Callers almost always pass an inline
  // `format={(n) => formatMoney(n)}` (a NEW reference every render); if that
  // were an effect dependency, every parent re-render would reset progress to
  // 0 and restart the count-up — the "empieza y se reinicia" jitter on first
  // paint, when the hero card re-renders several times while data loads.
  const formatRef = useRef(format)
  useEffect(() => {
    formatRef.current = format
  }, [format])

  // Format on the JS thread — calling Intl.* inside a worklet crashes Expo Go.
  // Stable identity (reads the ref), so the animated reaction never re-subscribes.
  const applyDisplay = useCallback((n: number) => {
    setDisplay(formatRef.current(n))
  }, [])

  // El primer reveal cuenta desde 0 (el efecto buscado). Los cambios
  // POSTERIORES de `value` se interpolan desde el valor actual, nunca
  // reseteando a 0. Antes hacíamos `progress.value = 0` en cada cambio: si
  // una slice de data async resolvía después del primer paint (el hero de
  // Control / Gastos), el número grande saltaba a 0 y volvía a trepar — eso
  // se leía como un flicker aleatorio al navegar a esos tabs.
  const hasRevealedRef = useRef(false)
  useEffect(() => {
    const first = !hasRevealedRef.current
    // DEV: un `first:false` justo después de navegar a una vista = el número
    // del hero cambió de valor sin acción del usuario → posible flicker.
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
    progress.value = withTiming(value, { duration, easing: Easing.out(Easing.cubic) })
  }, [value, duration, reduced, progress, debugLabel])

  // Quantize updates so setState fires at most ~20×/sec on the JS thread.
  // A tween from 0 to a large integer would otherwise call runOnJS 60×/sec,
  // re-rendering the parent on every frame. We snap to a step proportional
  // to the target magnitude (min 1) so the visible countdown stays smooth
  // but React reconciliation work drops dramatically.
  const step = Math.max(1, Math.round(Math.abs(value) / 80))
  useAnimatedReaction(
    () => {
      const q = Math.round(progress.value / step) * step
      return q
    },
    (quantized, prev) => {
      if (quantized !== prev) {
        runOnJS(applyDisplay)(quantized)
      }
    },
    [applyDisplay, step],
  )

  return (
    <Text
      style={[TABULAR, style]}
      accessibilityLabel={accessibilityLabel ?? display}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
    >
      {display}
    </Text>
  )
}
