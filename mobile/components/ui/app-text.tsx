import { forwardRef, type ComponentRef } from 'react'
import {
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
} from 'react-native'
import { useFontScaleFactor } from '@/features/preferences/font-scale-provider'
import { scaledTextOverrides } from '@/lib/font-scale'

/**
 * Text/TextInput de la app — reemplazo drop-in de los de react-native.
 *
 * 1. SIEMPRE apaga `allowFontScaling`: el fontScale del OS rompía la UI
 *    y quedó fuera de juego (spec 2026-08-14-font-scale-app-design.md).
 * 2. Aplica la escala elegida en Settings multiplicando fontSize /
 *    lineHeight / letterSpacing del style.
 * 3. `allowFontScaling={false}` explícito del consumidor = PINEADO:
 *    tampoco escala con la app. Respeta la curación existente (emojis,
 *    badges, chips que se rompen al escalar).
 * 4. Solo escala styles con `fontSize` declarado: un Text anidado sin
 *    fontSize hereda del padre ya escalado.
 *
 * Con factor 1 (default) es passthrough puro. La regla ESLint
 * no-restricted-imports fuerza que todo el código nuevo pase por acá.
 */
export const Text = forwardRef<ComponentRef<typeof RNText>, TextProps>(function AppText(props, ref) {
  const factor = useFontScaleFactor()
  const { allowFontScaling, style, ...rest } = props
  const pinned = allowFontScaling === false
  const overrides = pinned ? null : scaledTextOverrides(style, factor)
  return (
    <RNText
      ref={ref}
      {...rest}
      allowFontScaling={false}
      style={overrides ? [style, overrides] : style}
    />
  )
})

export const TextInput = forwardRef<ComponentRef<typeof RNTextInput>, TextInputProps>(
  function AppTextInput(props, ref) {
    const factor = useFontScaleFactor()
    const { allowFontScaling, style, ...rest } = props
    const pinned = allowFontScaling === false
    const overrides = pinned ? null : scaledTextOverrides(style, factor)
    return (
      <RNTextInput
        ref={ref}
        {...rest}
        allowFontScaling={false}
        style={overrides ? [style, overrides] : style}
      />
    )
  },
)
