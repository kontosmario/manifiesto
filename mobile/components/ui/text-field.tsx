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
          // Fija el tamaño de fuente del input: con el "Texto más grande" /
          // Dynamic Type de iOS activado, el TextInput escalaba y la caja
          // crecía por encima de su alto de diseño (48pt), dejando hueco abajo
          // → el texto/placeholder caía al fondo (lo que se veía "corrido").
          // Los inputs de formularios se mantienen a tamaño fijo para layout
          // predecible (práctica estándar); labels y helper sí escalan.
          allowFontScaling={false}
          clearButtonMode="while-editing"
          placeholderTextColor={theme.colors.textSoft}
          selectionColor={theme.colors.primary}
          style={[
            styles.inputField,
            {
              color: theme.colors.text,
              // Centrado vertical A PRUEBA DE BALAS: el input single-line se
              // dimensiona por su CONTENIDO (alignSelf 'center' dentro de un
              // wrap `alignItems: 'center'`), NO se estira a la altura del
              // wrap. Así el texto se centra por su propia caja de padding
              // simétrico sin depender del alineado vertical de iOS — que con
              // el input estirado lo mandaba ABAJO. Y si el sistema agranda la
              // fuente (Dynamic Type / "Texto más grande"), la caja CRECE con
              // el contenido en vez de dejar hueco abajo, así que el texto
              // SIGUE centrado. Multilínea se estira (alignSelf 'stretch') y
              // ancla el texto arriba.
              paddingVertical: isMultiline ? 12 : 15,
              textAlignVertical: isMultiline ? 'top' : 'center',
              alignSelf: isMultiline ? 'stretch' : 'center',
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
    // `center`: el input single-line se centra por CONTENIDO (ver el override
    // de `paddingVertical`/`alignSelf` en el render). Antes usábamos `stretch`
    // para que el input llenara el wrap y fuera 100% tappable, pero estirarlo
    // hacía que iOS bottom-alineara el texto (y peor con Dynamic Type, donde
    // la caja crecía y dejaba hueco abajo). Con `center` + el padding simétrico
    // de 15pt el input mide ~47pt dentro del wrap de 48pt → el "strip"
    // no-tappable es <1pt (irrelevante, vs los ~6pt del problema original que
    // motivó `stretch`). El trailing (ojo) usa `alignSelf: 'stretch'` para
    // seguir ocupando toda la altura y centrar su ícono con el texto.
    alignItems: 'center',
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
    paddingRight: 8,
    paddingLeft: 4,
    // Ocupa toda la altura del wrap (que ahora centra a sus hijos) para que el
    // ojo de PasswordField (flex:1, centrado) quede alineado con el texto.
    alignSelf: 'stretch',
  },
})
