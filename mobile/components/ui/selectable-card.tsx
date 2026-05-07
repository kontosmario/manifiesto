import { type ReactNode } from 'react'
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'
import { motionSprings } from '@/lib/motion'
import { triggerHaptic, type AppHapticTone } from '@/lib/haptics'

export type SelectableCardSize = 'sm' | 'md' | 'lg'

interface SelectableCardProps {
  selected: boolean
  onPress: () => void
  disabled?: boolean
  hapticTone?: AppHapticTone
  size?: SelectableCardSize
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
  children: ReactNode
}

const SIZE_PADDING: Record<SelectableCardSize, number> = {
  sm: 10,
  md: 14,
  lg: 18,
}

export function SelectableCard({
  selected,
  onPress,
  disabled,
  hapticTone = 'selection',
  size = 'md',
  style,
  accessibilityLabel,
  children,
}: SelectableCardProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const pressScale = useSharedValue(1)

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : pressScale.value }],
  }))

  const handlePress = () => {
    if (disabled) return
    void triggerHaptic(hapticTone)
    onPress()
  }

  return (
    <Animated.View style={[pressStyle, style]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled }}
        accessibilityLabel={accessibilityLabel}
        onPress={handlePress}
        onPressIn={() => {
          if (!disabled) {
             
            pressScale.value = withSpring(0.96, motionSprings.press)
          }
        }}
        onPressOut={() => {
           
          pressScale.value = withSpring(1, motionSprings.press)
        }}
        disabled={disabled}
        android_ripple={{
          color: theme.colors.primarySurface,
          borderless: false,
        }}
        style={({ pressed }) => [
          styles.card,
          {
            padding: SIZE_PADDING[size],
            backgroundColor: selected ? theme.colors.primarySurface : theme.colors.surface,
            borderColor: selected ? theme.brand.bright : theme.colors.border,
            borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
            opacity: disabled ? 0.5 : pressed ? 0.94 : 1,
          },
        ]}
      >
        {children}
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
