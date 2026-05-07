import { useCallback } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { AppSymbol } from '@/components/ui/app-symbol'
import { AppButton } from '@/components/ui/button'
import {
  appendComma,
  appendDigit,
  backspace,
  clearAll,
} from '@/components/ui/in-app-numpad-model'
import { triggerHaptic } from '@/lib/haptics'
import { motionSprings } from '@/lib/motion'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface NumpadGridProps {
  rawValue: string
  onChangeRawValue: (value: string) => void
  onDone: () => void
  doneLabel?: string
  maxIntegerDigits?: number
  maxDecimalDigits?: number
  /** Disables the primary done button (e.g., invalid value). */
  doneDisabled?: boolean
  /** Shows a loading spinner on the done button. */
  doneLoading?: boolean
  /** Skip rendering the integrated done button. Use when the caller
   *  wants to render its own primary action separate from the keys
   *  (e.g., `NumericEditSheet` which dims only the keys when disabled). */
  hideDoneButton?: boolean
}

const ROWS: readonly (readonly (string | 'backspace')[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [',', '0', 'backspace'],
]

/**
 * 3×4 numeric grid + primary "done" button. Stateless — the caller
 * owns the raw string and decides what to do on done. Used by both the
 * standalone `InAppNumpad` (bottom sheet keyboard) and the unified
 * `NumericEditSheet` (single sheet with display + numpad combined).
 */
export function NumpadGrid({
  rawValue,
  onChangeRawValue,
  onDone,
  doneLabel = 'Listo',
  maxIntegerDigits = 8,
  maxDecimalDigits = 2,
  doneDisabled = false,
  doneLoading = false,
  hideDoneButton = false,
}: NumpadGridProps) {
  const handleDigit = useCallback(
    (digit: string) => {
      void triggerHaptic('selection')
      onChangeRawValue(
        appendDigit(rawValue, digit, { maxIntegerDigits, maxDecimalDigits }),
      )
    },
    [onChangeRawValue, rawValue, maxIntegerDigits, maxDecimalDigits],
  )

  const handleComma = useCallback(() => {
    void triggerHaptic('selection')
    onChangeRawValue(appendComma(rawValue))
  }, [onChangeRawValue, rawValue])

  const handleBackspace = useCallback(() => {
    void triggerHaptic('light')
    onChangeRawValue(backspace(rawValue))
  }, [onChangeRawValue, rawValue])

  const handleClearAll = useCallback(() => {
    void triggerHaptic('warning')
    onChangeRawValue(clearAll())
  }, [onChangeRawValue])

  const handleDone = useCallback(() => {
    if (doneDisabled || doneLoading) return
    void triggerHaptic('selection')
    onDone()
  }, [doneDisabled, doneLoading, onDone])

  const handleKeyPress = useCallback(
    (key: string | 'backspace') => {
      if (key === 'backspace') return handleBackspace()
      if (key === ',') return handleComma()
      return handleDigit(key)
    },
    [handleBackspace, handleComma, handleDigit],
  )

  return (
    <View style={styles.content}>
      {hideDoneButton ? null : (
        <AppButton
          variant="primary"
          label={doneLabel}
          onPress={handleDone}
          disabled={doneDisabled}
          loading={doneLoading}
        />
      )}
      <View style={styles.grid}>
        {ROWS.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((key) => (
              <NumpadKey
                key={key}
                label={key === 'backspace' ? undefined : key}
                icon={key === 'backspace' ? 'delete.backward.fill' : undefined}
                iconFallback={key === 'backspace' ? 'backspace' : undefined}
                accessibilityLabel={
                  key === 'backspace'
                    ? 'Borrar último dígito'
                    : key === ','
                      ? 'Coma'
                      : key
                }
                accessibilityHint={
                  key === 'backspace'
                    ? 'Mantené presionado para limpiar todo'
                    : undefined
                }
                onPress={() => handleKeyPress(key)}
                onLongPress={key === 'backspace' ? handleClearAll : undefined}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}

interface NumpadKeyProps {
  label?: string
  icon?: string
  iconFallback?: string
  onPress: () => void
  onLongPress?: () => void
  accessibilityLabel?: string
  accessibilityHint?: string
}

function NumpadKey({
  label,
  icon,
  iconFallback,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
}: NumpadKeyProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : scale.value }],
  }))

  return (
    <Animated.View style={[styles.keyWrap, animatedStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label ?? ''}
        accessibilityHint={accessibilityHint}
        onPressIn={() => {
          if (reduceMotion) return
           
          scale.value = withSpring(0.92, motionSprings.press)
        }}
        onPressOut={() => {
           
          scale.value = withSpring(1, motionSprings.press)
        }}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={450}
        style={({ pressed }) => [
          styles.key,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        {label ? (
          <Text style={[typography.titleMedium, styles.keyLabel, { color: theme.colors.text }]}>
            {label}
          </Text>
        ) : icon ? (
          <AppSymbol
            name={icon}
            fallback={(iconFallback ?? 'backspace') as never}
            size={22}
            color={theme.colors.textMuted}
          />
        ) : null}
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    gap: 12,
  },
  grid: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  keyWrap: {
    flex: 1,
  },
  key: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingVertical: 18,
    minHeight: 56,
  },
  keyLabel: {
    fontSize: 24,
  },
})
