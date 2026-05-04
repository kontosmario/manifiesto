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
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import SvgRaw, { Path } from 'react-native-svg'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

// react-native-svg's typings are strict on children/style. Cast to
// `React.FC` so we can pass the animated children we need without
// fighting the lib's prop types.
const Svg = SvgRaw as unknown as React.FC<
  React.ComponentProps<typeof SvgRaw> & { children?: React.ReactNode }
>
const AnimatedPath = Animated.createAnimatedComponent(Path)
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
          // Optimistically advance the tracked ref to the new
          // target. RN's animated scroll fires onScroll with some
          // throttle delay, so the next step's measure can read a
          // stale offset and land the cutout misaligned. By
          // pre-writing the target here, the next measure has the
          // right baseline regardless of when onScroll catches up.
          entry.scrollYRef.current = targetScrollY
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

  // ─── Mask geometry (single SVG Path, fillRule=evenodd) ─────────
  //
  // Builds the scrim shape as one Path: full-screen outer rect,
  // followed by a rounded-rectangle subpath for the cutout drawn
  // counter-clockwise. With `fillRule="evenodd"`, the cutout area
  // counts as "outside" the fill region — that's what creates the
  // transparent hole.
  //
  // Why this beats the previous 4-rect + 4-corner-cap approach:
  // the corner caps had to paint the "kite" between the bounding
  // rectangle and the cutout's curve, but with `borderXxxRadius =
  // sideLength` the View collapsed into a quarter-circle on the
  // *opposite* side, so the kite never got painted and the cutout
  // ended up with concave corners eating into it ("comido hacia
  // adentro" was the user's exact description). A single path with
  // explicit arc commands has no such trap — the curve is what
  // we say it is.
  //
  // The path string is rebuilt each frame by a worklet, so cutout
  // motion runs entirely on the UI thread. Native renderers
  // (Android Canvas.drawPath, iOS CGPath) handle Paths far more
  // efficiently than `<Mask>` compositing.

  const stepConfig = currentStep?.configRef.current

  const cutoutPathProps = useAnimatedProps(() => {
    const x = cutX.value
    const y = cutY.value
    const w = cutW.value
    const h = cutH.value
    const r = Math.max(0, Math.min(cutR.value, w / 2, h / 2))
    // Outer rect (clockwise) + inner rounded rect (counter-
    // clockwise). evenodd fillRule turns the inner shape into a
    // hole.
    const d =
      `M0 0 H${screenW} V${screenH} H0 Z` +
      ` M${x + r} ${y}` +
      ` H${x + w - r}` +
      ` A${r} ${r} 0 0 1 ${x + w} ${y + r}` +
      ` V${y + h - r}` +
      ` A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
      ` H${x + r}` +
      ` A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
      ` V${y + r}` +
      ` A${r} ${r} 0 0 1 ${x + r} ${y}` +
      ` Z`
    return { d }
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
      {/* Scrim — Pressable wrapper for tap-to-dismiss; a single
          SVG Path with `fillRule="evenodd"` paints the scrim and
          subtracts the rounded cutout. The Animated.View's opacity
          drives both the show/hide fade and the configured
          `scrimOpacity` cap. */}
      <Pressable
        accessibilityLabel="Cerrar tutorial"
        onPress={() => stop(false)}
        style={StyleSheet.absoluteFill}
      >
        <Animated.View
          pointerEvents="auto"
          style={[StyleSheet.absoluteFill, scrimAnimatedStyle]}
        >
          <Svg width={screenW} height={screenH}>
            <AnimatedPath
              animatedProps={cutoutPathProps}
              fill={scrimColor}
              fillRule="evenodd"
            />
          </Svg>
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
