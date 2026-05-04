import { useEffect, useMemo, useRef } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionDurations } from '@/lib/motion/tokens'
import { useTour } from './tour-context'
import { TourTooltip } from './tour-tooltip'
import { getTourScrollEntry } from './tour-scroll-registry'

interface MeasuredRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Top-level overlay for the guided tour. Mounted once at the
 * `<TourProvider>` level. When a tour starts, the host:
 *
 *   1. Reads the active step's view ref + config from `useTour`.
 *   2. Calls `measureInWindow` to get the target's window rect.
 *   3. Optionally fires `scrollTo` on the registered ScrollView and
 *      computes the target's post-scroll window position with
 *      arithmetic (no second measure needed) so the cutout's spring
 *      and the scroll run in parallel.
 *   4. Springs five SharedValues (cutX, cutY, cutW, cutH, cutR)
 *      that drive the mask's geometry on the UI thread.
 *
 * The mask itself is built from 4 axis-aligned rectangles + 4
 * corner caps (each a small View with one inverted-radius corner).
 * This is significantly faster than an SVG mask on Android — no
 * mask compositing pipeline, no offscreen rasterization per frame,
 * just native View transforms which Reanimated drives directly on
 * the UI thread.
 *
 *   Layout of the cutout (X = scrim, _ = transparent):
 *
 *      X X X X X X X X X X X
 *      X X X X X X X X X X X    ← top mask
 *      X X X X X X X X X X X
 *      X X┌─────────────┐X X
 *      X X│             │X X    ← left + right masks (vertical strips)
 *      X X│      _      │X X      with the corner caps rounding the four
 *      X X│             │X X      inner corners
 *      X X└─────────────┘X X
 *      X X X X X X X X X X X
 *      X X X X X X X X X X X    ← bottom mask
 *
 * The corner caps are r×r squares with `borderXxxRadius: r` on the
 * corner that points into the cutout. With backgroundColor=scrim,
 * they paint the "kite" between the bounding rectangle and the
 * rounded shape at each corner.
 */
export function TourHost() {
  const reduced = useReducedMotion()
  const {
    activeTour,
    activeIndex,
    currentStep,
    defaults,
    measureToken,
    stop,
  } = useTour()
  const { width: screenW, height: screenH } = useWindowDimensions()

  const visible = activeTour !== null
  const svRectRef = useRef<MeasuredRect | null>(null)
  useEffect(() => {
    svRectRef.current = null
  }, [activeTour])

  // Cutout rect (window coords) + radius. These five SharedValues
  // drive every animated style below — the mask geometry is fully
  // derived from them, so the entire mask animates as one motion.
  const cutX = useSharedValue(0)
  const cutY = useSharedValue(0)
  const cutW = useSharedValue(0)
  const cutH = useSharedValue(0)
  const cutR = useSharedValue(defaults.highlightRadius)

  const tooltipY = useSharedValue(0)
  const tooltipPlacement = useSharedValue<'above' | 'below'>('below')

  const scrimO = useSharedValue(0)
  const tooltipO = useSharedValue(0)

  // Pulse drives a 0→1 cyclic value used by the pulse rect's props.
  const pulseT = useSharedValue(0)

  // Mount/unmount fade — animated separately so the show/hide curve
  // doesn't fight the cutout tracking spring.
  useEffect(() => {
    if (reduced) {
      scrimO.value = visible ? 1 : 0
      tooltipO.value = visible ? 1 : 0
      return
    }
    if (visible) {
      scrimO.value = withTiming(1, { duration: motionDurations.scrimIn })
      tooltipO.value = withTiming(1, {
        duration: motionDurations.standard,
        easing: Easing.out(Easing.cubic),
      })
    } else {
      scrimO.value = withTiming(0, { duration: motionDurations.scrimOut })
      tooltipO.value = withTiming(0, { duration: motionDurations.exitTab })
    }
  }, [visible, reduced, scrimO, tooltipO])

  const stepPulseEnabled = Boolean(
    currentStep?.configRef.current?.highlight?.pulse,
  )
  useEffect(() => {
    if (reduced || !visible || !stepPulseEnabled) {
      cancelAnimation(pulseT)
      pulseT.value = 0
      return
    }
    pulseT.value = 0
    pulseT.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: defaults.pulseDurationMs,
          easing: Easing.out(Easing.cubic),
        }),
        // @motion-allow: instant 0ms reset of the pulse value at end of each loop iteration
        withTiming(0, { duration: 0 }),
      ),
      -1,
      false,
    )
  }, [reduced, visible, stepPulseEnabled, defaults.pulseDurationMs, pulseT])

  // Step measurement + auto-scroll + cutout spring. See the file
  // header for why scroll runs in parallel with the spring.
  useEffect(() => {
    if (!visible || !currentStep || !activeTour) return
    let cancelled = false

    const measure = (
      node:
        | {
            measureInWindow: (
              cb: (x: number, y: number, w: number, h: number) => void,
            ) => void
          }
        | null,
    ): Promise<MeasuredRect | null> =>
      new Promise((resolve) => {
        if (!node) {
          resolve(null)
          return
        }
        node.measureInWindow((x, y, w, h) =>
          resolve({ x, y, width: w, height: h }),
        )
      })

    const run = async () => {
      const node = currentStep.viewRef.current as
        | {
            measureInWindow: (
              cb: (x: number, y: number, w: number, h: number) => void,
            ) => void
          }
        | null
      if (!node) return

      const stepRect = await measure(node)
      if (cancelled || !stepRect) return

      let targetWindowY = stepRect.y
      const targetWindowX = stepRect.x

      const entry = getTourScrollEntry(activeTour)
      if (entry?.scrollView) {
        const sv = entry.scrollView as unknown as {
          measureInWindow: (
            cb: (x: number, y: number, w: number, h: number) => void,
          ) => void
          scrollTo: (opts: { y: number; animated: boolean }) => void
        }
        let svRect = svRectRef.current
        if (!svRect) {
          svRect = await measure(sv)
          if (cancelled || !svRect) return
          svRectRef.current = svRect
        }
        const desiredVisibleY = svRect.height * defaults.scrollOffsetRatio
        const stepContentY =
          stepRect.y - svRect.y + entry.scrollYRef.current
        const targetScrollY = Math.max(0, stepContentY - desiredVisibleY)
        const scrollDelta = targetScrollY - entry.scrollYRef.current

        if (Math.abs(scrollDelta) > 4) {
          sv.scrollTo({ y: targetScrollY, animated: true })
          targetWindowY = svRect.y + (stepContentY - targetScrollY)
        }
      }

      const config = currentStep.configRef.current
      const padding = config?.highlight?.padding ?? defaults.highlightPadding
      const radius =
        config?.highlight?.borderRadius ?? defaults.highlightRadius

      const targetX = targetWindowX - padding
      const targetY = targetWindowY - padding
      const targetW = stepRect.width + padding * 2
      const targetH = stepRect.height + padding * 2

      const isFirstMeasure = cutW.value === 0 && cutH.value === 0
      const spring = (sv: typeof cutX, to: number) => {
        sv.value =
          isFirstMeasure || reduced
            ? to
            : withSpring(to, defaults.highlightSpring)
      }
      spring(cutX, targetX)
      spring(cutY, targetY)
      spring(cutW, targetW)
      spring(cutH, targetH)
      spring(cutR, radius)

      const TOOLTIP_GAP = 16
      const TOOLTIP_HEIGHT_ESTIMATE = 200
      const roomBelow =
        screenH - (targetY + targetH) - TOOLTIP_GAP - TOOLTIP_HEIGHT_ESTIMATE
      const roomAbove = targetY - TOOLTIP_GAP - TOOLTIP_HEIGHT_ESTIMATE
      const placement =
        roomBelow >= 0 || roomBelow > roomAbove ? 'below' : 'above'
      tooltipPlacement.value = placement
      const tooltipTop =
        placement === 'below'
          ? targetY + targetH + TOOLTIP_GAP
          : Math.max(48, targetY - TOOLTIP_GAP - TOOLTIP_HEIGHT_ESTIMATE)
      tooltipY.value =
        isFirstMeasure || reduced
          ? tooltipTop
          : withSpring(tooltipTop, defaults.tooltipSpring)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [
    visible,
    activeTour,
    activeIndex,
    currentStep,
    measureToken,
    reduced,
    screenH,
    defaults,
    cutX,
    cutY,
    cutW,
    cutH,
    cutR,
    tooltipPlacement,
    tooltipY,
  ])

  // ─── Mask geometry (native Views, no SVG) ──────────────────────
  // Each animated style derives its position/size from cutX/cutY/
  // cutW/cutH/cutR via worklet — runs on the UI thread, no bridge.

  const stepConfig = currentStep?.configRef.current

  const topMaskStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: 0,
    top: 0,
    width: screenW,
    height: Math.max(0, cutY.value),
  }))

  const bottomMaskStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: 0,
    top: cutY.value + cutH.value,
    width: screenW,
    height: Math.max(0, screenH - (cutY.value + cutH.value)),
  }))

  const leftMaskStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: 0,
    top: cutY.value,
    width: Math.max(0, cutX.value),
    height: cutH.value,
  }))

  const rightMaskStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: cutX.value + cutW.value,
    top: cutY.value,
    width: Math.max(0, screenW - (cutX.value + cutW.value)),
    height: cutH.value,
  }))

  // Corner caps: r×r squares at each cutout corner, with one
  // inverted-radius corner facing inward. Together with the four
  // mask rectangles they paint the rounded-rectangle cutout.
  // `safeR` clamps the radius so caps never overlap on small rects.
  const tlCornerStyle = useAnimatedStyle(() => {
    const safeR = Math.min(cutR.value, cutW.value / 2, cutH.value / 2)
    return {
      position: 'absolute',
      left: cutX.value,
      top: cutY.value,
      width: safeR,
      height: safeR,
      borderBottomRightRadius: safeR,
    }
  })

  const trCornerStyle = useAnimatedStyle(() => {
    const safeR = Math.min(cutR.value, cutW.value / 2, cutH.value / 2)
    return {
      position: 'absolute',
      left: cutX.value + cutW.value - safeR,
      top: cutY.value,
      width: safeR,
      height: safeR,
      borderBottomLeftRadius: safeR,
    }
  })

  const blCornerStyle = useAnimatedStyle(() => {
    const safeR = Math.min(cutR.value, cutW.value / 2, cutH.value / 2)
    return {
      position: 'absolute',
      left: cutX.value,
      top: cutY.value + cutH.value - safeR,
      width: safeR,
      height: safeR,
      borderTopRightRadius: safeR,
    }
  })

  const brCornerStyle = useAnimatedStyle(() => {
    const safeR = Math.min(cutR.value, cutW.value / 2, cutH.value / 2)
    return {
      position: 'absolute',
      left: cutX.value + cutW.value - safeR,
      top: cutY.value + cutH.value - safeR,
      width: safeR,
      height: safeR,
      borderTopLeftRadius: safeR,
    }
  })

  // Optional border around the cutout.
  const borderColor = stepConfig?.highlight?.borderColor
  const borderWidth = stepConfig?.highlight?.borderWidth ?? 0
  const borderStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: cutX.value,
    top: cutY.value,
    width: cutW.value,
    height: cutH.value,
    borderRadius: cutR.value,
  }))

  // Pulse halo — expands outward and fades cyclically.
  const pulseColor = stepConfig?.highlight?.pulseColor ?? '#A6EF8F'
  const pulseWidth = stepConfig?.highlight?.pulseWidth ?? 3
  const pulseEnabled = stepPulseEnabled
  const pulseStyle = useAnimatedStyle(() => {
    const t = pulseT.value
    const expand = interpolate(t, [0, 1], [0, 22], Extrapolation.CLAMP)
    const fade = interpolate(t, [0, 0.2, 1], [0, 0.7, 0], Extrapolation.CLAMP)
    return {
      position: 'absolute',
      left: cutX.value - expand,
      top: cutY.value - expand,
      width: cutW.value + expand * 2,
      height: cutH.value + expand * 2,
      borderRadius: cutR.value + expand,
      opacity: fade,
    }
  })

  // Whole-overlay scrim opacity. This wraps every mask View so they
  // all fade in/out together, while individual mask geometry
  // continues to animate via its own SharedValues.
  const finalScrimOpacity = useMemo(
    () => Math.max(0, Math.min(1, defaults.scrimOpacity)),
    [defaults.scrimOpacity],
  )
  const scrimAnimatedStyle = useAnimatedStyle(() => ({
    opacity: scrimO.value * finalScrimOpacity,
  }))

  const tooltipAnimatedStyle = useAnimatedStyle(() => ({
    opacity: tooltipO.value,
    transform: [{ translateY: tooltipY.value }],
  }))

  if (!visible) return null

  const scrimColor = defaults.scrimColor

  return (
    <Modal
      animationType="none"
      onRequestClose={() => stop(false)}
      statusBarTranslucent
      transparent
      visible
    >
      {/* Scrim — Pressable wrapper for tap-to-dismiss; the 8 child
          mask Views form the rounded cutout. */}
      <Pressable
        accessibilityLabel="Cerrar tutorial"
        onPress={() => stop(false)}
        style={StyleSheet.absoluteFill}
      >
        <Animated.View
          pointerEvents="auto"
          style={[StyleSheet.absoluteFill, scrimAnimatedStyle]}
        >
          {/* 4 main mask rectangles + 4 corner caps. All
              backgroundColor: scrimColor — the parent Animated.View's
              opacity multiplies through. */}
          <Animated.View
            pointerEvents="none"
            style={[topMaskStyle, { backgroundColor: scrimColor }]}
          />
          <Animated.View
            pointerEvents="none"
            style={[bottomMaskStyle, { backgroundColor: scrimColor }]}
          />
          <Animated.View
            pointerEvents="none"
            style={[leftMaskStyle, { backgroundColor: scrimColor }]}
          />
          <Animated.View
            pointerEvents="none"
            style={[rightMaskStyle, { backgroundColor: scrimColor }]}
          />
          <Animated.View
            pointerEvents="none"
            style={[tlCornerStyle, { backgroundColor: scrimColor }]}
          />
          <Animated.View
            pointerEvents="none"
            style={[trCornerStyle, { backgroundColor: scrimColor }]}
          />
          <Animated.View
            pointerEvents="none"
            style={[blCornerStyle, { backgroundColor: scrimColor }]}
          />
          <Animated.View
            pointerEvents="none"
            style={[brCornerStyle, { backgroundColor: scrimColor }]}
          />
        </Animated.View>
      </Pressable>

      {/* Optional border + pulse — sit ABOVE the scrim, don't capture
          taps (so the user can still tap on highlighted UI through
          the cutout, in case future iterations want interactive tour
          targets). */}
      {borderWidth > 0 && borderColor ? (
        <Animated.View
          pointerEvents="none"
          style={[
            borderStyle,
            {
              borderWidth,
              borderColor,
            },
          ]}
        />
      ) : null}
      {pulseEnabled ? (
        <Animated.View
          pointerEvents="none"
          style={[
            pulseStyle,
            {
              borderWidth: pulseWidth,
              borderColor: pulseColor,
            },
          ]}
        />
      ) : null}

      <Animated.View
        pointerEvents="box-none"
        style={[styles.tooltipWrap, tooltipAnimatedStyle]}
      >
        <View style={styles.tooltipInner} pointerEvents="auto">
          <TourTooltip />
        </View>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  tooltipWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 0,
  },
  tooltipInner: {
    width: '100%',
  },
})
