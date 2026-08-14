import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion'
import { neoInk } from '@/theme/neo-ink'
import { cssGradient, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
import { PIN_LENGTH, appendPinDigit, backspacePin } from './pin-pad-model'

interface PinPadProps {
  value: string
  onChange: (next: string) => void
  /** Bump this number to play the error shake + a warning haptic. */
  errorToken?: number
  /**
   * Sprint F · F2: PINs may be 4–8 digits. The pad renders one dot
   * per slot and caps input at `pinLength`. Defaults to `PIN_LENGTH`
   * (4) so existing callers (unlock, reauth-sheet, delete-account)
   * keep their current behaviour.
   */
  pinLength?: number
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'] as const

/**
 * Piel del pad: teclas EXTRUIDAS (gradiente 145deg + `raisedSm`) que al
 * presionarse se HUNDEN (`insetSm`), y celdas de PIN como pozos que se
 * llenan con la tinta de acento. Misma receta que el keypad de montos
 * (`numpad-grid`) y que el pad de dígitos del rediseño de auth, para que
 * los tres teclados de la app hablen el mismo idioma.
 */
function usePadSkin() {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const ink = neoInk(theme.mode)
  const isDark = theme.mode === 'dark'

  return useMemo(
    () => ({
      raised: {
        ...cssGradient(neo.raisedGradientCss, neo.surface),
        boxShadow: neo.shadows.raisedSm,
      } as ViewStyle,
      // Fondo SÓLIDO en claro (y no `neo.well`): el pozo del tema sobre
      // la hoja da ~1.06:1, así que en Android < API 29 —donde el inset
      // se descarta EN SILENCIO— la tecla hundida se quedaría sin
      // ningún límite visible. Mismo literal que `numpad-grid`.
      sunken: {
        backgroundColor: isDark ? neo.well : '#E4E3D5',
        boxShadow: neo.shadows.insetSm,
      } as ViewStyle,
      digitInk: neo.text,
      accentInk: ink.accent,
      // Android < API 28 descarta también el boxShadow OUTSET: sin este
      // hairline la tecla se funde con la superficie de abajo.
      fallbackBorder: neo.sheetDivider,
    }),
    [neo, ink, isDark],
  )
}

type PadSkin = ReturnType<typeof usePadSkin>

export function PinPad({ value, onChange, errorToken = 0, pinLength = PIN_LENGTH }: PinPadProps) {
  const skin = usePadSkin()
  const shake = useSharedValue(0)

  useEffect(() => {
    if (errorToken === 0) return
    void triggerHaptic('error')
    shake.value = withSequence(
      withTiming(-8, { duration: motionDurations.shakeStep }),
      withTiming(8, { duration: motionDurations.shakeStep }),
      withTiming(-6, { duration: motionDurations.shakeStep }),
      withTiming(0, { duration: motionDurations.shakeStep }),
    )
  }, [errorToken, shake])

  const dotsStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }))

  const handleKey = (key: string) => {
    void triggerHaptic('selection')
    if (key === 'back') {
      onChange(backspacePin(value))
      return
    }
    onChange(appendPinDigit(value, key, pinLength))
  }

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.dotsRow, dotsStyle]}>
        {Array.from({ length: pinLength }).map((_, i) => {
          const filled = i < value.length
          return (
            <View
              key={i}
              style={[
                styles.cell,
                skin.sunken,
                {
                  borderWidth: SUPPORTS_INSET_SHADOW ? 0 : StyleSheet.hairlineWidth,
                  borderColor: skin.fallbackBorder,
                },
              ]}
            >
              {filled ? (
                <View style={[styles.cellDot, { backgroundColor: skin.accentInk }]} />
              ) : null}
            </View>
          )
        })}
      </Animated.View>

      <View style={styles.pad}>
        {KEYS.map((key, idx) => {
          if (key === '') return <View key={idx} style={styles.keySlot} />
          return (
            <View key={idx} style={styles.keySlot}>
              <PinKey
                skin={skin}
                label={key}
                onPress={() => handleKey(key)}
                disabled={key === 'back' && value.length === 0}
              />
            </View>
          )
        })}
      </View>
    </View>
  )
}

function PinKey({
  skin,
  label,
  onPress,
  disabled,
}: {
  skin: PadSkin
  label: string
  onPress: () => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  const press = usePressScale({ pressedScale: 0.92 })
  const [pressed, setPressed] = useState(false)
  const isBack = label === 'back'
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        setPressed(true)
        press.onPressIn()
      }}
      onPressOut={() => {
        setPressed(false)
        press.onPressOut()
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={isBack ? t('auth:pinPad.deleteA11y') : label}
      hitSlop={6}
    >
      <Animated.View
        style={[
          styles.key,
          // El backspace vive hundido desde el idle: corrige, no compone,
          // y el relieve es lo que separa las dos funciones del pad.
          isBack || pressed ? skin.sunken : skin.raised,
          {
            borderWidth: SUPPORTS_INSET_SHADOW ? 0 : StyleSheet.hairlineWidth,
            borderColor: skin.fallbackBorder,
            opacity: disabled ? 0.4 : 1,
          },
          press.animatedStyle,
        ]}
      >
        {isBack ? (
          <MaterialIcons name="backspace" size={22} color={skin.accentInk} />
        ) : (
          <Text style={[styles.keyLabel, { color: skin.digitInk }]}>{label}</Text>
        )}
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 32 },
  dotsRow: { flexDirection: 'row', gap: 12 },
  cell: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
  },
  pad: {
    width: 264,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  keySlot: {
    width: 88,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  key: {
    width: 68,
    height: 60,
    // Radio de tecla del rediseño (mismo que `numpad-grid` / el pad de
    // auth), no el círculo de la V1.
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyLabel: {
    fontSize: 24,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
})
