import { useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useReducedMotion,
  interpolateColor,
} from 'react-native-reanimated'
import { motionDurations } from '@/lib/motion'
import { brand, radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput)

interface TextFieldProps extends TextInputProps {
  label: string
  helper?: string
}

export function TextField({ label, helper, style, ...inputProps }: TextFieldProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const [isFocused, setFocused] = useState(false)
  const focusProgress = useSharedValue(0)
  const isMultiline = Boolean(inputProps.multiline)

  useEffect(() => {
    focusProgress.value = reduceMotion
      ? (isFocused ? 1 : 0)
      : withTiming(isFocused ? 1 : 0, { duration: motionDurations.standard })
  }, [isFocused, reduceMotion, focusProgress])

  const inputAnimatedStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focusProgress.value,
      [0, 1],
      [theme.colors.border, brand.deep],
    ),
    borderWidth: 1 + focusProgress.value,
  }))

  const labelAnimatedStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      focusProgress.value,
      [0, 1],
      [theme.colors.textMuted, brand.deep],
    ),
  }))

  return (
    <View style={styles.container}>
      {label ? (
        <Animated.Text
          style={[styles.label, theme.typography.fieldLabel, labelAnimatedStyle]}
        >
          {label}
        </Animated.Text>
      ) : null}
      <AnimatedTextInput
        clearButtonMode="while-editing"
        placeholderTextColor={theme.colors.textSoft}
        selectionColor={brand.deep}
        style={[
          styles.input,
          theme.typography.body,
          inputAnimatedStyle,
          {
            backgroundColor: theme.colors.surfaceMuted,
            color: theme.colors.text,
            paddingBottom: isMultiline ? 14 : 0,
            paddingTop: isMultiline ? 14 : 0,
            textAlignVertical: isMultiline ? 'top' : 'center',
          },
          style,
        ]}
        onBlur={(event) => {
          setFocused(false)
          inputProps.onBlur?.(event)
        }}
        onFocus={(event) => {
          setFocused(true)
          inputProps.onFocus?.(event)
        }}
        {...inputProps}
      />
      {helper ? (
        <Text style={[styles.helper, theme.typography.bodySmall, { color: theme.colors.textSoft }]}>
          {helper}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {},
  input: {
    minHeight: 54,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
  },
  helper: {
    paddingHorizontal: 2,
  },
})
