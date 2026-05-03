import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppButton } from '@/components/ui/button'
import { NumpadGrid } from '@/components/ui/numpad-grid'
import { motionDurations, motionEasings, motionSprings } from '@/lib/motion'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface NumericEditSheetProps {
  visible: boolean
  title: string
  subtitle?: string

  rawValue: string
  onChangeRawValue: (value: string) => void
  formatDisplay?: (raw: string) => string
  displayEyebrow?: string
  displayPlaceholder?: string

  helper?: string
  errorText?: string

  /** Optional content rendered between subtitle and display — use for
   *  a mode picker, segmented control, or extra context. */
  headerExtra?: ReactNode
  /** When true, the numpad grid is rendered non-interactive (dimmed).
   *  Useful for modes that don't need numeric input (e.g. "none"). */
  numpadDisabled?: boolean

  maxIntegerDigits?: number
  maxDecimalDigits?: number

  saveLabel?: string
  saveDisabled?: boolean
  isSaving?: boolean
  onSave: () => void
  onClose: () => void
  /**
   * Optional ghost/secondary action rendered below the primary save
   * button. Useful for "skip with default" flows where the user can
   * confirm without changing the amount.
   */
  secondaryAction?: {
    label: string
    onPress: () => void
    disabled?: boolean
  }
}

const DISMISS_DISTANCE = 100
const DISMISS_VELOCITY = 650

/**
 * Single-field numeric editor sheet. A single Modal with a bottom
 * sheet that bundles: header (title/subtitle) + big tappable display
 * (AmountCard-style) + the shared numpad grid + primary save button.
 *
 * Replaces the old pattern of ModalCard + separate InAppNumpad Modal
 * (which caused the numpad to cover the input). Everything is in the
 * same sheet so the user always sees what they're editing.
 */
export function NumericEditSheet({
  visible,
  title,
  subtitle,
  rawValue,
  onChangeRawValue,
  formatDisplay,
  displayEyebrow,
  displayPlaceholder = '0',
  helper,
  errorText,
  headerExtra,
  numpadDisabled = false,
  maxIntegerDigits,
  maxDecimalDigits,
  saveLabel = 'Guardar',
  saveDisabled = false,
  isSaving = false,
  onSave,
  onClose,
  secondaryAction,
}: NumericEditSheetProps) {
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const { height: screenHeight } = useWindowDimensions()
  const reduceMotion = useReducedMotion()

  const translateY = useSharedValue(screenHeight)
  const backdropOpacity = useSharedValue(0)
  // Defer unmount of the native <Modal> until our exit animation
  // finishes — otherwise saving a value snaps the sheet shut because
  // the parent flips `visible` to false the same frame the mutation
  // resolves.
  const [mounted, setMounted] = useState(visible)

  useEffect(() => {
    if (visible) {
      setMounted(true)
      translateY.value = reduceMotion ? 0 : withSpring(0, motionSprings.sheet)
      backdropOpacity.value = reduceMotion
        ? 1
        : withTiming(1, { duration: motionDurations.standard })
      return
    }
    if (!mounted) return
    if (reduceMotion) {
      translateY.value = screenHeight
      backdropOpacity.value = 0
      setMounted(false)
      return
    }
    backdropOpacity.value = withTiming(0, { duration: motionDurations.standard })
    translateY.value = withTiming(
      screenHeight,
      {
        duration: motionDurations.deliberate,
        easing: motionEasings.accelerate,
      },
      (finished) => {
        if (finished) runOnJS(setMounted)(false)
      },
    )
  }, [visible, mounted, reduceMotion, screenHeight, translateY, backdropOpacity])

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }))

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  const handleDismiss = useCallback(() => {
    onClose()
  }, [onClose])

  const handleDragDismissed = useCallback(() => {
    setMounted(false)
    onClose()
  }, [onClose])

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
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
            backdropOpacity.value = withTiming(0, { duration: motionDurations.quick })
            translateY.value = withSpring(
              screenHeight,
              {
                ...motionSprings.sheetDismiss,
                velocity: Math.max(event.velocityY, 800),
              },
              (finished) => {
                if (finished) runOnJS(handleDragDismissed)()
              },
            )
          } else {
            translateY.value = withSpring(0, motionSprings.sheet)
            backdropOpacity.value = withTiming(1, { duration: motionDurations.quick })
          }
        }),
    [translateY, backdropOpacity, screenHeight, handleDragDismissed],
  )

  const displayText =
    rawValue.length > 0
      ? (formatDisplay ? formatDisplay(rawValue) : rawValue)
      : displayPlaceholder
  const isPlaceholder = rawValue.length === 0

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropAnimatedStyle]}>
          <Pressable
            accessibilityLabel="Cerrar editor"
            accessibilityRole="button"
            onPress={handleDismiss}
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

            <View style={styles.header}>
              <Text style={[typography.titleMedium, { color: theme.colors.text }]}>
                {title}
              </Text>
              {subtitle ? (
                <Text
                  style={[typography.bodySmall, { color: theme.colors.textMuted }]}
                >
                  {subtitle}
                </Text>
              ) : null}
            </View>

            {headerExtra ? (
              <View style={styles.headerExtra}>{headerExtra}</View>
            ) : null}

            <View style={styles.displayWrap}>
              <View
                style={[
                  styles.displayCard,
                  {
                    backgroundColor: theme.colors.surfaceMuted,
                    borderColor: errorText ? theme.colors.danger : theme.colors.border,
                  },
                ]}
              >
                {displayEyebrow ? (
                  <Text
                    style={[
                      typography.eyebrow,
                      styles.displayEyebrow,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    {displayEyebrow}
                  </Text>
                ) : null}
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  allowFontScaling
                  maxFontSizeMultiplier={1.2}
                  style={[
                    typography.hero,
                    styles.displayValue,
                    {
                      color: isPlaceholder ? theme.colors.textSoft : theme.colors.text,
                    },
                  ]}
                >
                  {displayText}
                </Text>
              </View>
              {errorText ? (
                <Text
                  style={[
                    styles.helperText,
                    { color: theme.colors.danger },
                  ]}
                >
                  {errorText}
                </Text>
              ) : helper ? (
                <Text
                  style={[
                    styles.helperText,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  {helper}
                </Text>
              ) : null}
            </View>

            <View style={styles.saveButton}>
              <AppButton
                variant="primary"
                label={saveLabel}
                onPress={onSave}
                disabled={saveDisabled}
                loading={isSaving}
              />
              {secondaryAction ? (
                <View style={styles.secondaryButton}>
                  <AppButton
                    variant="ghost"
                    label={secondaryAction.label}
                    onPress={secondaryAction.onPress}
                    disabled={secondaryAction.disabled || isSaving}
                  />
                </View>
              ) : null}
            </View>

            <View
              pointerEvents={numpadDisabled ? 'none' : 'auto'}
              style={numpadDisabled ? styles.numpadDimmed : undefined}
            >
              <NumpadGrid
                rawValue={rawValue}
                onChangeRawValue={onChangeRawValue}
                onDone={onSave}
                hideDoneButton
                maxIntegerDigits={maxIntegerDigits}
                maxDecimalDigits={maxDecimalDigits}
              />
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
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
  header: {
    paddingHorizontal: 20,
    gap: 4,
    marginBottom: 12,
  },
  displayWrap: {
    paddingHorizontal: 16,
    marginBottom: 14,
    gap: 6,
  },
  displayCard: {
    borderRadius: radii['2xl'],
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 4,
  },
  displayEyebrow: {
    letterSpacing: 1.4,
  },
  displayValue: {
    letterSpacing: -2,
  },
  helperText: {
    paddingHorizontal: 4,
    fontSize: 12,
  },
  headerExtra: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  saveButton: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  secondaryButton: {
    marginTop: 8,
  },
  numpadDimmed: {
    opacity: 0.4,
  },
})
