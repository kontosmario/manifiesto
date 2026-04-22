import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated'
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet'
import { AppSymbol } from './app-symbol'
import { AppButton } from './button'
import { appendComma, appendDigit, backspace, clearAll } from './in-app-numpad-model'
import { triggerHaptic } from '@/lib/haptics'
import { motionSprings } from '@/lib/motion'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

export interface InAppNumpadHandle {
  present: () => void
  dismiss: () => void
}

interface InAppNumpadProps {
  rawValue: string
  onChangeRawValue: (value: string) => void
  onDismiss?: () => void
  maxIntegerDigits?: number
  maxDecimalDigits?: number
  doneLabel?: string
}

const DIGITS: string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
const SNAP_POINTS = ['55%']

export const InAppNumpad = forwardRef<InAppNumpadHandle, InAppNumpadProps>(
  function InAppNumpad(
    {
      rawValue,
      onChangeRawValue,
      onDismiss,
      maxIntegerDigits = 8,
      maxDecimalDigits = 2,
      doneLabel = 'Listo',
    },
    ref,
  ) {
    const { theme } = useAppTheme()
    const modalRef = useRef<BottomSheetModal>(null)

    useImperativeHandle(
      ref,
      () => ({
        present: () => {
          modalRef.current?.present()
        },
        dismiss: () => {
          modalRef.current?.dismiss()
        },
      }),
      [],
    )

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
      modalRef.current?.dismiss()
    }, [])

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.45}
          pressBehavior="close"
        />
      ),
      [],
    )

    const backgroundStyle = useMemo(
      () => ({
        backgroundColor: theme.colors.surface,
        borderTopLeftRadius: radii['2xl'],
        borderTopRightRadius: radii['2xl'],
      }),
      [theme.colors.surface],
    )

    const handleIndicatorStyle = useMemo(
      () => ({
        backgroundColor: theme.colors.borderStrong,
        width: 36,
        height: 4,
      }),
      [theme.colors.borderStrong],
    )

    return (
      <BottomSheetModal
        ref={modalRef}
        snapPoints={SNAP_POINTS}
        enablePanDownToClose
        onDismiss={onDismiss}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={handleIndicatorStyle}
        backgroundStyle={backgroundStyle}
      >
        <View style={styles.container}>
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
      </BottomSheetModal>
    )
  },
)

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
            size={20}
            color={theme.colors.textMuted}
          />
        ) : null}
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
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
    minHeight: 58,
  },
  keyLabel: {
    fontSize: 22,
  },
})
