import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { InAppNumpad } from '@/components/ui/in-app-numpad'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionDurations } from '@/lib/motion'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

interface NumpadFieldProps {
  label: string
  helper?: string
  /** Raw value, same shape the InAppNumpad emits (digits + optional comma). */
  value: string
  onChangeRawValue: (next: string) => void
  /** Placeholder shown when value is empty. Default: "0". */
  placeholder?: string
  /** Format raw → display. Default: passthrough, replacing empty with placeholder. */
  formatDisplay?: (raw: string) => string
  maxIntegerDigits?: number
  maxDecimalDigits?: number
  /** Label for the numpad's "Listo" button. */
  doneLabel?: string
  /** Visual error state — outlines the field in danger color. */
  hasError?: boolean
  /** Open the numpad on mount. */
  autoOpen?: boolean
  /** Disables the field entirely. */
  disabled?: boolean
}

/**
 * Numeric field that opens the shared InAppNumpad sheet on tap instead
 * of the OS keyboard. Visually mirrors `TextField` so it drops in for
 * the same use cases (money amounts, percentages, days, counts) and
 * keeps the app's input language unified.
 *
 * En el vocabulario neumórfico el campo es un POZO: no tiene borde, y
 * los estados (foco / error) se comunican cambiando la receta de
 * relieve, no pintando un contorno.
 */
export function NumpadField({
  label,
  helper,
  value,
  onChangeRawValue,
  placeholder = '0',
  formatDisplay,
  maxIntegerDigits,
  maxDecimalDigits,
  doneLabel,
  hasError = false,
  autoOpen = false,
  disabled = false,
}: NumpadFieldProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const reduceMotion = useReducedMotion()
  const [isOpen, setIsOpen] = useState(autoOpen && !disabled)
  const focusProgress = useSharedValue(autoOpen ? 1 : 0)

  useEffect(() => {
    if (!autoOpen || disabled) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- autoOpen syncs open state on mount
    setIsOpen(true)
  }, [autoOpen, disabled])

  useEffect(() => {
    const target = isOpen ? 1 : 0
    focusProgress.value = reduceMotion
      ? target
      : withTiming(target, { duration: motionDurations.standard })
  }, [isOpen, reduceMotion, focusProgress])

  // El foco YA no se interpola: RN no interpola strings de `boxShadow`,
  // así que la V1 (borderColor animado + borderWidth creciente) no tiene
  // equivalente continuo. Se hace swap DISCRETO de receta —pozo → pozo
  // con anillo verde— que es exactamente lo que el sistema neo usa para
  // "seleccionado". El label sigue cruzando de color con `interpolateColor`
  // (eso sí porta 1:1), así que la transición no se siente seca.
  const boxShadow = hasError
    ? `${neo.shadows.insetLg}, 0 0 0 2px ${neo.danger}`
    : isOpen
      ? neo.shadows.ringSelected
      : neo.shadows.insetLg

  // `neo.danger` es el color del ANILLO (a un borde le alcanza 3:1). Como
  // tinta de 11-12px sobre superficies claras se queda en ~3.7:1, abajo de
  // los 4.5 de AA: el TEXTO del error usa la variante oscurecida, mismo
  // recurso (y mismo valor) que el `accentClayInk` del kit de fijos. En
  // oscuro el terracota del tema ya pasa y se usa tal cual.
  const errorInk = theme.mode === 'dark' ? neo.danger : '#9A421F'

  const labelAnimatedStyle = useAnimatedStyle(() => ({
    color: hasError
      ? errorInk
      : interpolateColor(
          focusProgress.value,
          [0, 1],
          [neo.textMuted, neo.green],
        ),
  }))

  const displayText =
    value.length > 0
      ? (formatDisplay ? formatDisplay(value) : value)
      : placeholder
  const isPlaceholder = value.length === 0

  const handleOpen = () => {
    if (disabled) return
    setIsOpen(true)
  }

  return (
    <View style={styles.container}>
      {label ? (
        <Animated.Text style={[styles.label, labelAnimatedStyle]}>
          {label}
        </Animated.Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, expanded: isOpen }}
        disabled={disabled}
        onPress={handleOpen}
      >
        <View
          style={[
            styles.box,
            {
              backgroundColor: neo.well,
              boxShadow,
              // Android < API 29 descarta el inset EN SILENCIO (y < 28
              // también el anillo outset): sin este límite el pozo y el
              // estado de foco desaparecen por completo. Ver
              // `SUPPORTS_INSET_SHADOW`.
              borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1.5,
              borderColor: hasError
                ? neo.danger
                : isOpen
                  ? neo.green
                  : neo.sheetDivider,
              opacity: disabled ? 0.5 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.value,
              // Placeholder en `textMuted`: `textTertiary` sobre el pozo
              // claro da 2.1:1 y este valor mide 17px, no es un hero.
              { color: isPlaceholder ? neo.textMuted : neo.text },
            ]}
            numberOfLines={1}
          >
            {displayText}
          </Text>
        </View>
      </Pressable>
      {helper ? (
        <Text
          style={[
            styles.helper,
            { color: hasError ? errorInk : neo.textMuted },
          ]}
        >
          {helper}
        </Text>
      ) : null}
      <InAppNumpad
        visible={isOpen}
        rawValue={value}
        onChangeRawValue={onChangeRawValue}
        onDismiss={() => setIsOpen(false)}
        maxIntegerDigits={maxIntegerDigits}
        maxDecimalDigits={maxDecimalDigits}
        doneLabel={doneLabel}
      />
    </View>
  )
}

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
  box: {
    minHeight: 54,
    borderRadius: neoRadii.input,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  value: {
    paddingVertical: 2,
    fontSize: 17,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    fontVariant: ['tabular-nums'],
  },
  helper: {
    paddingHorizontal: 2,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
})
