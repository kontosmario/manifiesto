import { useEffect } from 'react'
import { Text, type StyleProp, type TextStyle } from 'react-native'
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedProps,
  withSpring,
  useReducedMotion,
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

const AnimatedText = Animated.createAnimatedComponent(Text)

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

  useEffect(() => {
    const previous = current.value
    current.value = reduceMotion ? value : withSpring(value, motionSprings.value)
    if (hapticOnChange && previous !== value) {
      void triggerHaptic(value > previous ? 'success' : 'selection')
    }
  }, [value, reduceMotion, hapticOnChange, current])

  const formatted = useDerivedValue(() => formatAnimatedAmount(current.value, locale, prefix))

  const animatedProps = useAnimatedProps(
    () =>
      ({
        text: formatted.value,
        defaultValue: formatted.value,
      }) as unknown as { text: string },
  )

  const presetKey = VARIANT_TO_PRESET[variant]
  const preset = typography[presetKey]

  return (
    <AnimatedText
      allowFontScaling
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      accessibilityLabel={formatAnimatedAmount(value, locale, prefix)}
      style={[preset, color ? { color } : null, style]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      animatedProps={animatedProps as unknown as any}
    >
      {formatAnimatedAmount(value, locale, prefix)}
    </AnimatedText>
  )
}
