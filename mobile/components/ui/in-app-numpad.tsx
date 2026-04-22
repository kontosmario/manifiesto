import { useCallback, useEffect } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppSymbol } from './app-symbol'
import { AppButton } from './button'
import { appendComma, appendDigit, backspace, clearAll } from './in-app-numpad-model'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations, motionSprings } from '@/lib/motion'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface InAppNumpadProps {
  visible: boolean
  rawValue: string
  onChangeRawValue: (value: string) => void
  onDismiss: () => void
  maxIntegerDigits?: number
  maxDecimalDigits?: number
  doneLabel?: string
}

const DIGITS: string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

export function InAppNumpad({
  visible,
  rawValue,
  onChangeRawValue,
  onDismiss,
  maxIntegerDigits = 8,
  maxDecimalDigits = 2,
  doneLabel = 'Listo',
}: InAppNumpadProps) {
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const { height: screenHeight } = useWindowDimensions()
  const reduceMotion = useReducedMotion()

  const translateY = useSharedValue(screenHeight)
  const backdropOpacity = useSharedValue(0)

  useEffect(() => {
    if (visible) {
      translateY.value = reduceMotion ? 0 : withSpring(0, motionSprings.sheet)
      backdropOpacity.value = reduceMotion
        ? 1
        : withTiming(1, { duration: motionDurations.standard })
    } else {
      translateY.value = reduceMotion
        ? screenHeight
        : withSpring(screenHeight, motionSprings.exit)
      backdropOpacity.value = reduceMotion
        ? 0
        : withTiming(0, { duration: motionDurations.quick })
    }
  }, [visible, reduceMotion, screenHeight, translateY, backdropOpacity])

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }))

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  const handleDigit = useCallback(
    (digit: string) => {
      void triggerHaptic('selection')
      onChangeRawValue(
        appendDigit(rawValue, digit, { maxIntegerDigits, maxDecimalDigits }),
      )
    },
    [onChangeRawValue, rawValue, maxIntegerDigits, maxDecimalDigits],
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

  const handleDone = useCallback(() => {
    void triggerHaptic('selection')
    onDismiss()
  }, [onDismiss])

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropAnimatedStyle]}>
          <Pressable
            accessibilityLabel="Cerrar numpad"
            accessibilityRole="button"
            onPress={onDismiss}
            style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            sheetAnimatedStyle,
            {
              backgroundColor: theme.colors.surface,
              paddingBottom: insets.bottom + 16,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]} />
          <View style={styles.content}>
            <AppButton variant="primary" label={doneLabel} onPress={handleDone} />
            <View style={styles.grid}>
              {DIGITS.map((digit) => (
                <NumpadKey
                  key={digit}
                  label={digit}
                  onPress={() => handleDigit(digit)}
                />
              ))}
              <NumpadKey label="," onPress={handleComma} />
              <NumpadKey label="0" onPress={() => handleDigit('0')} />
              <NumpadKey
                onPress={handleBackspace}
                onLongPress={handleClearAll}
                icon="delete.backward.fill"
                iconFallback="backspace"
                accessibilityLabel="Borrar último dígito"
                accessibilityHint="Mantené presionado para limpiar todo"
              />
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

interface NumpadKeyProps {
  label?: string
  icon?: string
  iconFallback?: string
  onPress: () => void
  onLongPress?: () => void
  accessibilityLabel?: string
  accessibilityHint?: string
}

function NumpadKey({
  label,
  icon,
  iconFallback,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
}: NumpadKeyProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : scale.value }],
  }))

  return (
    <Animated.View style={[styles.keyWrap, animatedStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label ?? ''}
        accessibilityHint={accessibilityHint}
        onPressIn={() => {
          if (reduceMotion) return
          // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value write
          scale.value = withSpring(0.92, motionSprings.press)
        }}
        onPressOut={() => {
          // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value write
          scale.value = withSpring(1, motionSprings.press)
        }}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={450}
        style={({ pressed }) => [
          styles.key,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        {label ? (
          <Text style={[typography.titleMedium, styles.keyLabel, { color: theme.colors.text }]}>
            {label}
          </Text>
        ) : icon ? (
          <AppSymbol
            name={icon}
            fallback={(iconFallback ?? 'backspace') as never}
            size={22}
            color={theme.colors.textMuted}
          />
        ) : null}
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radii.pill,
    alignSelf: 'center',
    marginBottom: 12,
  },
  content: {
    paddingHorizontal: 16,
    gap: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  keyWrap: {
    width: '32%',
  },
  key: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingVertical: 18,
    minHeight: 60,
  },
  keyLabel: {
    fontSize: 24,
  },
})
