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
  runOnJS,
} from 'react-native-reanimated'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppSymbol } from './app-symbol'
import { AppButton } from './button'
import { appendComma, appendDigit, backspace, clearAll } from './in-app-numpad-model'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations, motionEasings, motionSprings } from '@/lib/motion'
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

const ROWS: readonly (readonly (string | 'backspace')[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [',', '0', 'backspace'],
]

const DISMISS_DISTANCE = 100
const DISMISS_VELOCITY = 650

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
        : withTiming(screenHeight, {
            duration: motionDurations.deliberate,
            easing: motionEasings.accelerate,
          })
      backdropOpacity.value = reduceMotion
        ? 0
        : withTiming(0, { duration: motionDurations.standard })
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

  const handleKeyPress = useCallback(
    (key: string | 'backspace') => {
      if (key === 'backspace') {
        handleBackspace()
        return
      }
      if (key === ',') {
        handleComma()
        return
      }
      handleDigit(key)
    },
    [handleBackspace, handleComma, handleDigit],
  )

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      'worklet'
      if (event.translationY > 0) {
        translateY.value = event.translationY
        backdropOpacity.value = Math.max(0.2, 1 - event.translationY / screenHeight)
      }
    })
    .onEnd((event) => {
      'worklet'
      const shouldDismiss =
        event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY
      if (shouldDismiss) {
        translateY.value = withSpring(screenHeight, {
          velocity: Math.max(event.velocityY, 800),
          damping: 32,
          stiffness: 240,
          mass: 0.9,
        })
        backdropOpacity.value = withTiming(0, { duration: motionDurations.quick })
        runOnJS(onDismiss)()
      } else {
        translateY.value = withSpring(0, motionSprings.sheet)
        backdropOpacity.value = withTiming(1, { duration: motionDurations.quick })
      }
    })

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropAnimatedStyle]}>
          <Pressable
            accessibilityLabel="Cerrar numpad"
            accessibilityRole="button"
            onPress={onDismiss}
            style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}
          />
        </Animated.View>

        <GestureDetector gesture={panGesture}>
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
            <View style={styles.handleArea}>
              <View style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]} />
            </View>
            <View style={styles.content}>
              <AppButton variant="primary" label={doneLabel} onPress={handleDone} />
              <View style={styles.grid}>
                {ROWS.map((row, rowIndex) => (
                  <View key={rowIndex} style={styles.row}>
                    {row.map((key) => (
                      <NumpadKey
                        key={key}
                        label={key === 'backspace' ? undefined : key}
                        icon={key === 'backspace' ? 'delete.backward.fill' : undefined}
                        iconFallback={key === 'backspace' ? 'backspace' : undefined}
                        accessibilityLabel={
                          key === 'backspace'
                            ? 'Borrar último dígito'
                            : key === ','
                              ? 'Coma'
                              : key
                        }
                        accessibilityHint={
                          key === 'backspace'
                            ? 'Mantené presionado para limpiar todo'
                            : undefined
                        }
                        onPress={() => handleKeyPress(key)}
                        onLongPress={key === 'backspace' ? handleClearAll : undefined}
                      />
                    ))}
                  </View>
                ))}
              </View>
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
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
    paddingTop: 0,
  },
  handleArea: {
    paddingTop: 10,
    paddingBottom: 12,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radii.pill,
  },
  content: {
    paddingHorizontal: 16,
    gap: 12,
  },
  grid: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  keyWrap: {
    flex: 1,
  },
  key: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingVertical: 18,
    minHeight: 56,
  },
  keyLabel: {
    fontSize: 24,
  },
})
