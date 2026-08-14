import { forwardRef, useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, View, type TextInputProps } from 'react-native'
import type { TextInput as RNTextInput } from 'react-native'
import { Text, TextInput } from '@/components/ui/app-text'
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
import { nunitoFamily, typography } from '@/theme/typography'
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
export const TextField = forwardRef<RNTextInput, TextFieldProps>(function TextField(
  { label, helper, trailing, style, warning = false, ...inputProps },
  ref,
) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const [isFocused, setFocused] = useState(false)
  const focusProgress = useSharedValue(0)
  const warningProgress = useSharedValue(warning ? 1 : 0)
  const isMultiline = Boolean(inputProps.multiline)

  // Placeholder PROPIO (single-line): el placeholder NATIVO de iOS se dibuja
  // bottom-aligned aunque el texto tipeado se centre — bug de RCTUITextField
  // (`placeholderRect` ≠ `textRect`) que NO se corrige con padding ni altura.
  // Lo renderizamos como un <Text> superpuesto y centrado por flexbox (que sí
  // controlamos). Multilínea conserva el placeholder nativo (ancla arriba, OK).
  const { placeholder, value: valueProp, onChangeText, ...restInputProps } =
    inputProps
  const [localText, setLocalText] = useState('')
  const effectiveText = valueProp !== undefined ? valueProp : localText
  const showCustomPlaceholder =
    !isMultiline && Boolean(placeholder) && (effectiveText ?? '').length === 0

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
          placeholder={isMultiline ? placeholder : undefined}
          placeholderTextColor={theme.colors.textSoft}
          selectionColor={theme.colors.primary}
          style={[
            styles.inputField,
            {
              color: theme.colors.text,
              // SINGLE-LINE: alto EXPLÍCITO (52) + paddingVertical 0. iOS
              // `UITextField` con `contentVerticalAlignment = .center` (default
              // de RN para single-line) centra DENTRO de ese alto TANTO el texto
              // tipeado COMO el placeholder → dejan de divergir. El bug: cuando
              // el input tiene padding vertical interno, su área de contenido
              // queda más alta que la línea; iOS centra el texto vivo (vía
              // contentVerticalAlignment) pero dibuja el placeholder con otro
              // offset (`placeholderRect` ≠ `textRect`) → placeholder bajo. El
              // alto explícito también evita que el input vacío colapse a ~0
              // (lo que antes hacía desaparecer el placeholder).
              // MULTILÍNEA: SIN alto fijo (debe crecer con el contenido) +
              // padding propio + ancla arriba.
              height: isMultiline ? undefined : 52,
              paddingVertical: isMultiline ? 12 : 0,
              // Lugar a la derecha para el trailing absoluto (ojo), para que el
              // texto no pase por debajo del ícono.
              paddingRight: trailing ? 44 : 14,
              textAlignVertical: isMultiline ? 'top' : 'center',
            },
            style,
          ]}
          {...restInputProps}
          value={valueProp}
          onChangeText={(text) => {
            // Para inputs no controlados, trackeamos el texto local para
            // decidir si mostrar el placeholder propio.
            if (valueProp === undefined) setLocalText(text)
            onChangeText?.(text)
          }}
          onBlur={(event) => {
            setFocused(false)
            restInputProps.onBlur?.(event)
          }}
          onFocus={(event) => {
            setFocused(true)
            restInputProps.onFocus?.(event)
          }}
        />
        {showCustomPlaceholder ? (
          <View
            style={[styles.placeholderOverlay, { right: trailing ? 44 : 14 }]}
            pointerEvents="none"
          >
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={[styles.placeholderText, { color: theme.colors.textSoft }]}
            >
              {placeholder}
            </Text>
          </View>
        ) : null}
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
    // El wrap NO agrega padding vertical ni justifyContent: el alto lo DEFINE el
    // input. Single-line: el input tiene `height: 52` → la caja mide 52 y centra
    // texto + placeholder. Multilínea: el input crece con su contenido y el wrap
    // lo sigue; `minHeight: 52` es solo un piso (coincide con el alto single-line,
    // no pelea con él). Cualquier paddingVertical/justifyContent en el wrap
    // reintroduce espacio sobrante donde el placeholder vuelve a derivar.
    minHeight: 52,
    // El trailing (ojo) va posicionado absoluto a la derecha (ver `trailing`).
  },
  inputField: {
    paddingHorizontal: 14,
    // Sin padding vertical aquí: el render lo setea (0 single-line / 12 multi).
    fontSize: 14,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
  helper: {
    paddingHorizontal: 2,
  },
  // Placeholder propio: superpuesto sobre el input, centrado verticalmente por
  // flexbox (top/bottom 0 + justifyContent center). `left: 14` matchea el
  // paddingHorizontal del input; `right` se setea en línea (44 si hay ojo).
  placeholderOverlay: {
    position: 'absolute',
    left: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
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
