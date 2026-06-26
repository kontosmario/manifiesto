import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useReducedMotion,
  runOnJS,
} from 'react-native-reanimated'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppSymbol } from './app-symbol'
import { AppButton } from './button'
import { appendComma, appendDigit, backspace, clearAll } from './in-app-numpad-model'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations, motionEasings, motionSprings } from '@/lib/motion'
import {
  publishNumpadClose,
  publishNumpadHeight,
  publishNumpadOpen,
} from '@/lib/numpad-visibility'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

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

const ROWS: readonly (readonly (string | 'backspace')[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [',', '0', 'backspace'],
]

const DISMISS_DISTANCE = 100
const DISMISS_VELOCITY = 650

export function InAppNumpad({
  visible,
  rawValue,
  onChangeRawValue,
  onDismiss,
  maxIntegerDigits = 8,
  maxDecimalDigits = 2,
  doneLabel = 'Listo',
  integerOnly = false,
  embedded = false,
}: InAppNumpadProps) {
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const { height: screenHeight } = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const [measuredHeight, setMeasuredHeight] = useState(0)
  // Internal "mounted" state so the close animation can play out
  // before the Modal actually unmounts. Without this, setting
  // `visible=false` on the Modal hides the sheet instantly and the
  // slide-down timing never paints.
  const [mounted, setMounted] = useState(false)
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

  const handleDigit = useCallback(
    (digit: string) => {
      void triggerHaptic('selection')
      if (integerOnly) {
        // Código/OTP: append simple, sin coma ni decimales, y SÍ permite el
        // cero inicial (un código puede empezar con 0, a diferencia de un monto
        // donde `appendDigit` lo descarta).
        onChangeRawValue(
          rawValue.length >= maxIntegerDigits ? rawValue : rawValue + digit,
        )
        return
      }
      onChangeRawValue(
        appendDigit(rawValue, digit, { maxIntegerDigits, maxDecimalDigits }),
      )
    },
    [integerOnly, onChangeRawValue, rawValue, maxIntegerDigits, maxDecimalDigits],
  )

  const handleComma = useCallback(() => {
    void triggerHaptic('selection')
    onChangeRawValue(appendComma(rawValue))
  }, [onChangeRawValue, rawValue])

  const handleBackspace = useCallback(() => {
    void triggerHaptic('light')
    onChangeRawValue(backspace(rawValue))
  }, [onChangeRawValue, rawValue])

  const handleClearAll = useCallback(() => {
    void triggerHaptic('warning')
    onChangeRawValue(clearAll())
  }, [onChangeRawValue])

  const handleDone = useCallback(() => {
    void triggerHaptic('selection')
    onDismiss()
  }, [onDismiss])

  const handleKeyPress = useCallback(
    (key: string | 'backspace') => {
      if (key === 'backspace') {
        handleBackspace()
        return
      }
      if (key === ',') {
        handleComma()
        return
      }
      handleDigit(key)
    },
    [handleBackspace, handleComma, handleDigit],
  )

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
                backgroundColor: theme.colors.surface,
                paddingBottom: insets.bottom + 16,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.handleArea}>
              <View style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]} />
            </View>
            <View style={styles.content}>
              <AppButton variant="primary" label={doneLabel} onPress={handleDone} />
              <View style={styles.grid}>
                {ROWS.map((row, rowIndex) => (
                  <View key={rowIndex} style={styles.row}>
                    {row.map((key) => {
                      // En modo código no hay coma: dejamos el slot vacío para
                      // mantener la grilla de 3 columnas alineada.
                      if (key === ',' && integerOnly) {
                        return <View key={key} style={styles.keyWrap} />
                      }
                      return (
                      <NumpadKey
                        key={key}
                        label={key === 'backspace' ? undefined : key}
                        icon={key === 'backspace' ? 'delete.backward.fill' : undefined}
                        iconFallback={key === 'backspace' ? 'backspace' : undefined}
                        accessibilityLabel={
                          key === 'backspace'
                            ? 'Borrar último dígito'
                            : key === ','
                              ? 'Coma'
                              : key
                        }
                        accessibilityHint={
                          key === 'backspace'
                            ? 'Mantén presionado para limpiar todo'
                            : undefined
                        }
                        onPress={() => handleKeyPress(key)}
                        onLongPress={key === 'backspace' ? handleClearAll : undefined}
                      />
                      )
                    })}
                  </View>
                ))}
              </View>
            </View>
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
        {/* Tap-to-dismiss transparente; el sheet subiendo es el cue de foco. */}
        <Pressable
          accessibilityLabel="Cerrar numpad"
          accessibilityRole="button"
          onPress={onDismiss}
          style={StyleSheet.absoluteFill}
        />
        {sheet}
      </GestureHandlerRootView>
    </Modal>
  )
}

interface NumpadKeyProps {
  label?: string
  icon?: string
  iconFallback?: string
  onPress: () => void
  onLongPress?: () => void
  accessibilityLabel?: string
  accessibilityHint?: string
}

function NumpadKey({
  label,
  icon,
  iconFallback,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
}: NumpadKeyProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : scale.value }],
  }))

  return (
    <Animated.View style={[styles.keyWrap, animatedStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label ?? ''}
        accessibilityHint={accessibilityHint}
        onPressIn={() => {
          if (reduceMotion) return
           
          scale.value = withSpring(0.92, motionSprings.press)
        }}
        onPressOut={() => {
           
          scale.value = withSpring(1, motionSprings.press)
        }}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={450}
        style={({ pressed }) => [
          styles.key,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        {label ? (
          <Text style={[typography.titleMedium, styles.keyLabel, { color: theme.colors.text }]}>
            {label}
          </Text>
        ) : icon ? (
          <AppSymbol
            name={icon}
            fallback={(iconFallback ?? 'backspace') as never}
            size={22}
            color={theme.colors.textMuted}
          />
        ) : null}
      </Pressable>
    </Animated.View>
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
  content: {
    paddingHorizontal: 16,
    gap: 12,
  },
  grid: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  keyWrap: {
    flex: 1,
  },
  key: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingVertical: 18,
    minHeight: 56,
  },
  keyLabel: {
    fontSize: 24,
  },
})
