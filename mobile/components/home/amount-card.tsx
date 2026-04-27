import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useReducedMotion,
  interpolateColor,
} from 'react-native-reanimated'
import { formatAnimatedAmount } from '@/components/ui/animated-amount-format'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations, motionSprings } from '@/lib/motion'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface AmountCardProps {
  amount: number
  isActive: boolean
  onPress: () => void
  /** Eyebrow text rendered inside the card. Defaults to "Monto". Use
   *  to repurpose the card for income / goal amount onboarding steps
   *  while keeping the focus animation + visual format consistent. */
  label?: string
}

export function AmountCard({ amount, isActive, onPress, label = 'Monto' }: AmountCardProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)
  const activeProgress = useSharedValue(isActive ? 1 : 0)

  useEffect(() => {
    const target = isActive ? 1 : 0
    activeProgress.value = reduceMotion
      ? target
      : withTiming(target, { duration: motionDurations.standard })
  }, [isActive, reduceMotion, activeProgress])

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : scale.value }],
  }))

  // Active focus border tracks `theme.colors.primary` so dark mode gets
  // the bright accent (brand.bright) and light mode gets the deep green
  // (brand.deep). Hardcoding brand.deep made the focus invisible against
  // dark surfaces.
  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      activeProgress.value,
      [0, 1],
      [theme.colors.border, theme.colors.primary],
    ),
    borderWidth: 1 + activeProgress.value,
  }))

  const hintStyle = useAnimatedStyle(() => ({
    opacity: 1 - activeProgress.value,
  }))

  const displayText = formatAnimatedAmount(amount)

  return (
    <Animated.View style={scaleStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Monto: ${displayText}`}
        accessibilityHint="Abre el numpad para editar el monto"
        onPress={() => {
          void triggerHaptic('light')
          onPress()
        }}
        onPressIn={() => {
          if (reduceMotion) return
          // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value write
          scale.value = withSpring(0.98, motionSprings.press)
        }}
        onPressOut={() => {
          // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value write
          scale.value = withSpring(1, motionSprings.press)
        }}
        style={({ pressed }) => [
          styles.cardPressable,
          {
            opacity: pressed ? 0.96 : 1,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.card,
            borderStyle,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <View style={styles.topRow}>
            <Text style={[typography.eyebrow, { color: theme.colors.textMuted }]}>{label}</Text>
            <Animated.Text
              style={[typography.caption, hintStyle, { pointerEvents: 'none', color: theme.colors.textSoft }]}
            >
              Tap para editar
            </Animated.Text>
          </View>
          <Text
            style={[typography.hero, styles.value, { color: theme.colors.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            allowFontScaling
            maxFontSizeMultiplier={1.2}
          >
            {displayText}
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  cardPressable: {
    borderRadius: radii['2xl'],
  },
  card: {
    borderRadius: radii['2xl'],
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  value: {
    letterSpacing: -2,
  },
})
