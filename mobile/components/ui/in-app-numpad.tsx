import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { NumpadGrid } from './numpad-grid'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionDurations, motionEasings, motionSprings } from '@/lib/motion'
import {
  publishNumpadClose,
  publishNumpadHeight,
  publishNumpadOpen,
} from '@/lib/numpad-visibility'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { useThemeTokens } from '@/theme/theme-provider'
import { useModalVisibilityBeacon } from '@/lib/modal-visibility'

interface InAppNumpadProps {
  visible: boolean
  rawValue: string
  onChangeRawValue: (value: string) => void
  onDismiss: () => void
  maxIntegerDigits?: number
  maxDecimalDigits?: number
  doneLabel?: string
  /** Modo código/OTP: sin coma ni decimales, permite cero inicial. */
  integerOnly?: boolean
  /** Render como overlay NO-modal: permite scrollear el contenido detrás. */
  embedded?: boolean
}

const DISMISS_DISTANCE = 100
const DISMISS_VELOCITY = 650

export function InAppNumpad({
  visible,
  rawValue,
  onChangeRawValue,
  onDismiss,
  maxIntegerDigits = 8,
  maxDecimalDigits = 2,
  doneLabel,
  integerOnly = false,
  embedded = false,
}: InAppNumpadProps) {
  const { t } = useTranslation()
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const insets = useSafeAreaInsets()
  const { height: screenHeight } = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const [measuredHeight, setMeasuredHeight] = useState(0)
  // Internal "mounted" state so the close animation can play out
  // before the Modal actually unmounts. Without this, setting
  // `visible=false` on the Modal hides the sheet instantly and the
  // slide-down timing never paints.
  const [mounted, setMounted] = useState(false)
  // Avisa al resto de la app que hay una ventana nativa arriba (el
  // ToastHost la necesita para no quedar tapado). Ver `modal-visibility`.
  useModalVisibilityBeacon(mounted)
  // Unmount-safe: si el numpad se desmonta estando abierto (ej: una navegación
  // que cierra la pantalla mientras está visible), el close se publica desde el
  // callback de la animación que NUNCA corre tras el unmount → el offset global
  // queda inflado y TODAS las pantallas (Home) se sobre-scrollean. Este cleanup
  // libera el offset en el unmount si quedó abierto.
  const mountedRef = useRef(false)
  useEffect(() => {
    mountedRef.current = mounted
  }, [mounted])
  useEffect(
    () => () => {
      if (mountedRef.current) publishNumpadClose()
    },
    [],
  )

  const translateY = useSharedValue(screenHeight)

  // Publish visibility + measured height so bottom-anchored surfaces
  // (ModalCard, sheets) can shift up and avoid being covered. We use
  // the measured height if available, fall back to an estimate while
  // the first layout is pending.
  useEffect(() => {
    if (!visible) return
    const fallback = 320 + insets.bottom
    publishNumpadOpen(measuredHeight > 0 ? measuredHeight : fallback)
    // We DON'T publish the close here on cleanup. If we did, the
    // numpadOffset would drop to 0 the instant `visible` flips
    // false — long before the slide-down animation paints — which
    // shrinks the ScrollView content abruptly and snaps the
    // underlying form to the top, undoing any in-flight scroll
    // restore. The close is published later, from the slide-down
    // animation's callback, so the offset only releases once the
    // sheet is fully gone.
    // measuredHeight intentionally omitted from deps: re-running
    // this effect when the sheet's measured height arrives would
    // call `publishNumpadOpen` a SECOND time, bumping `openCount`
    // to 2. Since we only publish a single close (from the
    // animation callback), the count would never reach 0 and the
    // footer would stay hidden forever. Height updates flow
    // through `publishNumpadHeight` in `handleSheetLayout` which
    // doesn't touch the open counter.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment
  }, [visible, insets.bottom])

  const handleSheetLayout = useCallback((event: LayoutChangeEvent) => {
    const h = event.nativeEvent.layout.height
    setMeasuredHeight(h)
    publishNumpadHeight(h)
  }, [])

  useEffect(() => {
    if (visible) {
      // Mount immediately so the Modal renders before we animate up.
      setMounted(true)
      translateY.value = reduceMotion ? 0 : withSpring(0, motionSprings.sheet)
      return
    }
    // Animate the sheet down and only unmount the Modal once the
    // animation completes. Using `withTiming`'s third-arg callback
    // (running on the UI thread) + `runOnJS` so we can flip React
    // state safely. Symmetric duration so the close feels paced
    // like the open.
    if (reduceMotion) {
      translateY.value = screenHeight
      setMounted(false)
      publishNumpadClose()
      return
    }
    translateY.value = withTiming(
      screenHeight,
      {
        duration: motionDurations.deliberate,
        easing: motionEasings.accelerate,
      },
      (finished) => {
        if (finished) {
          // Both unmount AND release the published numpad offset
          // happen at the END of the slide-down. While the sheet
          // is still on screen, the form below keeps its extended
          // content padding so any auto-scroll restore can play
          // out smoothly without getting clamped by a content
          // size change.
          runOnJS(setMounted)(false)
          runOnJS(publishNumpadClose)()
        }
      },
    )
  }, [visible, reduceMotion, screenHeight, translateY])

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }))

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      'worklet'
      if (event.translationY > 0) {
        translateY.value = event.translationY
      }
    })
    .onEnd((event) => {
      'worklet'
      const shouldDismiss =
        event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY
      if (shouldDismiss) {
        translateY.value = withSpring(screenHeight, {
          ...motionSprings.sheetDismiss,
          velocity: Math.max(event.velocityY, 800),
        })
        runOnJS(onDismiss)()
      } else {
        translateY.value = withSpring(0, motionSprings.sheet)
      }
    })

  const sheet = (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        onLayout={handleSheetLayout}
        style={[
          styles.sheet,
          sheetAnimatedStyle,
          {
            // Carcasa de hoja del rediseño: sólido `neo.sheet`, esquinas
            // superiores en `neoRadii.sheet` y la sombra HACIA ARRIBA que
            // la despega del contenido. Sin hairline: en neo el límite lo
            // da el relieve.
            backgroundColor: neo.sheet,
            boxShadow: neo.shadows.sheet,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <View style={styles.handleArea}>
          <View style={[styles.handle, { backgroundColor: neo.sheetHandle }]} />
        </View>
        <NumpadGrid
          rawValue={rawValue}
          onChangeRawValue={onChangeRawValue}
          // El háptico del "Listo" lo dispara `NeoButton`; duplicarlo acá
          // sonaba como un doble buzz en el mismo frame.
          onDone={onDismiss}
          doneLabel={doneLabel}
          maxIntegerDigits={maxIntegerDigits}
          maxDecimalDigits={maxDecimalDigits}
          integerOnly={integerOnly}
        />
      </Animated.View>
    </GestureDetector>
  )

  // Modo embedded: sin Modal, como overlay absoluto dentro del árbol del screen.
  // `box-none` deja pasar los toques/scroll del área de arriba al contenido de
  // atrás (el ScrollView del screen) → permite scrollear con el numpad abierto.
  // Sin backdrop tap-to-dismiss: se cierra con pan-down o el botón "Listo".
  if (embedded) {
    if (!mounted) return null
    return (
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.embeddedRoot]}>
        {sheet}
      </View>
    )
  }

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <GestureHandlerRootView style={styles.root}>
        {/* Tap-to-dismiss transparente; el sheet subiendo es el cue de foco.
            SIN scrim a propósito: lo que hay detrás es la card del monto que
            se está editando, y taparla dejaría al usuario tecleando a ciegas.
            El handoff toma la misma decisión en `onb-numpad`. */}
        <Pressable
          accessibilityLabel={t('states:numpad.closeLabel')}
          accessibilityRole="button"
          onPress={onDismiss}
          style={StyleSheet.absoluteFill}
        />
        {sheet}
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  // Overlay embedded: absoluteFill (lo pone el caller) + sheet al fondo.
  embeddedRoot: {
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: neoRadii.sheet,
    borderTopRightRadius: neoRadii.sheet,
    paddingTop: 0,
  },
  handleArea: {
    paddingTop: 12,
    paddingBottom: 14,
    alignItems: 'center',
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
  },
})
