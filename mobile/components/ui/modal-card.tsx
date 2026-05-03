import { useCallback, useEffect, useState, type PropsWithChildren } from 'react'
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
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
import { useKeyboardHeight } from '@/hooks/use-keyboard-height'
import { triggerHaptic } from '@/lib/haptics'
import {
  motionDurations,
  motionEasings,
  motionSprings,
} from '@/lib/motion'
import {
  publishModalClose,
  publishModalOpen,
} from '@/lib/modal-visibility'
import { useNumpadOffset } from '@/lib/numpad-visibility'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface ModalCardProps extends PropsWithChildren {
  visible: boolean
  title: string
  subtitle?: string
  onClose: () => void
}

const DISMISS_DISTANCE = 120
const DISMISS_VELOCITY = 800

/**
 * Bottom-sheet modal that mirrors the `InAppNumpad` skeleton for visual
 * consistency: flush-to-edges, rounded top corners only, drag-to-dismiss
 * driven on the UI thread by Reanimated + the new Gesture API.
 *
 * Why this shape (vs. a floating card):
 *  - Consistent with InAppNumpad and avatar sheet so every modal in
 *    the app feels like the same surface
 *  - Anchors cleanly to the keyboard (no mid-screen gap)
 *  - Drag gesture runs on the UI thread via worklet — no JS-bridge
 *    hops, no re-render on state changes during the swipe
 */
export function ModalCard({ visible, title, subtitle, onClose, children }: ModalCardProps) {
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const { height: screenHeight } = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const numpadOffset = useNumpadOffset()
  const keyboardHeight = useKeyboardHeight()
  const [sheetHeight, setSheetHeight] = useState(screenHeight)

  const translateY = useSharedValue(screenHeight)
  const backdropOpacity = useSharedValue(0)
  // Local `mounted` flag survives one extra frame after `visible` flips
  // to false so the native `<Modal>` keeps the sheet on-screen while
  // our exit animation plays. Without this, RN's Modal unmounts the
  // moment its `visible` prop becomes false and the slide-out is
  // invisible — what the user perceived as a "snap close" after every
  // save in the settings sheets.
  const [mounted, setMounted] = useState(visible)

  // Publish to the global "modal open" flag so the underlying Screen
  // suspends its own KeyboardAvoidingView while we're visible.
  useEffect(() => {
    if (!visible) return
    publishModalOpen()
    return () => {
      publishModalClose()
    }
  }, [visible])

  // Enter / exit animation driven by the `visible` prop.
  // Enter: mount, then spring up.
  // Exit: animate down + fade backdrop, then unmount in the completion
  // callback. Works for every close path — drag-to-dismiss, backdrop
  // tap, and external close after a successful save.
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

  const handleDismiss = useCallback(() => {
    Keyboard.dismiss()
    void triggerHaptic('selection')
    // Just notify the parent; the visible→false effect above handles
    // animating out and unmounting once the slide-down finishes.
    onClose()
  }, [onClose])

  const handleSheetLayout = useCallback((event: LayoutChangeEvent) => {
    setSheetHeight(event.nativeEvent.layout.height)
  }, [])

  // Drag-dismiss path: spring lands at `screenHeight` first, then we
  // unmount and notify the parent in a single completion handler. This
  // avoids racing the parent's `visible→false` re-render against the
  // in-flight spring (which used to swap the curve mid-air).
  const handleDragDismissed = useCallback(() => {
    setMounted(false)
    onClose()
  }, [onClose])

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }))
  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  const panGesture = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-16, 16])
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
            velocity: Math.max(event.velocityY, 900),
          },
          (finished) => {
            if (finished) runOnJS(handleDragDismissed)()
          },
        )
      } else {
        translateY.value = withSpring(0, motionSprings.sheet)
        backdropOpacity.value = withTiming(1, { duration: motionDurations.quick })
      }
    })

  // Bottom padding adapts to whichever bottom-attached surface is up
  // (OS keyboard OR in-app numpad). `endCoordinates.height` already
  // covers the iOS home indicator, so we subtract it to avoid
  // double-counting. `BUTTON_CLEARANCE` is breathing room between the
  // last CTA and the keyboard top edge so the button never hugs the
  // predictive-suggestions bar.
  const BUTTON_CLEARANCE = 30
  const rawKeyboardPad =
    keyboardHeight > 0 ? Math.max(0, keyboardHeight - insets.bottom) + BUTTON_CLEARANCE : 0
  const rawNumpadPad =
    numpadOffset > 0 ? Math.max(0, numpadOffset - insets.bottom) + BUTTON_CLEARANCE : 0
  const bottomInset = Math.max(insets.bottom + 12, rawKeyboardPad, rawNumpadPad)

  return (
    <Modal
      animationType="none"
      onRequestClose={handleDismiss}
      statusBarTranslucent
      transparent
      visible={mounted}
    >
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropAnimatedStyle]}>
          <Pressable
            accessibilityLabel="Cerrar"
            accessibilityRole="button"
            onPress={handleDismiss}
            style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}
          />
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View
            accessibilityViewIsModal
            onLayout={handleSheetLayout}
            style={[
              styles.sheet,
              sheetAnimatedStyle,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                paddingBottom: bottomInset,
                maxHeight: screenHeight * 0.92,
              },
            ]}
          >
            <View style={styles.handleArea}>
              <View
                style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]}
              />
            </View>
            <View style={styles.headerBlock}>
              <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
              {subtitle ? (
                <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
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
  },
  handleArea: {
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radii.pill,
  },
  headerBlock: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 4,
  },
  title: {
    ...typography.sectionTitle,
  },
  subtitle: {
    ...typography.body,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 16,
  },
})
