// Campo de descripción del alta de ingreso. Hermano de
// `add-gasto-parts/description-field.tsx`: mismo pozo, mismo anillo de warning
// y el mismo tope de caracteres.
//
// La diferencia de forma con el hermano es dónde vive el `Field`: acá lo monta
// el paso (porque los chips de sugerencia son hermanos del input, no hijos del
// campo), allá lo monta el componente. Por eso este recibe `placeholder` y
// `accessibilityLabel` por prop en vez de resolverlos adentro.
//
// El foco vive adentro: es estado de presentación, no del formulario. El
// modelo (`useAddIncomeForm`) no lo conoce y los tests no lo tienen que
// simular.
import { useEffect, useState } from 'react'
import { StyleSheet, TextInput } from 'react-native'
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
// El hook propio, NUNCA el de reanimated: el de la librería abre una
// suscripción a `AccessibilityInfo` por call site (el jank de Android gama
// baja) e ignora el override de Motion del usuario.
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { useWizardSkin } from '@/components/wizard/wizard-skin'
import { INCOME_DESCRIPTION_MAX_LENGTH } from '@/features/income/use-add-income-form'
import { motionDurations } from '@/lib/motion'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

export interface DescriptionInputProps {
  value: string
  onChange: (next: string) => void
  placeholder: string
  /** Etiqueta para el lector de pantalla. El `placeholder` sólo hace de label
   *  accesible mientras el campo está VACÍO (y en TalkBack ni eso), así que sin
   *  esto, apenas hay texto escrito, VoiceOver lee el valor sin decir de qué
   *  campo es. El `<Text>` del `Field` que lo envuelve es un hermano, no lo
   *  suple. */
  accessibilityLabel?: string
  /** Mismo contrato que `TextField` / `AmountCard`: marca "falta este campo"
   *  SIN mover el layout. En `classic` glidea la tinta del borde; en `neo` —el
   *  pozo va sin contorno— lo hace un anillo apoyado encima. */
  warning?: boolean
}

export function DescriptionInput({
  value,
  onChange,
  placeholder,
  accessibilityLabel,
  warning = false,
}: DescriptionInputProps) {
  const { theme } = useAppTheme()
  const skin = useWizardSkin()
  const neo = skin.kind === 'neo' ? skin : null
  const reduceMotion = useReducedMotion()
  const [isFocused, setIsFocused] = useState(false)
  const focusProgress = useSharedValue(isFocused ? 1 : 0)
  const warningProgress = useSharedValue(warning ? 1 : 0)

  useEffect(() => {
    const target = isFocused ? 1 : 0
    focusProgress.value = reduceMotion
      ? target
      : withTiming(target, { duration: motionDurations.standard })
  }, [isFocused, reduceMotion, focusProgress])

  useEffect(() => {
    const target = warning ? 1 : 0
    warningProgress.value = reduceMotion
      ? target
      : withTiming(target, {
          duration: motionDurations.standard,
          easing: Easing.bezier(0.32, 0.72, 0, 1),
        })
  }, [warning, reduceMotion, warningProgress])

  // Nested interpolate igual que `NameInput` y que el hermano de gasto: el
  // ancho sigue SOLO al foco (cero layout shift al marcar el warning) y el
  // color blendea entre el normal y el de advertencia.
  const borderStyle = useAnimatedStyle(() => {
    const normalColor = interpolateColor(
      focusProgress.value,
      [0, 1],
      [theme.colors.line, theme.colors.primary],
    )
    return {
      borderColor: interpolateColor(
        warningProgress.value,
        [0, 1],
        [normalColor, theme.colors.warning],
      ),
      borderWidth: 1 + focusProgress.value,
    }
  })

  // En neo el `borderStyle` de arriba NO entra (el pozo se dibuja sin
  // contorno), así que el warning quedaba MUDO: dejar la descripción vacía y
  // tocar el CTA no cambiaba nada en el campo. El cue va por un anillo apoyado
  // encima — la opacidad SÍ se puede animar, un `boxShadow` es un string y
  // Reanimated no lo interpola — y no mueve el layout.
  const warnRingStyle = useAnimatedStyle(() => ({
    opacity: warningProgress.value,
  }))

  return (
    <Animated.View
      style={[
        styles.wrap,
        { backgroundColor: theme.colors.surface },
        // En neo el pozo NO lleva borde: el `borderStyle` animado iría después
        // y pisaría el `borderWidth: 0`, dejando un anillo de 1px (naranja con
        // el flag) sobre una superficie que el handoff dibuja sin contorno. El
        // foco lo marcan el cursor y la tinta del texto.
        neo
          ? {
              backgroundColor: neo.add.well.background,
              borderRadius: neo.add.well.radius,
              // El pozo es SOLO sombra inset. Donde el sistema la descarta
              // (Android < API 29) el campo se aplana contra el fondo y no se
              // ve dónde tocar: ahí y sólo ahí, hairline.
              borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
              borderColor: theme.colors.border,
              boxShadow: neo.add.well.shadow,
            }
          : borderStyle,
      ]}
    >
      <TextInput
        value={value}
        accessibilityLabel={accessibilityLabel}
        onChangeText={onChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        autoCapitalize="sentences"
        autoCorrect={false}
        // El mismo tope que el alta de gasto, no uno más chico: con 60 el input
        // dejaba de aceptar teclas a mitad de palabra y sin ningún aviso.
        maxLength={INCOME_DESCRIPTION_MAX_LENGTH}
        returnKeyType="done"
        placeholder={placeholder}
        // `textSoft` en oscuro es `#77E755` — verde flúor sobre el pozo.
        placeholderTextColor={neo ? neo.faintInk : theme.colors.textSoft}
        style={[
          styles.field,
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
      {neo ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.warnRing,
            { borderRadius: neo.add.well.radius, borderColor: neo.add.accentClay },
            warnRingStyle,
          ]}
        />
      ) : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 14 },
  // Anillo de "falta este dato" en neo: último hijo (va encima del input) y sin
  // capturar toques, para no robarle el tap al campo.
  warnRing: { borderWidth: 2 },
  field: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
})
