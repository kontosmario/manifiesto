import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion'
import { useAppTheme } from '@/theme/theme-provider'
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

export function PinPad({ value, onChange, errorToken = 0, pinLength = PIN_LENGTH }: PinPadProps) {
  const { theme } = useAppTheme()
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
                styles.dot,
                {
                  borderColor: theme.colors.textMuted,
                  backgroundColor: filled ? theme.colors.text : 'transparent',
                },
              ]}
            />
          )
        })}
      </Animated.View>

      <View style={styles.pad}>
        {KEYS.map((key, idx) => {
          if (key === '') return <View key={idx} style={styles.keySlot} />
          return (
            <View key={idx} style={styles.keySlot}>
              <PinKey
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
  label,
  onPress,
  disabled,
}: {
  label: string
  onPress: () => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  const { theme } = useAppTheme()
  const press = usePressScale({ pressedScale: 0.92 })
  const isBack = label === 'back'
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={isBack ? t('auth:pinPad.deleteA11y') : label}
      hitSlop={6}
    >
      <Animated.View
        style={[
          styles.key,
          {
            backgroundColor: isBack ? 'transparent' : theme.colors.surfaceMuted,
            opacity: disabled ? 0.3 : 1,
          },
          press.animatedStyle,
        ]}
      >
        {isBack ? (
          <MaterialIcons name="backspace" size={22} color={theme.colors.text} />
        ) : (
          <Text style={[styles.keyLabel, { color: theme.colors.text }]}>{label}</Text>
        )}
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 40 },
  dotsRow: { flexDirection: 'row', gap: 18 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
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
    height: 68,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyLabel: {
    fontSize: 26,
    fontWeight: '600',
  },
})
