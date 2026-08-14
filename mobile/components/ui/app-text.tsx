import { forwardRef, type ComponentRef } from 'react'
import {
  Text as RNText,
  TextInput as RNTextInput,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from 'react-native'
import Animated, { type AnimatedProps } from 'react-native-reanimated'
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

/**
 * `Animated.Text` de Reanimated con el mismo contrato que `Text`.
 *
 * El texto animado NO puede pasar por el wrapper de arriba: `entering`,
 * `exiting` y los estilos derivados de `useAnimatedStyle` los consume el
 * componente que creó Reanimated, no un `RNText` cualquiera. Esta capa
 * es transparente para esos props (viajan por `...rest`) y sólo agrega
 * las dos cosas de la escala propia: apaga el `allowFontScaling` nativo
 * y multiplica las métricas de fuente del style.
 *
 * Los overrides se componen ÚLTIMOS pero no pisan ninguna animación:
 * ningún sitio del repo anima `fontSize`/`lineHeight`/`letterSpacing`
 * (lo que sí animan es color, opacidad y transform). El objeto que
 * devuelve `useAnimatedStyle` es un `{ initial, viewDescriptors }` plano
 * sin métricas de fuente, así que aplanarlo para leer el `fontSize` es
 * inocuo.
 */
export const AnimatedText = forwardRef<
  ComponentRef<typeof RNText>,
  AnimatedProps<TextProps>
>(function AppAnimatedText(props, ref) {
  const factor = useFontScaleFactor()
  const { allowFontScaling, style, ...rest } = props
  const pinned = allowFontScaling === false
  const overrides = pinned
    ? null
    : scaledTextOverrides(style as StyleProp<TextStyle>, factor)
  return (
    <Animated.Text
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
