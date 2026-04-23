import { useEffect, useState } from 'react'
import { Text, type TextStyle } from 'react-native'
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
  style?: TextStyle
  accessibilityLabel?: string
}

export function CountUpText({ value, duration = 1600, format, style, accessibilityLabel }: CountUpTextProps) {
  const reduced = useReducedMotion()
  const [display, setDisplay] = useState(() => format(reduced ? value : 0))
  const progress = useSharedValue(reduced ? value : 0)

  useEffect(() => {
    if (reduced) {
      setDisplay(format(value))
      return
    }
    progress.value = 0
    progress.value = withTiming(value, { duration, easing: Easing.out(Easing.cubic) })
  }, [value, duration, reduced, format, progress])

  useAnimatedReaction(
    () => progress.value,
    (next) => {
      runOnJS(setDisplay)(format(Math.round(next)))
    },
    [format],
  )

  return (
    <Text style={style} accessibilityLabel={accessibilityLabel ?? display}>
      {display}
    </Text>
  )
}
