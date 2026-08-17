import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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
import {
  resolveHighlightHeight,
  resolveTooltipPlacement,
  TOOLTIP_HEIGHT_SEED,
} from '@/features/tours/tour-tooltip-placement'
import SvgRaw, { Path } from 'react-native-svg'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { neoTokens } from '@/theme/neo-tokens'

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
 * Tinta del overlay del tour, anclada a la rama OSCURA de la paleta neo en
 * los dos temas — igual que `tour-tooltip.tsx`, y por el mismo motivo: el
 * scrim del tour es oscuro en claro y en oscuro (`tour-provider.tsx` L16-17,
 * '#06120C' al 0.78), así que todo lo que se dibuja ENCIMA se calibra contra
 * ese casi-negro y no contra el tema del sistema. Con `neoTokens(mode)` el
 * pulso en claro sería `green` = '#2E7C39' (un verde profundo) sobre el
 * scrim: el halo dejaría de leerse justo en el gesto que existe para llamar
 * la atención. La rama oscura da '#A4E3A6', el equivalente en paleta neo del
 * neón V1 que reemplaza.
 */
const overlayNeo = neoTokens('dark')

/** Aire entre el recuadro resaltado y el tooltip. */
const TOOLTIP_GAP = 16
/** Alto de la barra de tabs. Con edge-to-edge la superficie de scroll pasa POR
 *  DEBAJO de ella, así que ni el tooltip ni el recuadro pueden usar ese tramo:
 *  lo que caiga ahí queda tapado por la navegación. */
const TAB_BAR_HEIGHT = 83

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
  const insets = useSafeAreaInsets()
  // Alto REAL del tooltip. Arranca en la semilla y el primer onLayout lo
  // corrige: el copy del rediseño desbordó el estimado fijo que había antes.
  const [tooltipH, setTooltipH] = useState(TOOLTIP_HEIGHT_SEED)
  const [tooltipMaxH, setTooltipMaxH] = useState<number | null>(null)

  const visible = activeTour !== null
  const svRectRef = useRef<MeasuredRect | null>(null)
  useEffect(() => {
    svRectRef.current = null
  }, [activeTour])

  // Self-heal del "header muerto". Si el Modal del tour fantasmea (iOS descarta
  // la presentación visual en una colisión modal-chain pero el scrim queda
  // montado), onShow NUNCA dispara y, como el scrim NO se descarta al tocar (UX
  // deliberada: solo "Saltar"), el usuario quedaría atrapado sin "Saltar"
  // visible. Si a los ~1.5s de iniciar el tour onShow no disparó, lo descartamos
  // solos. `stopRef` keyea el efecto SOLO en activeTour (no resetea shownRef en
  // cada render aunque `stop` cambie de identidad).
  const shownRef = useRef(false)
  const stopRef = useRef(stop)
  stopRef.current = stop
  useEffect(() => {
    shownRef.current = false
    if (activeTour === null) return
    const handle = setTimeout(() => {
      if (!shownRef.current) {
        stopRef.current(false)
      }
    }, 1500)
    return () => clearTimeout(handle)
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
      // Versión acotada del mismo gesto (ver `HighlightStyle.extendBelow`):
      // también quiere el ancla arriba, porque lo que se resalta es la sección
      // que EMPIEZA ahí. `extendToScrollEnd` manda si están los dos.
      const extendBelow = extendToScrollEnd
        ? 0
        : Math.max(0, config?.highlight?.extendBelow ?? 0)
      const stretchesDown = extendToScrollEnd || extendBelow > 0

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
          const offsetRatio = stretchesDown
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
      // Zona usable de la pantalla — la misma que después decide dónde va el
      // tooltip. Se calcula ACÁ ARRIBA porque el estirado acotado
      // (`extendBelow`) tiene que respetarla: un recuadro que se come el hueco
      // del tooltip lo empuja arriba o lo recorta, que es justo el desorden
      // que se está arreglando.
      const usableTop = insets.top + 8
      const usableBottom = screenH - Math.max(insets.bottom, 8) - TAB_BAR_HEIGHT
      const targetH =
        extendToScrollEnd && svRectForExtend
          ? Math.max(naturalH, svRectForExtend.y + svRectForExtend.height - targetY - 4)
          : resolveHighlightHeight({
              targetY,
              naturalH,
              extendBelow,
              scrollBottom: svRectForExtend
                ? svRectForExtend.y + svRectForExtend.height
                : null,
              usableBottom,
              tooltipReserve: tooltipH + TOOLTIP_GAP,
            })

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
      // La geometría vive en un módulo PURO y testeado
      // (tour-tooltip-placement.ts). Antes se decidía el lado por "qué hueco es
      // más grande" y se anclaba con un alto FIJO de 220pt: con los copys del
      // rediseño —y sobre todo con la escala de texto en «Máxima»— el tooltip
      // terminaba encimado sobre el recuadro que explicaba, o con sus botones
      // detrás de la tab bar. Ahora se decide con el alto REAL medido y contra
      // los insets REALES del device.
      //
      // `usableTop` / `usableBottom` se calculan más arriba (el estirado
      // acotado del recuadro los necesita antes); `TOOLTIP_GAP` y
      // `TAB_BAR_HEIGHT` son constantes de módulo por el mismo motivo.
      const resolved = resolveTooltipPlacement({
        targetY,
        targetH,
        screenH,
        tooltipH,
        usableTop,
        usableBottom,
        gap: TOOLTIP_GAP,
      })
      tooltipPlacement.value = resolved.placement
      setTooltipMaxH(resolved.maxHeight)
      const tooltipTop = resolved.top
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
    tooltipH,
    insets.top,
    insets.bottom,
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
  const pulseColor = stepConfig?.highlight?.pulseColor ?? overlayNeo.green
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
      // Marca que el Modal SÍ se presentó visiblemente. Si fantasmea (colisión
      // modal-chain de iOS) onShow no dispara y el self-heal de arriba descarta
      // el tour a los ~1.5s para que el usuario no quede atrapado.
      onShow={() => {
        shownRef.current = true
      }}
      statusBarTranslucent
      transparent
      visible
    >
      {/* Scrim — bloquea los toques de abajo pero NO descarta el tour al tocar.
          Descartar es EXCLUSIVO del botón "Saltar" del tooltip (o terminar el
          tour) — UX deliberada de acción explícita; tocar en cualquier otro lado
          mantiene el tutorial vigente. (Si el Modal fantasmea y "Saltar" no se
          ve, el self-heal por onShow/timeout descarta el tour solo, sin depender
          del tap.) Un único SVG Path con `fillRule="evenodd"` pinta el scrim y
          resta el cutout redondeado. La opacidad del Animated.View maneja el fade
          y el `scrimOpacity` configurado. */}
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
        <View
          style={[
            styles.tooltipInner,
            // Cuando el copy no entra en ninguno de los dos lados, el tooltip
            // se recorta al hueco y scrollea. Sin esto, con la escala de texto
            // grande el usuario no llegaba nunca a "Siguiente".
            tooltipMaxH != null ? { maxHeight: tooltipMaxH } : null,
          ]}
          pointerEvents="auto"
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height
            // Solo se re-mide cuando el tooltip crece por encima del tope
            // aplicado; si no, el maxHeight y el onLayout se realimentan.
            if (tooltipMaxH == null && Math.abs(h - tooltipH) > 1) setTooltipH(h)
          }}
        >
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
