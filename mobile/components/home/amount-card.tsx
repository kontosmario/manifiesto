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
import { brand, radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface AmountCardProps {
  amount: number
  isActive: boolean
  onPress: () => void
}

export function AmountCard({ amount, isActive, onPress }: AmountCardProps) {
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

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      activeProgress.value,
      [0, 1],
      [theme.colors.border, brand.deep],
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
            <Text style={[typography.eyebrow, { color: theme.colors.textMuted }]}>Monto</Text>
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
