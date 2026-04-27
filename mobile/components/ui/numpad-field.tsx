import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { InAppNumpad } from '@/components/ui/in-app-numpad'
import { motionDurations } from '@/lib/motion'
import { brand, radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface NumpadFieldProps {
  label: string
  helper?: string
  /** Raw value, same shape the InAppNumpad emits (digits + optional comma). */
  value: string
  onChangeRawValue: (next: string) => void
  /** Placeholder shown when value is empty. Default: "0". */
  placeholder?: string
  /** Format raw → display. Default: passthrough, replacing empty with placeholder. */
  formatDisplay?: (raw: string) => string
  maxIntegerDigits?: number
  maxDecimalDigits?: number
  /** Label for the numpad's "Listo" button. */
  doneLabel?: string
  /** Visual error state — outlines the field in danger color. */
  hasError?: boolean
  /** Open the numpad on mount. */
  autoOpen?: boolean
  /** Disables the field entirely. */
  disabled?: boolean
}

/**
 * Numeric field that opens the shared InAppNumpad sheet on tap instead
 * of the OS keyboard. Visually mirrors `TextField` so it drops in for
 * the same use cases (money amounts, percentages, days, counts) and
 * keeps the app's input language unified.
 */
export function NumpadField({
  label,
  helper,
  value,
  onChangeRawValue,
  placeholder = '0',
  formatDisplay,
  maxIntegerDigits,
  maxDecimalDigits,
  doneLabel,
  hasError = false,
  autoOpen = false,
  disabled = false,
}: NumpadFieldProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const [isOpen, setIsOpen] = useState(autoOpen && !disabled)
  const focusProgress = useSharedValue(autoOpen ? 1 : 0)

  useEffect(() => {
    if (!autoOpen || disabled) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- autoOpen syncs open state on mount
    setIsOpen(true)
  }, [autoOpen, disabled])

  useEffect(() => {
    const target = isOpen ? 1 : 0
    focusProgress.value = reduceMotion
      ? target
      : withTiming(target, { duration: motionDurations.standard })
  }, [isOpen, reduceMotion, focusProgress])

  const boxAnimatedStyle = useAnimatedStyle(() => ({
    borderColor: hasError
      ? theme.colors.danger
      : interpolateColor(
          focusProgress.value,
          [0, 1],
          [theme.colors.border, brand.deep],
        ),
    borderWidth: 1 + focusProgress.value,
  }))

  const labelAnimatedStyle = useAnimatedStyle(() => ({
    color: hasError
      ? theme.colors.danger
      : interpolateColor(
          focusProgress.value,
          [0, 1],
          [theme.colors.textMuted, brand.deep],
        ),
  }))

  const displayText =
    value.length > 0
      ? (formatDisplay ? formatDisplay(value) : value)
      : placeholder
  const isPlaceholder = value.length === 0

  const handleOpen = () => {
    if (disabled) return
    setIsOpen(true)
  }

  return (
    <View style={styles.container}>
      {label ? (
        <Animated.Text style={[styles.label, theme.typography.fieldLabel, labelAnimatedStyle]}>
          {label}
        </Animated.Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, expanded: isOpen }}
        disabled={disabled}
        onPress={handleOpen}
      >
        <Animated.View
          style={[
            styles.box,
            boxAnimatedStyle,
            {
              backgroundColor: theme.colors.surfaceMuted,
              opacity: disabled ? 0.5 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.value,
              theme.typography.body,
              {
                color: isPlaceholder ? theme.colors.textSoft : theme.colors.text,
              },
            ]}
            numberOfLines={1}
          >
            {displayText}
          </Text>
        </Animated.View>
      </Pressable>
      {helper ? (
        <Text
          style={[
            styles.helper,
            theme.typography.bodySmall,
            { color: hasError ? theme.colors.danger : theme.colors.textSoft },
          ]}
        >
          {helper}
        </Text>
      ) : null}
      <InAppNumpad
        visible={isOpen}
        rawValue={value}
        onChangeRawValue={onChangeRawValue}
        onDismiss={() => setIsOpen(false)}
        maxIntegerDigits={maxIntegerDigits}
        maxDecimalDigits={maxDecimalDigits}
        doneLabel={doneLabel}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {},
  box: {
    minHeight: 54,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  value: {
    paddingVertical: 2,
  },
  helper: {
    paddingHorizontal: 2,
  },
})
