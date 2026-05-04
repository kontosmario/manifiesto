import { useEffect, useMemo } from 'react'
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

const ZERO_RECT: MeasuredRect = { x: 0, y: 0, width: 0, height: 0 }

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
    currentRef,
    currentConfig,
    defaults,
    measureToken,
    stop,
  } = useTour()
  const { width: screenW, height: screenH } = useWindowDimensions()

  const visible = activeTour !== null

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
  useEffect(() => {
    if (reduced || !visible || !currentConfig?.highlight?.pulse) {
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
  }, [reduced, visible, currentConfig, defaults.pulseDurationMs, pulseT])

  // Measure the active step's view + auto-scroll + spring the cutout
  // to the new rect. Re-runs when the step changes or when targets
  // re-register (measureToken).
  useEffect(() => {
    if (!visible || !currentRef?.current || !activeTour) return
    let cancelled = false

    const runMeasure = (): Promise<MeasuredRect | null> =>
      new Promise((resolve) => {
        const node = currentRef.current as
          | {
              measureInWindow: (
                cb: (x: number, y: number, w: number, h: number) => void,
              ) => void
            }
          | null
        if (!node) {
          resolve(null)
          return
        }
        node.measureInWindow((x, y, width, height) => {
          resolve({ x, y, width, height })
        })
      })

    const run = async () => {
      // First, optionally auto-scroll so the step lands at the
      // configured ratio. We do this BEFORE the cutout measurement
      // so the spring tracks the post-scroll position.
      const entry = getTourScrollEntry(activeTour)
      if (entry?.scrollView) {
        const stepRect = await runMeasure()
        if (cancelled || !stepRect) return
        const sv = entry.scrollView as unknown as {
          measureInWindow: (
            cb: (x: number, y: number, w: number, h: number) => void,
          ) => void
          scrollTo: (opts: { y: number; animated: boolean }) => void
        }
        const svRect = await new Promise<MeasuredRect | null>((resolve) => {
          if (!sv) {
            resolve(null)
            return
          }
          sv.measureInWindow((x, y, w, h) =>
            resolve({ x, y, width: w, height: h }),
          )
        })
        if (cancelled || !svRect) return
        const contentY =
          stepRect.y - svRect.y + entry.scrollYRef.current
        const desiredVisibleY = svRect.height * defaults.scrollOffsetRatio
        const targetScrollY = Math.max(0, contentY - desiredVisibleY)
        sv.scrollTo({ y: targetScrollY, animated: true })
        // Wait for the scroll to settle (animated:true on RN
        // ScrollView is OS-driven — there's no callback, so we use
        // the configured scroll duration as a proxy).
        await new Promise<void>((resolve) =>
          setTimeout(resolve, defaults.scrollDurationMs),
        )
        if (cancelled) return
      }

      // Now measure again post-scroll and spring the cutout.
      const finalRect = await runMeasure()
      if (cancelled || !finalRect) return
      const padding =
        currentConfig?.highlight?.padding ?? defaults.highlightPadding
      const radius =
        currentConfig?.highlight?.borderRadius ?? defaults.highlightRadius

      const targetX = finalRect.x - padding
      const targetY = finalRect.y - padding
      const targetW = finalRect.width + padding * 2
      const targetH = finalRect.height + padding * 2

      // First time we render a cutout, snap rather than animate from
      // (0, 0). Subsequent transitions spring smoothly.
      const isFirstMeasure = cutW.value === 0 && cutH.value === 0
      const spring = (to: number, sv: typeof cutX) =>
        isFirstMeasure || reduced
          ? (sv.value = to)
          : (sv.value = withSpring(to, defaults.highlightSpring))

      spring(targetX, cutX)
      spring(targetY, cutY)
      spring(targetW, cutW)
      spring(targetH, cutH)
      spring(radius, cutR)

      // Tooltip placement: above the cutout if there's more room
      // above, otherwise below. Tooltip Y is the *top* of the card.
      const TOOLTIP_GAP = 16
      const TOOLTIP_HEIGHT_ESTIMATE = 200 // tooltip won't exceed this
      const roomBelow =
        screenH - (targetY + targetH) - TOOLTIP_GAP - TOOLTIP_HEIGHT_ESTIMATE
      const roomAbove = targetY - TOOLTIP_GAP - TOOLTIP_HEIGHT_ESTIMATE
      const placement = roomBelow >= 0 || roomBelow > roomAbove ? 'below' : 'above'
      tooltipPlacement.value = placement
      const tooltipTop =
        placement === 'below'
          ? targetY + targetH + TOOLTIP_GAP
          : Math.max(48, targetY - TOOLTIP_GAP - TOOLTIP_HEIGHT_ESTIMATE)
      tooltipY.value = isFirstMeasure || reduced
        ? tooltipTop
        : withSpring(tooltipTop, defaults.tooltipSpring)
    }

    void run()
    return () => {
      cancelled = true
    }
    // measureToken is included so re-registering a step (e.g. via
    // hot reload or a layout flip) re-measures.
  }, [
    visible,
    activeTour,
    activeIndex,
    currentRef,
    currentConfig,
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

  // Optional border drawn around the cutout.
  const borderColor = currentConfig?.highlight?.borderColor
  const borderWidth = currentConfig?.highlight?.borderWidth ?? 0
  const borderAnimatedProps = useAnimatedProps(() => ({
    x: cutX.value,
    y: cutY.value,
    width: cutW.value,
    height: cutH.value,
    rx: cutR.value,
    ry: cutR.value,
  }))

  // Pulse halo — expands from the cutout and fades out cyclically.
  const pulseColor = currentConfig?.highlight?.pulseColor ?? '#A6EF8F'
  const pulseWidth = currentConfig?.highlight?.pulseWidth ?? 3
  const pulseEnabled = Boolean(currentConfig?.highlight?.pulse)
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
