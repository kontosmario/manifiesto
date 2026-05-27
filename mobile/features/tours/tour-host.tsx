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
import {
  getTourScrollEntry,
  type MeasuredRect,
} from './tour-scroll-registry'

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
      // Read config early so the scroll math can also use the
      // `extendToScrollEnd` flag (steps that anchor at a row and
      // stretch their cutout downward want the anchor near the TOP
      // of the scroll surface, not at the usual 30% offset, so the
      // stretched region covers as much content as possible).
      const config = currentStep.configRef.current
      const extendToScrollEnd = Boolean(config?.highlight?.extendToScrollEnd)

      const entry = getTourScrollEntry(activeTour)
      let svRectForExtend: MeasuredRect | null = null
      if (entry) {
        let svRect = svRectRef.current
        if (!svRect) {
          svRect = await new Promise<MeasuredRect | null>((resolve) => {
            entry.measureSv(resolve)
          })
          if (cancelled || !svRect) return
          svRectRef.current = svRect
        }
        svRectForExtend = svRect

        // Detect targets that live OUTSIDE the registered ScrollView
        // BELOW its bottom edge (e.g. the Home tab bar's FAB). Their
        // window-Y is not a function of scroll, so any scrollTo math
        // would yank the cutout away from the real element. Skip the
        // auto-scroll entirely and use the measured rect directly.
        //
        // We do NOT treat targets above the scroll view's top as
        // "outside". A target whose window-Y is above `svRect.y`
        // is virtually always scrolled-off content (e.g. the Fijos
        // tour's `addButton` step after step 3 has scrolled the list
        // deep). Skipping the scroll there left the cutout pinned
        // to the previous step's offset; instead we let the normal
        // scroll math run, which produces a negative `stepContentY`
        // → desiredScrollY 0 → animates the page back to the top.
        const OUTSIDE_TOLERANCE = 50
        const isBelowScrollView =
          stepRect.y > svRect.y + svRect.height + OUTSIDE_TOLERANCE
        const targetOutsideScrollView = isBelowScrollView

        if (!targetOutsideScrollView) {
          // For "extend to scroll end" steps, push the anchor to the
          // top of the scroll surface (10% inset) so the stretched
          // cutout covers the rest of the viewport. Other steps use
          // the configured `scrollOffsetRatio` (defaults to 30%) which
          // leaves comfortable room for the tooltip above.
          const offsetRatio = extendToScrollEnd
            ? 0.1
            : defaults.scrollOffsetRatio
          const desiredVisibleY = svRect.height * offsetRatio
          const stepContentY =
            stepRect.y - svRect.y + entry.scrollYRef.current
          // Clamp the requested scroll to maxScrollY = contentHeight
          // − viewport. Without this, the ScrollView silently
          // clamps internally but our `targetWindowY` math is
          // computed from the un-clamped value, leaving the cutout
          // off by the overshoot amount.
          const contentHeight = entry.contentHeightRef.current
          const maxScrollY =
            contentHeight > 0 ? Math.max(0, contentHeight - svRect.height) : Infinity
          const desiredScrollY = Math.max(0, stepContentY - desiredVisibleY)
          const targetScrollY = Math.min(desiredScrollY, maxScrollY)
          const scrollDelta = targetScrollY - entry.scrollYRef.current

          if (Math.abs(scrollDelta) > 4) {
            entry.scrollSvTo(targetScrollY, true)
          }
          // Use the clamped targetScrollY for the post-scroll window
          // position so the cutout lands exactly where the ScrollView
          // will actually settle. Don't optimistically write
          // `entry.scrollYRef.current = targetScrollY` here — with
          // `scrollEventThrottle={16}` the onScroll handler catches
          // up within a frame, and writing the un-clamped value
          // cascaded baseline drift into the next step's measure.
          targetWindowY = svRect.y + (stepContentY - targetScrollY)
        }
      }

      const padding = config?.highlight?.padding ?? defaults.highlightPadding
      const radius =
        config?.highlight?.borderRadius ?? defaults.highlightRadius

      const targetX = targetWindowX - padding
      const targetY = targetWindowY - padding
      const targetW = stepRect.width + padding * 2
      // For `extendToScrollEnd` steps, stretch the cutout's bottom to
      // the scroll surface's bottom edge instead of the anchor's own
      // height. We subtract a small safe margin (4pt) so the cutout
      // doesn't kiss the chrome below.
      const naturalH = stepRect.height + padding * 2
      const targetH =
        extendToScrollEnd && svRectForExtend
          ? Math.max(naturalH, svRectForExtend.y + svRectForExtend.height - targetY - 4)
          : naturalH

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

      // Tooltip placement: pick the side with more usable room, then
      // anchor + clamp so the card stays within the visible area.
      //
      // The previous version used the full window height when
      // computing `roomBelow`, ignoring that the tab bar (~88pt +
      // ~22pt home indicator) at the bottom and the status bar
      // (~50pt) at the top are not usable. For steps near the
      // bottom of the screen (activity, FAB) `roomBelow` looked
      // positive on paper while the tooltip was actually being
      // pushed behind the tab bar — invisible to the user.
      const TOOLTIP_GAP = 16
      const TOOLTIP_HEIGHT_ESTIMATE = 220
      const STATUS_BAR_RESERVE = 50
      const TAB_BAR_RESERVE = 110
      const usableTop = STATUS_BAR_RESERVE
      const usableBottom = screenH - TAB_BAR_RESERVE
      const roomAbove = targetY - usableTop
      const roomBelow = usableBottom - (targetY + targetH)
      // Prefer the side with more room. Ties go to 'below' (the
      // natural reading flow) but on Home's lower-half steps
      // roomAbove always wins decisively.
      const placement = roomAbove > roomBelow ? 'above' : 'below'
      tooltipPlacement.value = placement
      let tooltipTop: number
      if (placement === 'above') {
        tooltipTop = targetY - TOOLTIP_GAP - TOOLTIP_HEIGHT_ESTIMATE
        // Clamp so the tooltip can't slip behind the status bar.
        tooltipTop = Math.max(usableTop, tooltipTop)
      } else {
        tooltipTop = targetY + targetH + TOOLTIP_GAP
        // Clamp so the tooltip can't slip behind the tab bar.
        tooltipTop = Math.min(usableBottom - TOOLTIP_HEIGHT_ESTIMATE, tooltipTop)
      }
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
      {/* Scrim — blocks all underlying touches but does NOT dismiss on tap.
          Dismissal is intentionally restricted to the "Saltar" button in the
          tooltip (consistent with explicit-action UX). The Pressable (no
          onPress) still captures taps so the user can't interact with the
          masked UI underneath. A single SVG Path with `fillRule="evenodd"`
          paints the scrim and subtracts the rounded cutout. The
          Animated.View's opacity drives both the show/hide fade and the
          configured `scrimOpacity` cap. */}
      <Pressable
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
