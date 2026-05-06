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
  /**
   * `false` (default) — renders inside RN's native `<Modal>`.
   *   Required when the sheet must overlay anything outside the
   *   current React tree (e.g. shown from Home over the tab bar).
   *
   * `true` — renders as an absolute-positioned `<View>` INSIDE the
   *   parent component, with no native `<Modal>` wrapper. Use this
   *   when the host screen is already presented as a stack-modal
   *   (e.g. the Asistente screen): iOS otherwise has to coordinate
   *   the dismissal of two stacked UIViewControllers, which adds
   *   150-250ms of latency before touches return to the host. With
   *   `inline`, dismissal is a single React commit and the host's
   *   CTAs become tappable on the next frame.
   */
  inline?: boolean
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
export function ModalCard({
  visible,
  title,
  subtitle,
  onClose,
  inline = false,
  children,
}: ModalCardProps) {
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const { height: screenHeight } = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const numpadOffset = useNumpadOffset()
  const keyboardHeight = useKeyboardHeight()
  const [sheetHeight, setSheetHeight] = useState(screenHeight)

  const translateY = useSharedValue(screenHeight)
  const backdropOpacity = useSharedValue(0)
  // Tracks whether the inline-mode exit animation is currently
  // playing. While `true`, the inline wrapper sets
  // `pointerEvents="none"` so taps fall through to the host's
  // underlying CTAs even though the sheet is still visually present
  // (sliding down + fading). Always false in native-Modal mode.
  const [exiting, setExiting] = useState(false)
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
      // Cancel any in-flight inline exit so re-opening during the
      // slide-down springs back up instead of finishing the exit.
      setExiting(false)
      translateY.value = reduceMotion ? 0 : withSpring(0, motionSprings.sheet)
      backdropOpacity.value = reduceMotion
        ? 1
        : withTiming(1, { duration: motionDurations.standard })
      return
    }
    if (!mounted) return
    // Two close strategies — chosen by render mode:
    //
    //   · `inline` mode (sheet renders as an absolute View inside
    //     the host's tree, no native `<Modal>`): we CAN play the
    //     slide-down + backdrop fade because the inline wrapper
    //     toggles `pointerEvents="none"` during the exit, so taps
    //     fall through to the host's underlying CTAs immediately
    //     while the visual exit finishes. Best of both worlds —
    //     polished close motion + instant interactivity.
    //
    //   · Native `<Modal>` mode: the OS blocks every underlying
    //     touch while the Modal is mounted, no matter what we set
    //     on inner `pointerEvents`. To keep re-tap instant we have
    //     to snap the Modal closed (no visual exit) and let
    //     entrance animate the next open.
    if (inline) {
      setExiting(true)
      backdropOpacity.value = withTiming(0, {
        duration: motionDurations.scrimOut,
      })
      translateY.value = withTiming(
        screenHeight,
        {
          duration: motionDurations.exitModal,
          easing: motionEasings.accelerate,
        },
        (finished) => {
          if (finished) {
            runOnJS(setMounted)(false)
            runOnJS(setExiting)(false)
          }
        },
      )
      return
    }
    setMounted(false)
    translateY.value = screenHeight
    backdropOpacity.value = 0
  }, [visible, mounted, inline, reduceMotion, screenHeight, translateY, backdropOpacity])

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

  // Drag-dismiss path:
  //   · Native `<Modal>` mode — unmount the Modal immediately. RN's
  //     `<Modal>` blocks every underlying touch as long as it's
  //     mounted, and the sheetDismiss spring takes ~250-300ms to
  //     settle, so we'd spend that whole window with the host
  //     unresponsive.
  //   · Inline mode — only call `onClose()`. The parent flips
  //     `visible` to false, the useEffect above runs the inline
  //     exit branch (slide-down + backdrop fade with
  //     `pointerEvents="none"`), and the underlying host stays
  //     touch-interactive throughout the animation.
  const handleDragDismissed = useCallback(() => {
    if (!inline) {
      setMounted(false)
    }
    onClose()
  }, [inline, onClose])

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
        // Fire the unmount immediately, BEFORE waiting on the spring
        // to land. The visible animation of the spring would only
        // play inside the soon-to-unmount Modal anyway — and keeping
        // the Modal alive until spring completion was the source of
        // the ~250ms "tap-after-dismiss" delay the user reported
        // even after the close-path animation was removed. Snap-out
        // matches the snap-out we apply on backdrop-tap (see effect
        // above), so close behavior is consistent across all paths.
        runOnJS(handleDragDismissed)()
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

  // Inner JSX is the same regardless of inline vs Modal — backdrop +
  // sheet inside a GestureHandlerRootView. Wrapping container is the
  // only difference: native `<Modal>` (separate UIVC) for top-level
  // surfaces, absolute-positioned `<View>` for inline mode.
  const inner = (
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
  )

  if (inline) {
    // Inline mode: render as an absolute-positioned overlay inside
    // the parent component. No native UIViewController, so iOS does
    // not need to coordinate stacked-modal teardown — dismissal is a
    // single React commit and the host's underlying view becomes
    // touch-interactive on the next frame. Keep rendering null while
    // unmounted so the absolute layer doesn't sit invisibly over
    // host content (and steal pointer events).
    if (!mounted) return null
    // While exiting, set `pointerEvents="none"` so the still-visible
    // sheet + backdrop don't block taps on the host. The animation
    // (backdrop fade-out + sheet slide-down) keeps playing visually,
    // but the user can already tap underlying CTAs on the next frame.
    return (
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents={exiting ? 'none' : 'box-none'}
      >
        {inner}
      </View>
    )
  }

  return (
    <Modal
      animationType="none"
      onRequestClose={handleDismiss}
      statusBarTranslucent
      transparent
      visible={mounted}
    >
      {inner}
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
