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
          // Fija el tamaño de fuente del input para layout predecible (con el
          // "Texto más grande" de iOS el TextInput escalaba y descuadraba la
          // caja). Labels y helper sí escalan.
          allowFontScaling={false}
          // Sin botón de limpiar cuando hay trailing (ojo de contraseña), para
          // que la "x" nativa de iOS no se solape con el ícono absoluto.
          clearButtonMode={trailing ? 'never' : 'while-editing'}
          placeholderTextColor={theme.colors.textSoft}
          selectionColor={theme.colors.primary}
          style={[
            styles.inputField,
            {
              color: theme.colors.text,
              // El input es un hijo de ANCHO COMPLETO que se dimensiona por su
              // CONTENIDO (texto + este padding simétrico), igual que un
              // TextInput "pelado" → el texto se centra por su propia caja, sin
              // flex-stretch (que lo estiraba a la altura del wrap y mandaba el
              // texto ABAJO). Ver inputWrap. Multilínea ancla arriba.
              paddingVertical: isMultiline ? 12 : 16,
              // Lugar a la derecha para el trailing absoluto (ojo), para que el
              // texto no pase por debajo del ícono.
              paddingRight: trailing ? 44 : 14,
              textAlignVertical: isMultiline ? 'top' : 'center',
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
    minHeight: 54,
    justifyContent: 'center',
    // Layout en BLOQUE (sin flexDirection row ni flex en el input): el
    // TextInput es un hijo de ancho completo que se dimensiona por su CONTENIDO
    // (texto + padding vertical simétrico), igual que un TextInput "pelado"
    // (cf. delete-account-screen, que renderiza centrado) → el texto se centra
    // por su propia caja, SIN depender del alineado vertical de iOS ni de
    // flex-stretch (que estiraba el input a la altura del wrap y dejaba el
    // texto ABAJO — el bug reportado). El wrap solo garantiza el alto mínimo
    // (48) y centra el input si sobra espacio. El trailing (ojo) va absoluto.
  },
  inputField: {
    paddingHorizontal: 14,
    // El padding vertical lo define el render (simétrico ⇒ centrado).
    fontSize: 14,
    fontWeight: '600',
  },
  helper: {
    paddingHorizontal: 2,
  },
  trailing: {
    // Absoluto a la derecha, ocupando toda la altura del wrap (top/bottom 0)
    // para centrar verticalmente el ícono con el texto.
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    paddingRight: 8,
    paddingLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
