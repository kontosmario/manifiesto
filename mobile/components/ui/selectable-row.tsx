import { type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated'
import { AppSymbol } from './app-symbol'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { motionSprings } from '@/lib/motion'
import { triggerHaptic, type AppHapticTone } from '@/lib/haptics'

interface SelectableRowProps {
  selected: boolean
  onPress: () => void
  title: string
  meta?: string
  leading?: ReactNode
  disabled?: boolean
  hapticTone?: AppHapticTone
  style?: StyleProp<ViewStyle>
}

export function SelectableRow({
  selected,
  onPress,
  title,
  meta,
  leading,
  disabled,
  hapticTone = 'selection',
  style,
}: SelectableRowProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const pressScale = useSharedValue(1)
  const checkScale = useSharedValue(selected ? 1 : 0)

  checkScale.value = reduceMotion
    ? (selected ? 1 : 0)
    : withSpring(selected ? 1 : 0, motionSprings.celebrate)

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : pressScale.value }],
  }))

  const checkStyle = useAnimatedStyle(() => ({
    opacity: checkScale.value,
    transform: [{ scale: checkScale.value }],
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
        onPress={handlePress}
        onPressIn={() => {
          if (!disabled) {
             
            pressScale.value = withSpring(0.97, motionSprings.press)
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
          styles.row,
          {
            backgroundColor: selected ? theme.colors.primarySurface : 'transparent',
            borderColor: selected ? theme.brand.bright : theme.colors.border,
            opacity: disabled ? 0.5 : pressed ? 0.92 : 1,
          },
        ]}
      >
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <View style={styles.body}>
          <Text style={[typography.bodyLarge, { color: theme.colors.text }]}>{title}</Text>
          {meta ? (
            <Text style={[typography.caption, styles.meta, { color: theme.colors.textMuted }]}>
              {meta}
            </Text>
          ) : null}
        </View>
        <Animated.View style={[styles.check, checkStyle]}>
          <AppSymbol
            name="checkmark.circle.fill"
            fallback="check-circle"
            size={22}
            color={theme.brand.bright}
          />
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  leading: { justifyContent: 'center' },
  body:    { flex: 1, justifyContent: 'center' },
  meta:    { marginTop: 2 },
  check:   { justifyContent: 'center' },
})
