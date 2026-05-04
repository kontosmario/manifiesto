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
import SvgRaw, {
  Defs as DefsRaw,
  Mask as MaskRaw,
  Rect,
} from 'react-native-svg'

// react-native-svg's TypeScript declarations are strict in a way
// that rejects loose `children` and `style` on these wrapper
// components. Casting to React.FC restores the children-accepting
// behavior we get at runtime. See `feedback_react_native_svg_typing`
// in our memory for the same pattern used elsewhere.
const Svg = SvgRaw as unknown as React.FC<
  React.ComponentProps<typeof SvgRaw> & { children?: React.ReactNode }
>
const Defs = DefsRaw as unknown as React.FC<{ children?: React.ReactNode }>
const Mask = MaskRaw as unknown as React.FC<
  React.ComponentProps<typeof MaskRaw> & { children?: React.ReactNode }
>
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionDurations } from '@/lib/motion/tokens'
import { useTour } from './tour-context'
import { TourTooltip } from './tour-tooltip'
import { getTourScrollEntry } from './tour-scroll-registry'

const AnimatedRect = Animated.createAnimatedComponent(Rect)

interface MeasuredRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Top-level overlay for the guided tour. Mounted once at the
 * `<TourProvider>` level. When a tour starts:
 *
 *   1. `useTour` exposes the active step's view ref + config.
 *   2. The host runs `measureInWindow` on the ref and computes the
 *      cutout's window rect (with the step's optional padding).
 *   3. Reanimated SharedValues spring to the new rect; the SVG
 *      mask animates with them on the UI thread (no bridge cost
 *      per frame, no `measureLayout` deprecation warnings).
 *   4. An optional pulse halo loops outward from the cutout, and an
 *      optional border draws around it — both per-step opt-ins.
 *   5. The tooltip is positioned above or below the cutout
 *      depending on which side has more room, and slides into
 *      place with a separate spring.
 *
 * The host also drives auto-scroll: when the active step changes
 * and the screen has registered a ScrollView, the host scrolls it
 * so the target lands at the configured offset ratio (default 30%
 * from the top of the visible area). All measurement uses
 * `measureInWindow` — Fabric-safe.
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
  // Cache the registered ScrollView's window rect across step
  // transitions within the same tour. The ScrollView doesn't move
  // mid-tour, so re-measuring its window position on every step is
  // pure waste. Reset when the active tour changes.
  const svRectRef = useRef<MeasuredRect | null>(null)
  useEffect(() => {
    svRectRef.current = null
  }, [activeTour])

  // Cutout rect (window coords) + radius — the spring values that
  // the SVG mask reads on the UI thread.
  const cutX = useSharedValue(0)
  const cutY = useSharedValue(0)
  const cutW = useSharedValue(0)
  const cutH = useSharedValue(0)
  const cutR = useSharedValue(defaults.highlightRadius)

  // Tooltip placement (window y for the top of the tooltip card).
  const tooltipY = useSharedValue(0)
  const tooltipPlacement = useSharedValue<'above' | 'below'>('below')

  // Scrim opacity + tooltip opacity are gated by `visible`, animated
  // separately so the show/hide curve doesn't fight the cutout
  // tracking spring.
  const scrimO = useSharedValue(0)
  const tooltipO = useSharedValue(0)

  // Pulse drives a 0→1 cyclic value used by the pulse rect's props.
  const pulseT = useSharedValue(0)

  // Mount/unmount the Modal in step with an animated fade so the
  // overlay doesn't snap on/off.
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
      tooltipO.value = withTiming(0, {
        duration: motionDurations.exitTab,
      })
    }
  }, [visible, reduced, scrimO, tooltipO])

  // Pulse loop — runs only while a tour is active and the step opts
  // in. Cancels on stop / step-without-pulse so we don't waste CPU.
  // Reads pulse opt-in fresh from the configRef inside the effect
  // so per-step config updates don't force the effect to re-run on
  // every render of the host.
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

  // Measure the active step + (optionally) fire scroll + spring the
  // cutout — all in parallel. Re-runs when the step or the active
  // tour changes, or when targets re-register (`measureToken`).
  //
  // The previous version awaited the scroll for `scrollDurationMs`
  // (320ms) before springing the cutout. That serial wait dominated
  // the felt-latency between steps. This version computes the post-
  // scroll window position with arithmetic, fires the scroll and
  // springs the cutout in the same frame, and skips the scroll
  // entirely when the target is already in the viewport at the
  // desired offset (delta < 4pt).
  useEffect(() => {
    if (!visible || !currentStep || !activeTour) return
    let cancelled = false

    const measure = (
      node: { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null,
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

      // 1. Measure the step in window coords.
      const stepRect = await measure(node)
      if (cancelled || !stepRect) return

      // 2. Compute target window position. If a ScrollView is
      //    registered, work out the post-scroll position math and
      //    fire scrollTo immediately — no awaiting.
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
        // Cache svRect across steps within the same tour — the
        // ScrollView's window position doesn't change mid-tour.
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

        // Skip the scroll call entirely if we're already there.
        // Saves a frame on screens where the target was visible.
        if (Math.abs(scrollDelta) > 4) {
          sv.scrollTo({ y: targetScrollY, animated: true })
          // Where the step lands in window after the scroll lands.
          targetWindowY = svRect.y + (stepContentY - targetScrollY)
        }
      }

      // 3. Read per-step style and compute final cutout rect.
      const config = currentStep.configRef.current
      const padding = config?.highlight?.padding ?? defaults.highlightPadding
      const radius =
        config?.highlight?.borderRadius ?? defaults.highlightRadius

      const targetX = targetWindowX - padding
      const targetY = targetWindowY - padding
      const targetW = stepRect.width + padding * 2
      const targetH = stepRect.height + padding * 2

      // 4. Spring everything in parallel with the scroll. First
      //    measure of the session snaps; subsequent transitions
      //    spring with the configured `highlightSpring`.
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

      // Tooltip placement based on the post-scroll position.
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
    // currentStep's reference is stable per (activeTour, activeIndex)
    // pair, so depending on it (instead of currentConfig + currentRef
    // which were fresh each render) means this effect only re-runs on
    // actual step changes, not on every host re-render.
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

  // SVG cutout (the hole in the scrim).
  const cutoutAnimatedProps = useAnimatedProps(() => ({
    x: cutX.value,
    y: cutY.value,
    width: cutW.value,
    height: cutH.value,
    rx: cutR.value,
    ry: cutR.value,
  }))

  // Optional border drawn around the cutout. Read fresh from the
  // configRef so per-step style updates flow through without
  // re-registering.
  const stepConfig = currentStep?.configRef.current
  const borderColor = stepConfig?.highlight?.borderColor
  const borderWidth = stepConfig?.highlight?.borderWidth ?? 0
  const borderAnimatedProps = useAnimatedProps(() => ({
    x: cutX.value,
    y: cutY.value,
    width: cutW.value,
    height: cutH.value,
    rx: cutR.value,
    ry: cutR.value,
  }))

  // Pulse halo — expands from the cutout and fades out cyclically.
  const pulseColor = stepConfig?.highlight?.pulseColor ?? '#A6EF8F'
  const pulseWidth = stepConfig?.highlight?.pulseWidth ?? 3
  const pulseEnabled = Boolean(stepConfig?.highlight?.pulse)
  const pulseAnimatedProps = useAnimatedProps(() => {
    const t = pulseT.value
    const expand = interpolate(t, [0, 1], [0, 22], Extrapolation.CLAMP)
    const fade = interpolate(t, [0, 0.2, 1], [0, 0.7, 0], Extrapolation.CLAMP)
    return {
      x: cutX.value - expand,
      y: cutY.value - expand,
      width: cutW.value + expand * 2,
      height: cutH.value + expand * 2,
      rx: cutR.value + expand,
      ry: cutR.value + expand,
      strokeOpacity: fade,
    }
  })

  // Scrim opacity — controls the whole SVG layer's visibility.
  const scrimAnimatedStyle = useAnimatedStyle(() => ({
    opacity: scrimO.value,
  }))

  // Tooltip container — slides into place + fades.
  const tooltipAnimatedStyle = useAnimatedStyle(() => ({
    opacity: tooltipO.value,
    transform: [{ translateY: tooltipY.value }],
  }))

  const finalScrimColor = useMemo(() => defaults.scrimColor, [defaults.scrimColor])
  const finalScrimOpacity = useMemo(
    () => Math.max(0, Math.min(1, defaults.scrimOpacity)),
    [defaults.scrimOpacity],
  )

  // Don't render the Modal at all when no tour is active. Prevents
  // any cost when idle.
  if (!visible) return null

  return (
    <Modal
      animationType="none"
      onRequestClose={() => stop(false)}
      statusBarTranslucent
      transparent
      visible
    >
      {/* Scrim with cutout — tap-anywhere-to-stop is wired here.
          Pressable wraps the SVG so the empty area outside the
          cutout dismisses the tour; the cutout itself doesn't, by
          virtue of being below the user's actual UI (the modal is
          on top, so taps don't pass through anyway — but the
          dismiss intent is "tap on scrim"). */}
      <Pressable
        accessibilityLabel="Cerrar tutorial"
        onPress={() => stop(false)}
        style={StyleSheet.absoluteFill}
      >
        <Animated.View style={[StyleSheet.absoluteFill, scrimAnimatedStyle]}>
          <Svg width={screenW} height={screenH}>
            <Defs>
              <Mask id="tour-cutout">
                {/* Mask: white = scrim shows, black = scrim hidden
                    (the cutout). */}
                <Rect
                  x={0}
                  y={0}
                  width={screenW}
                  height={screenH}
                  fill="white"
                />
                <AnimatedRect
                  animatedProps={cutoutAnimatedProps}
                  fill="black"
                />
              </Mask>
            </Defs>
            {/* The scrim itself, with the cutout subtracted. */}
            <Rect
              x={0}
              y={0}
              width={screenW}
              height={screenH}
              fill={finalScrimColor}
              fillOpacity={finalScrimOpacity}
              mask="url(#tour-cutout)"
            />
            {/* Optional border around the cutout. */}
            {borderWidth > 0 && borderColor ? (
              <AnimatedRect
                animatedProps={borderAnimatedProps}
                fill="none"
                stroke={borderColor}
                strokeWidth={borderWidth}
              />
            ) : null}
            {/* Optional pulse halo. */}
            {pulseEnabled ? (
              <AnimatedRect
                animatedProps={pulseAnimatedProps}
                fill="none"
                stroke={pulseColor}
                strokeWidth={pulseWidth}
              />
            ) : null}
          </Svg>
        </Animated.View>
      </Pressable>

      {/* Tooltip — positioned absolutely with an animated translateY.
          The Pressable wrapper above lets the user tap the scrim to
          dismiss; the tooltip itself sits above and is interactive. */}
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
