import { forwardRef, useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, View, type TextInputProps } from 'react-native'
import type { TextInput as RNTextInput } from 'react-native'
import { AnimatedText, Text, TextInput } from '@/components/ui/app-text'
import {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionDurations } from '@/lib/motion'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

interface NeoTextFieldProps extends TextInputProps {
  label: string
  helper?: string
  /** Optional element rendered to the right of the input inside the
   *  well. Used for affordances like password visibility toggles. */
  trailing?: ReactNode
  /** Marca el campo como "requerido y todavía vacío" sin gritar: tinta y
   *  anillo pasan al naranja de alerta. Mismo contrato que `TextField`
   *  (lo usa el wizard de import-review tras un tap del CTA
   *  deshabilitado). */
  warning?: boolean
  /** Mensaje de error. Manda sobre `helper` (se muestra en su lugar) y
   *  lleva el anillo del pozo al rojo del tema. */
  error?: string
}

/**
 * Campo de texto del rediseño neumórfico. Misma superficie de props que
 * `TextField` para que el swap en los call sites sea mecánico.
 *
 * En el vocabulario neo el campo es un POZO: no tiene borde y los estados
 * (foco / warning / error) se comunican cambiando la receta de relieve,
 * no pintando un contorno. Como RN no interpola strings de `boxShadow`,
 * el foco hace swap DISCRETO de receta —pozo → pozo con anillo— y la
 * continuidad la aporta el label, que sí cruza de color con
 * `interpolateColor`.
 */
export const NeoTextField = forwardRef<RNTextInput, NeoTextFieldProps>(function NeoTextField(
  { label, helper, trailing, style, warning = false, error, ...inputProps },
  ref,
) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const ink = neoInk(theme.mode)
  const reduceMotion = useReducedMotion()
  const [isFocused, setFocused] = useState(false)
  const focusProgress = useSharedValue(0)
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
    const target = isFocused ? 1 : 0
    focusProgress.value = reduceMotion
      ? target
      : withTiming(target, { duration: motionDurations.standard })
  }, [isFocused, reduceMotion, focusProgress])

  const hasError = Boolean(error)
  // El ANILLO usa el color de MATERIAL (a un borde le alcanza 3:1); la TINTA
  // del label y del mensaje usa `neoInk`, que es la variante corregida por
  // contraste para texto chico sobre el pozo claro.
  const toneRing = hasError ? neo.danger : warning ? neo.warm : null
  const toneInk = hasError ? ink.danger : warning ? ink.warn : null
  const footnote = hasError ? error : helper

  const boxShadow = toneRing
    ? `${neo.shadows.insetLg}, 0 0 0 2px ${toneRing}`
    : isFocused
      ? neo.shadows.ringSelected
      : neo.shadows.insetLg

  const labelAnimatedStyle = useAnimatedStyle(() => ({
    color: toneInk
      ? toneInk
      : interpolateColor(focusProgress.value, [0, 1], [neo.textMuted, ink.accent]),
  }))

  return (
    <View style={styles.container}>
      {label ? (
        <AnimatedText style={[styles.label, labelAnimatedStyle]}>
          {label}
        </AnimatedText>
      ) : null}
      <View
        style={[
          styles.well,
          {
            backgroundColor: neo.well,
            boxShadow,
            // Android < API 29 descarta el inset EN SILENCIO (y < 28 también
            // el anillo outset): sin este límite el pozo y el estado de foco
            // desaparecen por completo. Ver `SUPPORTS_INSET_SHADOW`.
            borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1.5,
            borderColor: toneRing ?? (isFocused ? neo.green : neo.sheetDivider),
          },
        ]}
      >
        <TextInput
          ref={ref}
          // El contenido del campo ESCALA con la preferencia de la app, igual
          // que su label y su helper: si el input queda pineado, a "Muy grande"
          // el texto secundario termina más grande que lo que el usuario está
          // tipeando y la jerarquía se invierte. Antes estaba fijo porque el
          // "Texto más grande" de iOS llegaba a 3.57× y descuadraba la caja;
          // ese escalado ya no llega (el wrapper apaga el del OS) y el propio
          // topea en 1.2×: 16 → 19.2pt, con sobra dentro de los 54 de alto.
          // Sin botón de limpiar cuando hay trailing (ojo de contraseña), para
          // que la "x" nativa de iOS no se solape con el ícono absoluto.
          clearButtonMode={trailing ? 'never' : 'while-editing'}
          placeholder={isMultiline ? placeholder : undefined}
          // Placeholder en `textMuted`: `textTertiary` sobre el pozo claro da
          // 2.1:1 y este texto mide 16px.
          placeholderTextColor={neo.textMuted}
          selectionColor={neo.green}
          style={[
            styles.input,
            {
              color: neo.text,
              // SINGLE-LINE: alto EXPLÍCITO (54) + paddingVertical 0. iOS
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
              height: isMultiline ? undefined : 54,
              paddingVertical: isMultiline ? 14 : 0,
              // Lugar a la derecha para el trailing absoluto (ojo), para que el
              // texto no pase por debajo del ícono.
              paddingRight: trailing ? 46 : 16,
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
            style={[styles.placeholderOverlay, { right: trailing ? 46 : 16 }]}
            pointerEvents="none"
          >
            {/* Escala CON el input (misma métrica, mismo factor): pineado sólo
                él, a "Muy grande" la pista quedaba más chica que el texto que
                reemplaza y saltaba de tamaño al empezar a tipear. */}
            <Text
              numberOfLines={1}
              style={[styles.placeholderText, { color: neo.textMuted }]}
            >
              {placeholder}
            </Text>
          </View>
        ) : null}
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
      {footnote ? (
        <Text style={[styles.helper, { color: toneInk ?? neo.textMuted }]}>
          {footnote}
        </Text>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  // El `fontFamily` viaja con el peso: sin él el 800 de Nunito se
  // renderiza regular.
  label: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  well: {
    borderRadius: neoRadii.input,
    // El pozo NO agrega padding vertical ni justifyContent: el alto lo DEFINE
    // el input (54 single-line / crecido en multilínea). Cualquier
    // paddingVertical acá reintroduce espacio sobrante donde el placeholder
    // vuelve a derivar. `minHeight` es sólo un piso para el caso multilínea.
    minHeight: 54,
  },
  input: {
    paddingHorizontal: 16,
    // Sin padding vertical acá: el render lo setea (0 single-line / 14 multi).
    fontSize: 16,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  // Placeholder propio: superpuesto sobre el input, centrado verticalmente por
  // flexbox (top/bottom 0 + justifyContent center). `left: 16` matchea el
  // paddingHorizontal del input; `right` se setea en línea (46 si hay trailing).
  placeholderOverlay: {
    position: 'absolute',
    left: 16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  trailing: {
    // Absoluto a la derecha, ocupando toda la altura del pozo (top/bottom 0)
    // para centrar verticalmente el ícono con el texto.
    position: 'absolute',
    right: 6,
    top: 0,
    bottom: 0,
    paddingRight: 8,
    paddingLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  helper: {
    paddingHorizontal: 2,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
})
