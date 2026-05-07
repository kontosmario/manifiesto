import { useCallback, useEffect, useState } from 'react'
import { Text, type StyleProp, type TextStyle } from 'react-native'
import {
  useSharedValue,
  useAnimatedReaction,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface CountUpTextProps {
  value: number
  duration?: number
  format: (n: number) => string
  style?: StyleProp<TextStyle>
  accessibilityLabel?: string
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
  maxFontSizeMultiplier = 1.4,
}: CountUpTextProps) {
  const reduced = useReducedMotion()
  const [display, setDisplay] = useState(() => format(reduced ? value : 0))
  const progress = useSharedValue(reduced ? value : 0)

  // Format on the JS thread — calling Intl.* inside a worklet crashes Expo Go.
  const applyDisplay = useCallback(
    (n: number) => {
      setDisplay(format(n))
    },
    [format],
  )

  useEffect(() => {
    if (reduced) {
      progress.value = value
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional sync of display when reduced-motion flips on
      setDisplay(format(value))
      return
    }
    progress.value = 0
    progress.value = withTiming(value, { duration, easing: Easing.out(Easing.cubic) })
  }, [value, duration, reduced, format, progress])

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
