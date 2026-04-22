import { useCallback, useEffect, useState } from 'react'
import { Text, type StyleProp, type TextStyle } from 'react-native'
import {
  useSharedValue,
  useAnimatedReaction,
  withSpring,
  useReducedMotion,
  runOnJS,
} from 'react-native-reanimated'
import { typography } from '@/theme/typography'
import { motionSprings } from '@/lib/motion'
import { triggerHaptic } from '@/lib/haptics'
import { formatAnimatedAmount, type AmountPrefix } from './animated-amount-format'

type AmountVariant = 'hero' | 'displayLarge' | 'metricLarge' | 'metricValue' | 'bodyEmphasis'

interface AnimatedAmountProps {
  value: number
  variant?: AmountVariant
  hapticOnChange?: boolean
  prefix?: AmountPrefix
  locale?: string
  color?: string
  maxFontSizeMultiplier?: number
  style?: StyleProp<TextStyle>
}

const VARIANT_TO_PRESET: Record<AmountVariant, keyof typeof typography> = {
  hero: 'hero',
  displayLarge: 'displayLarge',
  metricLarge: 'metricLarge',
  metricValue: 'metricValue',
  bodyEmphasis: 'bodyEmphasis',
}

export function AnimatedAmount({
  value,
  variant = 'hero',
  hapticOnChange = false,
  prefix,
  locale = 'es-AR',
  color,
  maxFontSizeMultiplier = 1.2,
  style,
}: AnimatedAmountProps) {
  const reduceMotion = useReducedMotion()
  const current = useSharedValue(value)
  const [displayText, setDisplayText] = useState(() =>
    formatAnimatedAmount(value, locale, prefix),
  )

  // JS-thread helper. The worklet in useAnimatedReaction delegates here via
  // runOnJS so that Intl.NumberFormat runs on the JS runtime (it is not
  // available in the Reanimated worklet runtime).
  const applyRounded = useCallback(
    (rounded: number) => {
      setDisplayText(formatAnimatedAmount(rounded, locale, prefix))
    },
    [locale, prefix],
  )

  useEffect(() => {
    const previous = current.value
    current.value = reduceMotion ? value : withSpring(value, motionSprings.value)
    if (hapticOnChange && previous !== value) {
      void triggerHaptic(value > previous ? 'success' : 'selection')
    }
  }, [value, reduceMotion, hapticOnChange, current])

  useAnimatedReaction(
    () => Math.round(current.value),
    (rounded, previous) => {
      if (rounded === previous) return
      runOnJS(applyRounded)(rounded)
    },
    [applyRounded],
  )

  const presetKey = VARIANT_TO_PRESET[variant]
  const preset = typography[presetKey]
  const accessibilityLabel = formatAnimatedAmount(value, locale, prefix)

  return (
    <Text
      allowFontScaling
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      accessibilityLabel={accessibilityLabel}
      style={[preset, color ? { color } : null, style]}
    >
      {displayText}
    </Text>
  )
}
