import { forwardRef, useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useReducedMotion,
  interpolateColor,
} from 'react-native-reanimated'
import { motionDurations } from '@/lib/motion'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface TextFieldProps extends TextInputProps {
  label: string
  helper?: string
  /** Optional element rendered to the right of the input inside the
   *  border-animated wrap. Used for affordances like password
   *  visibility toggles. */
  trailing?: ReactNode
}

/**
 * Shared labeled input. Mirrors AddFijo's NameInput pattern:
 *   · Static eyebrow label above (uppercase, letter-spaced).
 *   · `Animated.View` wrapper holds the border + bg, so the
 *     border interpolation actually renders on iOS/Android — when
 *     the animated style is applied directly to a TextInput, native
 *     drops the border updates and the focus ring never appears.
 *   · Border interpolates `theme.colors.line` ↔ `theme.colors.primary`
 *     (theme-mapped: brand.deep light, brand.bright dark).
 *   · borderWidth animates 1 → 2 to feel like the input "lifts".
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, helper, trailing, style, ...inputProps },
  ref,
) {
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

  const wrapAnimatedStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focusProgress.value,
      [0, 1],
      [theme.colors.line, theme.colors.primary],
    ),
    borderWidth: 1 + focusProgress.value,
  }))

  return (
    <View style={styles.container}>
      {label ? (
        <Text style={[typography.eyebrow, { color: theme.colors.textMuted }]}>
          {label}
        </Text>
      ) : null}
      <Animated.View
        style={[
          styles.inputWrap,
          { backgroundColor: theme.colors.surface },
          wrapAnimatedStyle,
        ]}
      >
        <TextInput
          ref={ref}
          clearButtonMode="while-editing"
          placeholderTextColor={theme.colors.textSoft}
          selectionColor={theme.colors.primary}
          style={[
            styles.inputField,
            {
              color: theme.colors.text,
              paddingTop: isMultiline ? 12 : 0,
              paddingBottom: isMultiline ? 12 : 0,
              textAlignVertical: isMultiline ? 'top' : 'center',
              flex: 1,
            },
            style,
          ]}
          {...inputProps}
          onBlur={(event) => {
            setFocused(false)
            inputProps.onBlur?.(event)
          }}
          onFocus={(event) => {
            setFocused(true)
            inputProps.onFocus?.(event)
          }}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </Animated.View>
      {helper ? (
        <Text
          style={[
            typography.bodySmall,
            styles.helper,
            { color: theme.colors.textSoft },
          ]}
        >
          {helper}
        </Text>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  inputWrap: {
    borderRadius: radii.lg,
    minHeight: 48,
    flexDirection: 'row',
    // `stretch` (no `center`) so the TextInput fills the full wrap
    // height. With `alignItems: 'center'` the TextInput was sized
    // to its content + padding and the leftover ~6pt of vertical
    // space inside the wrap was non-focusable Animated.View. Tapping
    // that strip blurred whatever input was focused but didn't
    // re-focus the new one — ScrollView's `keyboardShouldPersistTaps`
    // saw the tap as "outside an input" and dismissed the keyboard.
    alignItems: 'stretch',
  },
  inputField: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  helper: {
    paddingHorizontal: 2,
  },
  trailing: {
    paddingRight: 8,
    paddingLeft: 4,
  },
})
