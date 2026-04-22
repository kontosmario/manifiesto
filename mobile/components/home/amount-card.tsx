import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated'
import { AnimatedAmount } from '@/components/ui/animated-amount'
import { triggerHaptic } from '@/lib/haptics'
import { motionSprings } from '@/lib/motion'
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

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : scale.value }],
  }))

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Monto: ${amount}`}
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
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: isActive ? brand.deep : theme.colors.border,
            borderWidth: isActive ? 2 : StyleSheet.hairlineWidth,
            opacity: pressed ? 0.96 : 1,
          },
        ]}
      >
        <View style={styles.topRow}>
          <Text style={[typography.eyebrow, { color: theme.colors.textMuted }]}>Monto</Text>
          {!isActive ? (
            <Text style={[typography.caption, { color: theme.colors.textSoft }]}>
              Tap para editar
            </Text>
          ) : null}
        </View>
        <AnimatedAmount
          value={amount}
          variant="hero"
          color={theme.colors.text}
          style={styles.value}
        />
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii['2xl'],
    paddingHorizontal: 22,
    paddingVertical: 20,
    gap: 6,
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
