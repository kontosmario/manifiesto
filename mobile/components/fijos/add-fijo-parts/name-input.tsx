// TextInput para el nombre del fijo. Mirror del border-glide pattern de
// `AmountCard` / `TextField`: anima color + width al toggle de focus,
// y SOLO color al toggle de warning (zero layout shift). Extraído de
// `add-fijo-v2-screen.tsx`.
import { useEffect } from 'react'
import { StyleSheet, TextInput } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { motionDurations } from '@/lib/motion'
import { useFijosSkin } from '@/components/fijos/fijos-skin'
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
  const skin = useFijosSkin()
  const neo = skin.kind === 'neo' ? skin : null
  const { t } = useTranslation()
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
        // El handoff dibuja el campo como POZO (inset), no como card elevada:
        // comunica "acá se escribe". El borde animado se anula — el foco lo
        // sigue marcando el color del texto y el cursor.
        // `borderStyle` va DESPUÉS a propósito en classic: es el borde
        // animado de siempre. En neo NO puede ir después — pisaba el
        // `borderWidth: 0` de acá arriba y dejaba un anillo de 1px (2px al
        // foco, naranja con `flagName`) sobre un pozo que el handoff dibuja
        // sin borde. El foco lo marcan el cursor y el color del texto.
        neo
          ? {
              backgroundColor: neo.add.well.background,
              borderRadius: neo.add.well.radius,
              borderWidth: 0,
              boxShadow: neo.add.well.shadow,
            }
          : borderStyle,
      ]}
    >
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={t('fijos:wizard.step1.namePlaceholder')}
        // `textSoft` en oscuro es `#77E755` — verde flúor sobre el pozo.
        placeholderTextColor={neo ? neo.faintInk : theme.colors.textSoft}
        style={[
          styles.textInputField,
          { color: theme.colors.text },
          neo
            ? {
                paddingHorizontal: 17,
                paddingVertical: 15,
                fontSize: 17,
                fontWeight: '800',
                fontFamily: neo.font('800'),
                color: neo.ink.title,
              }
            : null,
        ]}
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
