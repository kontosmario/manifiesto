import { useCallback, useMemo } from 'react'
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { AppSymbol } from '@/components/ui/app-symbol'
import {
  appendComma,
  appendDigit,
  backspace,
  clearAll,
} from '@/components/ui/in-app-numpad-model'
import { NeoButton } from '@/components/ui/neo-button'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { motionSprings } from '@/lib/motion'
import { cssGradient, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

interface NumpadGridProps {
  rawValue: string
  onChangeRawValue: (value: string) => void
  onDone: () => void
  doneLabel?: string
  maxIntegerDigits?: number
  maxDecimalDigits?: number
  /** Disables the primary done button (e.g., invalid value). */
  doneDisabled?: boolean
  /** Shows a loading spinner on the done button. */
  doneLoading?: boolean
  /** Skip rendering the integrated done button. Use when the caller
   *  wants to render its own primary action separate from the keys
   *  (e.g., `NumericEditSheet` which dims only the keys when disabled). */
  hideDoneButton?: boolean
  /**
   * Modo código/OTP: sin coma ni decimales, y SÍ permite el cero
   * inicial (un código puede empezar con 0, a diferencia de un monto,
   * donde `appendDigit` lo descarta). El slot de la "," queda vacío para
   * mantener la grilla de 3 columnas alineada.
   *
   * Vive acá —y no en `InAppNumpad`— desde que ese sheet dejó de tener su
   * propia copia del keypad: era el ÚNICO comportamiento que la copia
   * agregaba, así que unificar sin este flag habría roto el input de
   * código de `forgot-password`.
   */
  integerOnly?: boolean
}

const ROWS: readonly (readonly (string | 'backspace')[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [',', '0', 'backspace'],
]

/**
 * Skin del keypad neumórfico. Transcribe `onb-numpad`
 * (`components/redesign/onboarding/onb-numpad.tsx`, la implementación
 * canónica del handoff) a tokens del sistema: los dígitos son teclas
 * EXTRUIDAS (gradiente 145deg + `raisedSm`) y la "," y el backspace van
 * HUNDIDAS (`insetLg` sobre un pozo) — la jerarquía la da el relieve,
 * no el color.
 */
function useKeypadSkin() {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const isDark = theme.mode === 'dark'

  return useMemo(
    () => ({
      digitSurface: {
        ...cssGradient(neo.raisedGradientCss, neo.surface),
        boxShadow: neo.shadows.raisedSm,
      } as ViewStyle,
      digitInk: neo.text,
      insetSurface: {
        // Fondo SÓLIDO, no `neo.well`: en claro el pozo (#E9EBE0) sobre la
        // hoja (#F0EFE3) da ~1.06:1, así que en Android < API 29 —donde el
        // boxShadow inset se descarta EN SILENCIO— las teclas "," y
        // backspace se quedarían sin ningún límite visible y el backspace
        // (la única forma de corregir un dígito) quedaría como un glifo
        // flotando. Valor literal del handoff, el mismo que ya resolvió
        // `onb-numpad`. En oscuro el pozo del tema ya contrasta solo.
        backgroundColor: isDark ? neo.well : '#E4E3D5',
        boxShadow: neo.shadows.insetLg,
      } as ViewStyle,
      insetInk: neo.textMuted,
      // El backspace es la única tecla que CORRIGE: el handoff la dibuja
      // con el verde de acción, no con la tinta apagada de la ",".
      actionInk: neo.green,
      // Android < API 28 descarta también el boxShadow OUTSET: sin este
      // hairline las teclas de dígito se funden con la hoja.
      fallbackBorder: neo.sheetDivider,
    }),
    [neo, isDark],
  )
}

type KeypadSkin = ReturnType<typeof useKeypadSkin>

/**
 * 3×4 numeric grid + primary "done" button. Stateless — the caller
 * owns the raw string and decides what to do on done. Used by both the
 * standalone `InAppNumpad` (bottom sheet keyboard) and the unified
 * `NumericEditSheet` (single sheet with display + numpad combined).
 *
 * Es la ÚNICA implementación del keypad de la app: `InAppNumpad` tenía
 * una copia carácter por carácter de `NumpadKey` + `ROWS` + sus estilos,
 * y mantener dos copias durante el rediseño garantizaba dos teclados con
 * idiomas visuales distintos en la misma pantalla.
 */
export function NumpadGrid({
  rawValue,
  onChangeRawValue,
  onDone,
  doneLabel,
  maxIntegerDigits = 8,
  maxDecimalDigits = 2,
  doneDisabled = false,
  doneLoading = false,
  hideDoneButton = false,
  integerOnly = false,
}: NumpadGridProps) {
  const { t } = useTranslation()
  const skin = useKeypadSkin()
  const resolvedDoneLabel = doneLabel ?? t('common:actions.done')
  const handleDigit = useCallback(
    (digit: string) => {
      void triggerHaptic('selection')
      if (integerOnly) {
        onChangeRawValue(
          rawValue.length >= maxIntegerDigits ? rawValue : rawValue + digit,
        )
        return
      }
      onChangeRawValue(
        appendDigit(rawValue, digit, { maxIntegerDigits, maxDecimalDigits }),
      )
    },
    [integerOnly, onChangeRawValue, rawValue, maxIntegerDigits, maxDecimalDigits],
  )

  const handleComma = useCallback(() => {
    void triggerHaptic('selection')
    onChangeRawValue(appendComma(rawValue))
  }, [onChangeRawValue, rawValue])

  const handleBackspace = useCallback(() => {
    void triggerHaptic('light')
    onChangeRawValue(backspace(rawValue))
  }, [onChangeRawValue, rawValue])

  const handleClearAll = useCallback(() => {
    void triggerHaptic('warning')
    onChangeRawValue(clearAll())
  }, [onChangeRawValue])

  // Sin `triggerHaptic` acá: `NeoButton` ya dispara el suyo antes de
  // llamar a `onPress` (dos 'selection' en el mismo frame se sienten como
  // un buzz sucio). Los guards de disabled/loading también viven en el
  // botón, pero se mantienen por si un caller llama a esto directo.
  const handleDone = useCallback(() => {
    if (doneDisabled || doneLoading) return
    onDone()
  }, [doneDisabled, doneLoading, onDone])

  const handleKeyPress = useCallback(
    (key: string | 'backspace') => {
      if (key === 'backspace') return handleBackspace()
      if (key === ',') return handleComma()
      return handleDigit(key)
    },
    [handleBackspace, handleComma, handleDigit],
  )

  return (
    <View style={styles.content}>
      {hideDoneButton ? null : (
        <NeoButton
          variant="primary"
          block
          label={resolvedDoneLabel}
          onPress={handleDone}
          disabled={doneDisabled}
          busy={doneLoading}
        />
      )}
      <View style={styles.grid}>
        {ROWS.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((key) => {
              // En modo código no hay coma: el slot queda vacío para
              // mantener la grilla de 3 columnas alineada.
              if (key === ',' && integerOnly) {
                return <View key={key} style={styles.keyWrap} />
              }
              return (
                <NumpadKey
                  key={key}
                  skin={skin}
                  tone={key === ',' || key === 'backspace' ? 'inset' : 'digit'}
                  label={key === 'backspace' ? undefined : key}
                  icon={key === 'backspace' ? 'delete.backward.fill' : undefined}
                  iconFallback={key === 'backspace' ? 'backspace' : undefined}
                  accessibilityLabel={
                    key === 'backspace'
                      ? t('states:numpad.backspaceLabel')
                      : key === ','
                        ? t('states:numpad.commaLabel')
                        : key
                  }
                  accessibilityHint={
                    key === 'backspace'
                      ? t('states:numpad.backspaceHint')
                      : undefined
                  }
                  onPress={() => handleKeyPress(key)}
                  onLongPress={key === 'backspace' ? handleClearAll : undefined}
                />
              )
            })}
          </View>
        ))}
      </View>
    </View>
  )
}

interface NumpadKeyProps {
  skin: KeypadSkin
  /** `digit` = tecla extruida · `inset` = tecla hundida ("," y backspace). */
  tone: 'digit' | 'inset'
  label?: string
  icon?: string
  iconFallback?: string
  onPress: () => void
  onLongPress?: () => void
  accessibilityLabel?: string
  accessibilityHint?: string
}

function NumpadKey({
  skin,
  tone,
  label,
  icon,
  iconFallback,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
}: NumpadKeyProps) {
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : scale.value }],
  }))

  const isInset = tone === 'inset'

  return (
    <Animated.View style={[styles.keyWrap, animatedStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label ?? ''}
        accessibilityHint={accessibilityHint}
        onPressIn={() => {
          if (reduceMotion) return

          scale.value = withSpring(0.92, motionSprings.press)
        }}
        onPressOut={() => {

          scale.value = withSpring(1, motionSprings.press)
        }}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={450}
        style={({ pressed }) => [
          styles.key,
          isInset ? skin.insetSurface : skin.digitSurface,
          {
            // Ver `fallbackBorder`: el relieve es lo ÚNICO que dibuja la
            // tecla, así que donde el boxShadow no existe hace falta un
            // límite explícito.
            borderWidth: SUPPORTS_INSET_SHADOW ? 0 : StyleSheet.hairlineWidth,
            borderColor: skin.fallbackBorder,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        {label ? (
          <Text
            style={[
              styles.keyLabel,
              { color: isInset ? skin.insetInk : skin.digitInk },
            ]}
          >
            {label}
          </Text>
        ) : icon ? (
          <AppSymbol
            name={icon}
            fallback={(iconFallback ?? 'backspace') as never}
            size={22}
            color={skin.actionInk}
          />
        ) : null}
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  content: {
    // 22 = padding lateral de hoja del handoff (mismo que la piel neo de
    // `ModalCard` y que `onb-numpad`), no el 16 de la V1.
    paddingHorizontal: 22,
    gap: 16,
  },
  grid: {
    // 12, no 8: con teclas extruidas la sombra `raisedSm` sangra 15px
    // (offset 5 + blur 10) y a 8 las sombras de teclas vecinas se pisan.
    // Es la misma separación de `onb-numpad`.
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  keyWrap: {
    flex: 1,
  },
  key: {
    alignItems: 'center',
    justifyContent: 'center',
    // Radio de tecla del handoff (`onb-numpad` styles.key): más redondo
    // que `neoRadii.chip`, que es el de un chip de texto.
    borderRadius: 20,
    paddingVertical: 18,
    minHeight: 56,
  },
  keyLabel: {
    fontSize: 24,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    textAlign: 'center',
  },
})
