import { useEffect, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated'
import { useAppTheme } from '@/theme/theme-provider'
import { typography } from '@/theme/typography'

interface InputGroupProps {
  label?: string
  helper?: string
  error?: string
  required?: boolean
  children: ReactNode
}

export function InputGroup({ label, helper, error, required, children }: InputGroupProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const shake = useSharedValue(0)

  useEffect(() => {
    if (!error || reduceMotion) return
    shake.value = withSequence(
      withTiming(-4, { duration: 60 }),
      withTiming(4, { duration: 60 }),
      withTiming(-3, { duration: 60 }),
      withTiming(3, { duration: 60 }),
      withTiming(0, { duration: 60 }),
    )
  }, [error, reduceMotion, shake])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }))

  const helperColor = error ? theme.colors.danger : theme.colors.textMuted
  const helperText = error ?? helper

  return (
    <View style={styles.container}>
      {label ? (
        <Text
          style={[typography.fieldLabel, styles.label, { color: theme.colors.textMuted }]}
          accessibilityRole="text"
        >
          {label}
          {required ? ' *' : ''}
        </Text>
      ) : null}
      <Animated.View style={animatedStyle}>{children}</Animated.View>
      {helperText ? (
        <Text
          style={[typography.caption, styles.helper, { color: helperColor }]}
          accessibilityLiveRegion={error ? 'polite' : 'none'}
        >
          {helperText}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  label:     { marginBottom: 2 },
  helper:    { marginTop: 4 },
})
