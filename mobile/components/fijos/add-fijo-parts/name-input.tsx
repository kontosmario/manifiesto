// TextInput para el nombre del fijo. Mirror del border-glide pattern de
// `AmountCard` / `TextField`: anima color + width al toggle de focus,
// y SOLO color al toggle de warning (zero layout shift). Extraído de
// `add-fijo-v2-screen.tsx`.
import { useEffect } from 'react'
import { StyleSheet, TextInput } from 'react-native'
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { motionDurations } from '@/lib/motion'
import { useAppTheme } from '@/theme/theme-provider'

export interface NameInputProps {
  value: string
  onChange: (next: string) => void
  isFocused: boolean
  onFocus: () => void
  onBlur: () => void
  /** Same `warning` contract as `TextField` / `AmountCard`: glides the
   *  border tint to `theme.colors.warning` sin cambiar borderWidth así
   *  el field se puede marcar "required and unfilled" con cero layout
   *  shift. */
  warning?: boolean
}

export function NameInput({
  value,
  onChange,
  isFocused,
  onFocus,
  onBlur,
  warning = false,
}: NameInputProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const focusProgress = useSharedValue(isFocused ? 1 : 0)
  const warningProgress = useSharedValue(warning ? 1 : 0)

  // Mirror AmountCard: interpola border color + width al focus toggle
  // así la transición se siente idéntica cross-form.
  useEffect(() => {
    const target = isFocused ? 1 : 0
    focusProgress.value = reduceMotion
      ? target
      : withTiming(target, { duration: motionDurations.standard })
  }, [isFocused, reduceMotion, focusProgress])

  useEffect(() => {
    warningProgress.value = reduceMotion
      ? (warning ? 1 : 0)
      : withTiming(warning ? 1 : 0, {
          duration: motionDurations.standard,
          easing: Easing.bezier(0.32, 0.72, 0, 1),
        })
  }, [warning, reduceMotion, warningProgress])

  // Mismo nested-interpolate pattern que TextField/AmountCard: width
  // sólo sigue focus (no layout shift al toggle del warning), color
  // blendea entre el focus-derived normal color y el warning color via
  // warningProgress.
  const borderStyle = useAnimatedStyle(() => {
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

  return (
    <Animated.View
      style={[
        styles.textInputWrap,
        // Match AmountCard's `theme.colors.surface` así light mode lee un
        // solo bg tone (white) en ambos inputs.
        { backgroundColor: theme.colors.surface },
        borderStyle,
      ]}
    >
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder="Ej: Alquiler, Netflix, Cuota iPhone"
        placeholderTextColor={theme.colors.textSoft}
        style={[styles.textInputField, { color: theme.colors.text }]}
      />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  textInputWrap: {
    borderRadius: 14,
  },
  textInputField: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
  },
})
