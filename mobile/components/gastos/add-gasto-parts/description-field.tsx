// Campo DESCRIPCIÓN del paso 1 del alta de gasto: pozo de texto + chips de
// sugerencia de la categoría elegida.
//
// Va DESPUÉS de la categoría a propósito: las sugerencias salen del historial
// y del template de la categoría seleccionada, así que arriba de ella el
// bloque aparecería siempre vacío.
//
// El foco vive ADENTRO, igual que en el hermano de ingreso
// (`add-income-parts/description-input.tsx`): es estado de presentación, no del
// formulario. Colgado del orquestador, tocar el pozo re-rendeaba el wizard
// entero —header, dots, píldora de back-date, numpad, footer y los ~14 tiles
// del rail— para animar la opacidad de un anillo de 2px, y otra vez al
// desenfocar.
import { useEffect, useState } from 'react'
import { StyleSheet } from 'react-native'
import { TextInput } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
// Los chips salen del alta de INGRESO por reuso deliberado, no por
// acoplamiento: su contrato ya es texto libre y ahí resolvieron los dos
// defectos que este archivo tenía duplicados —marcar el elegido y el `hitSlop`
// del área táctil—. Una segunda copia acá los dejaría separarse.
import { QuickTextChips } from '@/components/gastos/add-income-parts/quick-text-chips'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { Field } from '@/components/wizard/parts/field'
import { useWizardSkin } from '@/components/wizard/wizard-skin'
import { EXPENSE_DESCRIPTION_MAX_LENGTH } from '@/features/expenses/expense-repository.model'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionDurations } from '@/lib/motion'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

export interface DescriptionFieldProps {
  value: string
  onChange: (next: string) => void
  suggestions: readonly string[]
  onSelectSuggestion: (value: string) => void
  /** Mismo contrato que `TextField` / `AmountCard`: el campo es requerido y
   *  está vacío, y el usuario ya tocó el CTA. */
  warning?: boolean
}

export function DescriptionField({
  value,
  onChange,
  suggestions,
  onSelectSuggestion,
  warning = false,
}: DescriptionFieldProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
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

  // Classic: mismo nested-interpolate que `TextField` / `AmountCard` — el
  // ancho sigue sólo al foco (cero layout shift al marcar el warning) y el
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

  // Neo: el pozo no tiene borde propio (el foco lo marcan el cursor y la
  // tinta), así que el warning entra como ANILLO en una capa aparte. Va aparte
  // y no sobre el mismo View para poder interpolarle la opacidad: pintando el
  // borde directo, el anillo aparecía de un frame al otro.
  const warningRingStyle = useAnimatedStyle(() => ({
    opacity: warningProgress.value,
  }))

  return (
    <Field label={t('gastos:addExpense.wizard.step1.descriptionLabel')}>
      <Animated.View
        style={[
          styles.inputWrap,
          { backgroundColor: theme.colors.surface },
          neo
            ? {
                backgroundColor: neo.add.well.background,
                borderRadius: neo.add.well.radius,
                // El pozo es SOLO sombra inset y Android < API 29 la descarta
                // en silencio: sin el hairline queda un rectángulo `#F4F5EE`
                // sobre `#E9EBE0` (~1.06:1) y el usuario no ve dónde tocar
                // para escribir el campo REQUERIDO del paso. Mismo fallback
                // que `AmountCard` y que el pozo del alta de ingreso.
                borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
                borderColor: theme.colors.border,
                boxShadow: neo.add.well.shadow,
              }
            : borderStyle,
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          // El `<Text>` del `Field` que lo envuelve es un HERMANO: no lo toma
          // el lector. Y el `placeholder` sólo hace de label accesible
          // mientras el campo está VACÍO (en TalkBack ni eso), así que con una
          // descripción escrita —o prefilleada por el Asistente/OCR— VoiceOver
          // leía "Súper" sin decir de qué campo requerido se trata.
          accessibilityLabel={t('gastos:addExpense.wizard.step1.descriptionLabel')}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          autoCapitalize="sentences"
          autoCorrect={false}
          // El tope REAL del servidor, no uno inventado más chico: con 60 el
          // input dejaba de aceptar teclas a mitad de palabra y sin aviso, y
          // un prefill del Asistente/OCR más largo se guardaba cortado.
          maxLength={EXPENSE_DESCRIPTION_MAX_LENGTH}
          returnKeyType="done"
          placeholder={t('gastos:addExpense.wizard.step1.descriptionPlaceholder')}
          // `textSoft` en oscuro es `#77E755` — verde flúor sobre el pozo.
          placeholderTextColor={neo ? neo.faintInk : theme.colors.textSoft}
          style={[
            styles.input,
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
        {/* Anillo de "falta este dato": ÚLTIMO hijo (va encima del input, no
            debajo) y con borde REAL, no `boxShadow` inset — el inset se
            descarta en silencio en Android < API 29 y el warning quedaba mudo
            justo en el campo que el footer nombra como faltante. Mismo
            tratamiento que `AmountCard` y el pozo del alta de ingreso. */}
        {neo ? (
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.warnRing,
              { borderRadius: neo.add.well.radius, borderColor: neo.add.accentClay },
              warningRingStyle,
            ]}
          />
        ) : null}
      </Animated.View>

      {/* SIEMPRE visibles, sin depender del foco. Se probó colapsarlos para
          ganar ~56pt de alto, pero son SUGERENCIAS: si sólo aparecen cuando ya
          empezaste a escribir, llegan tarde — su valor es ahorrarte escribir,
          y para eso tenés que verlas antes de tipear. Pedido del owner
          (2026-08-17), mismo criterio que los montos rápidos.

          El `keyboardShouldPersistTaps="handled"` del ScrollView de los chips
          —y el del `Screen` que los contiene— se conserva igual: hace que el
          tap sobre una sugerencia llegue al chip sin que el blur del pozo se
          coma el gesto. */}
      {suggestions.length > 0 ? (
        <QuickTextChips
          options={suggestions}
          onSelect={onSelectSuggestion}
          // Marca el chip cuya etiqueta es la descripción actual: sin esto,
          // ver el texto aparecer arriba era el único feedback y se perdía al
          // scrollear la fila (que acá es MÁS larga que en ingreso: las
          // sugerencias salen del historial de la categoría).
          selected={value}
        />
      ) : null}
    </Field>
  )
}

const styles = StyleSheet.create({
  inputWrap: { borderRadius: 14 },
  // Sin capturar toques, para no robarle el tap al campo que enmarca.
  warnRing: { borderWidth: 2 },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
})
