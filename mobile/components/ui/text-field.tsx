import { forwardRef, useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import Animated, {
  Easing,
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
  /** Swaps the focus-target border color from `primary` to `warning`
   *  so the field reads as "required and currently empty" without
   *  shouting via a full danger ring. Used by the import-review wizard
   *  to mark only the unfilled required fields after a disabled-CTA
   *  tap. Label color follows. */
  warning?: boolean
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
  { label, helper, trailing, style, warning = false, ...inputProps },
  ref,
) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const [isFocused, setFocused] = useState(false)
  const focusProgress = useSharedValue(0)
  const warningProgress = useSharedValue(warning ? 1 : 0)
  const isMultiline = Boolean(inputProps.multiline)

  useEffect(() => {
    focusProgress.value = reduceMotion
      ? (isFocused ? 1 : 0)
      : withTiming(isFocused ? 1 : 0, { duration: motionDurations.standard })
  }, [isFocused, reduceMotion, focusProgress])

  // Soft transition into/out of warning. iOS-cubic ease at standard
  // duration so the tint glides in rather than snapping — same curve
  // the focus animation uses, so a focused warning field feels like
  // one continuous motion.
  useEffect(() => {
    warningProgress.value = reduceMotion
      ? (warning ? 1 : 0)
      : withTiming(warning ? 1 : 0, {
          duration: motionDurations.standard,
          easing: Easing.bezier(0.32, 0.72, 0, 1),
        })
  }, [warning, reduceMotion, warningProgress])

  // `borderWidth` is decoupled from `warning` — only `focusProgress`
  // moves it (1 → 2 on focus). This avoids the +0.5px jump the previous
  // implementation introduced when warning toggled, which subtly
  // resized the row and felt jittery on the wizard.
  //
  // `borderColor` nests two interpolations:
  //   1. The "would-be" color at the current focus level in normal mode
  //      (line → primary).
  //   2. The "would-be" color at the current focus level in warning
  //      mode (warning → warning).
  //   3. Blend between the two by `warningProgress` (0..1).
  // Both inner calls return color strings; Reanimated's
  // `interpolateColor` accepts string anchors, so the outer call lerps
  // cleanly between them.
  const wrapAnimatedStyle = useAnimatedStyle(() => {
    'worklet'
    const normalColor = interpolateColor(
      focusProgress.value,
      [0, 1],
      [theme.colors.line, theme.colors.primary],
    )
    const warnColor = interpolateColor(
      focusProgress.value,
      [0, 1],
      [theme.colors.warning, theme.colors.warning],
    )
    return {
      borderColor: interpolateColor(
        warningProgress.value,
        [0, 1],
        [normalColor, warnColor],
      ),
      borderWidth: 1 + focusProgress.value,
    }
  })

  // Label color also blends rather than snapping.
  const labelAnimatedStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      warningProgress.value,
      [0, 1],
      [theme.colors.textMuted, theme.colors.warning],
    ),
  }))

  return (
    <View style={styles.container}>
      {label ? (
        <Animated.Text style={[typography.eyebrow, labelAnimatedStyle]}>
          {label}
        </Animated.Text>
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
