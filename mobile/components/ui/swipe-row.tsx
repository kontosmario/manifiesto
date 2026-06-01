import { useCallback, type ComponentProps, type ReactNode } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
} from 'react-native'
import {
  Gesture,
  GestureDetector,
  RectButton,
} from 'react-native-gesture-handler'
import Animated, {
  cancelAnimation,
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useThemeTokens } from '@/theme/theme-provider'
import { typography } from '@/theme/typography'
import { triggerHaptic, type AppHapticTone } from '@/lib/haptics'

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name']

export interface SwipeAction {
  label: string
  tone?: 'neutral' | 'danger'
  /** MaterialIcons name. Recomendado: 'delete' destructive, 'done'
   *  neutral check, 'edit', 'visibility'/'visibility-off'. */
  icon?: MaterialIconName
  onPress: () => void
}

interface SwipeRowProps {
  children: ReactNode
  rightActions?: SwipeAction[]
  leftActions?: SwipeAction[]
  /** Composed label for VoiceOver/TalkBack rotor. */
  accessibilityLabel?: string
  accessibilityHint: string
  /** Acciones expuestas al lector de pantalla (no pueden swipear). */
  accessibilityActions?: ReadonlyArray<{ name: string; label?: string }>
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void
  /** Háptico cuando la card se abre (default 'selection'). */
  onSwipeOpenHaptic?: AppHapticTone
  /** Radius del clip exterior. Default 14. Las surfaces con card chrome
   *  propio (ej. FijoRow 16) lo overriden para que el clip matchee. */
  borderRadius?: number
  /** Disable swipe + dim del contenido mientras una mutation viaja. */
  isProcessing?: boolean
  /** Copy del chip "Procesando…" sobreimpreso. */
  processingLabel?: string
  /** Ancho fijo por botón de acción. Default 96 — cómodo para tap +
   *  alcanza para 1 ícono + 1 palabra ('Eliminar', 'Listo'). */
  actionWidth?: number
}

// Spring único para abrir y cerrar — symmetric en gestos interactivos
// hace que el back-and-forth se sienta como UN solo gesto fluido (vs.
// asymmetric, que es para mount/unmount donde queremos exit-faster-than
// -enter). Tuning emil-style: damping alto evita bounce en el landing
// (cierra "resuelto", no rebota); mass moderada da peso natural;
// stiffness 200 es buttery (ni snap-y ni laggy).
const SPRING_SETTLE = { damping: 22, stiffness: 200, mass: 0.85 } as const
// Velocidad de flick que dispara open/close aunque no llegues al
// threshold de posición.
const FLICK_VELOCITY_PX_S = 600

/**
 * Row con acciones laterales reveladas por swipe. Reemplazo limpio del
 * SwipeableRow viejo (basado en ReanimatedSwipeable de gesture-handler).
 *
 * Diseño:
 *   - El row content vive dentro de un `GestureDetector` con `Gesture.Pan`
 *     y se traslada con `translateX` (Reanimated v3, worklet en UI thread).
 *   - Los paneles de acciones están posicionados absolutos en los bordes
 *     del outer container; en idle quedan TRASLADADOS fuera del clip
 *     (off-screen) — NO viven detrás del row. Por eso un scale-on-press
 *     del card hijo NO los expone como halo.
 *   - Cuando el row se desliza, los paneles se trasladan en sync usando
 *     un `useAnimatedStyle` que lee el mismo `translateX`. Entran desde
 *     off-screen y terminan exactamente en el borde del outer container,
 *     llenando las esquinas redondeadas sin huecos.
 *   - Las acciones cierran el row antes de disparar su `onPress` (UX:
 *     siempre se ve la transición de close).
 *   - El gesto tiene `activeOffsetX([-10, 10])` y `failOffsetY([-15, 15])`
 *     para no robarle taps al child ni scrolls verticales del padre.
 *
 * Aplicado en: Home actividad, Gastos · Movimientos, Fijos, Notificaciones.
 */
export function SwipeRow({
  children,
  rightActions = [],
  leftActions = [],
  accessibilityLabel,
  accessibilityHint,
  accessibilityActions,
  onAccessibilityAction,
  onSwipeOpenHaptic = 'selection',
  borderRadius = 14,
  isProcessing = false,
  processingLabel = 'Procesando…',
  actionWidth = 96,
}: SwipeRowProps) {
  const theme = useThemeTokens()
  const translateX = useSharedValue(0)
  // Posición de translateX cuando arranca el gesto. Sin esto, un segundo
  // pan desde el row ya abierto saltaba a translateX = event.translationX
  // (que arranca en 0), provocando un jump visual de -96 a -5.
  const startX = useSharedValue(0)
  // Offset del finger al ACTIVARSE el gesto. event.translationX se mide
  // desde que el finger toca la pantalla, no desde la activación (que
  // pasa el threshold de 10px). Restando este offset evitamos el jump
  // de 10px al cruzar el threshold de activación.
  const startTranslation = useSharedValue(0)
  // Tracking del estado para haptic inteligente: solo dispara cuando
  // realmente abrimos (transición cerrado → abierto), no cada vez que
  // termina un gesto sobre un row ya abierto.
  const wasOpen = useSharedValue(false)

  const rightWidth = rightActions.length * actionWidth
  const leftWidth = leftActions.length * actionWidth

  const fireOpenHaptic = useCallback(() => {
    void triggerHaptic(onSwipeOpenHaptic)
  }, [onSwipeOpenHaptic])

  const closeRow = useCallback(() => {
    cancelAnimation(translateX)
    translateX.value = withSpring(0, SPRING_SETTLE)
  }, [translateX])

  const handleActionPress = useCallback(
    (action: SwipeAction) => {
      closeRow()
      action.onPress()
    },
    [closeRow],
  )

  const pan = Gesture.Pan()
    .enabled(!isProcessing)
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onBegin(() => {
      'worklet'
      // Interrumpimos cualquier spring en flight para que el gesto sea
      // interrumpible (emil: "animations must be interruptible; user
      // tap/gesture cancels in-progress animation immediately").
      cancelAnimation(translateX)
    })
    .onStart((event) => {
      'worklet'
      // Capturamos posición actual + offset del finger AL ACTIVARSE el
      // gesto, así el row continúa desde donde estaba sin saltos.
      startX.value = translateX.value
      startTranslation.value = event.translationX
      wasOpen.value = Math.abs(translateX.value) > 1
    })
    .onUpdate((event) => {
      'worklet'
      // Delta desde la activación, no desde el touch.
      const delta = event.translationX - startTranslation.value
      const next = startX.value + delta
      // Clamp al rango disponible según las acciones definidas.
      const minX = rightActions.length > 0 ? -rightWidth : 0
      const maxX = leftActions.length > 0 ? leftWidth : 0
      translateX.value = Math.max(minX, Math.min(maxX, next))
    })
    .onEnd((event) => {
      'worklet'
      const dx = translateX.value
      const vx = event.velocityX

      // Decisión del target en dos pasadas:
      // 1) Flick fuerte → respeta la intención de la dirección del finger
      //    (cerrá aunque estés más del 50% abierto si flickás cerrando).
      // 2) Sin flick → snap-to-nearest extremo (intuitivo, Apple-style).
      let target = 0
      if (Math.abs(vx) > FLICK_VELOCITY_PX_S) {
        if (vx < 0 && rightActions.length > 0) target = -rightWidth
        else if (vx > 0 && leftActions.length > 0) target = leftWidth
        // else: cerrá (target = 0)
      } else {
        if (rightActions.length > 0 && dx < -rightWidth / 2) target = -rightWidth
        else if (leftActions.length > 0 && dx > leftWidth / 2) target = leftWidth
      }

      // Preservamos la velocidad del finger al soltar (Apple-style):
      // el spring continúa la velocidad del gesto en vez de arrancar
      // desde 0, así el snap se siente como una sola línea fluida y
      // no como dos animaciones desconectadas (drag + spring).
      translateX.value = withSpring(target, { ...SPRING_SETTLE, velocity: vx })

      // Haptic SOLO en transición cerrado → abierto, no cuando un row
      // abierto sigue abierto.
      const willBeOpen = target !== 0
      if (willBeOpen && !wasOpen.value) {
        runOnJS(fireOpenHaptic)()
      }
    })

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))

  // Right panel: posicionado en right: 0, width = rightWidth.
  // En idle (translateX = 0), shifted derecha por rightWidth → off-screen.
  // Cuando translateX = -rightWidth, shifted = 0 → visible en el borde.
  const rightPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: rightWidth + translateX.value }],
  }))

  // Left panel: posicionado en left: 0, width = leftWidth.
  // En idle, shifted izquierda por leftWidth → off-screen.
  // Cuando translateX = leftWidth, shifted = 0 → visible en el borde.
  const leftPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -leftWidth + translateX.value }],
  }))

  return (
    <View
      accessible
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityActions={
        accessibilityActions as readonly { name: string; label?: string }[] | undefined
      }
      onAccessibilityAction={onAccessibilityAction}
      style={{
        borderRadius,
        overflow: 'hidden',
      }}
    >
      {/* RIGHT actions panel — off-screen en idle, slides in al swipear. */}
      {rightActions.length > 0 ? (
        <Animated.View
          style={[
            styles.actionsAbsoluteRight,
            { width: rightWidth },
            rightPanelStyle,
          ]}
        >
          {rightActions.map((action, i) => (
            <SwipeActionButton
              key={`r-${action.label}-${i}`}
              action={action}
              width={actionWidth}
              onPress={() => handleActionPress(action)}
            />
          ))}
        </Animated.View>
      ) : null}

      {/* LEFT actions panel — off-screen en idle, slides in al swipear. */}
      {leftActions.length > 0 ? (
        <Animated.View
          style={[
            styles.actionsAbsoluteLeft,
            { width: leftWidth },
            leftPanelStyle,
          ]}
        >
          {leftActions.map((action, i) => (
            <SwipeActionButton
              key={`l-${action.label}-${i}`}
              action={action}
              width={actionWidth}
              onPress={() => handleActionPress(action)}
            />
          ))}
        </Animated.View>
      ) : null}

      {/* Row content — translateX driven por el gesto. */}
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>
          <View
            pointerEvents={isProcessing ? 'none' : 'auto'}
            style={{ opacity: isProcessing ? 0.55 : 1 }}
          >
            {children}
          </View>
        </Animated.View>
      </GestureDetector>

      {isProcessing ? (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(140)}
          style={[
            styles.processingChip,
            {
              backgroundColor: theme.colors.creamCard,
              borderColor: theme.colors.line,
            },
          ]}
          pointerEvents="none"
        >
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text
            style={[
              styles.processingLabel,
              typography.buttonCompact,
              { color: theme.colors.text },
            ]}
          >
            {processingLabel}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  )
}

interface SwipeActionButtonProps {
  action: SwipeAction
  width: number
  onPress: () => void
}

function SwipeActionButton({ action, width, onPress }: SwipeActionButtonProps) {
  const theme = useThemeTokens()
  const isDanger = action.tone === 'danger'
  const background = isDanger ? theme.colors.danger : theme.colors.primary
  const foreground = isDanger
    ? '#FFFFFF'
    : theme.isDark
      ? theme.brand.deep
      : '#FFFFFF'

  return (
    <RectButton
      onPress={() => {
        void triggerHaptic(isDanger ? 'warning' : 'selection')
        onPress()
      }}
      style={[styles.actionButton, { width, backgroundColor: background }]}
    >
      {action.icon ? (
        <MaterialIcons
          name={action.icon}
          size={22}
          color={foreground}
          style={styles.actionIcon}
        />
      ) : null}
      <Text
        style={[
          typography.buttonCompact,
          styles.actionLabel,
          { color: foreground },
        ]}
      >
        {action.label}
      </Text>
    </RectButton>
  )
}

const styles = StyleSheet.create({
  actionsAbsoluteRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  actionsAbsoluteLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row-reverse',
  },
  actionButton: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
    height: '100%',
  },
  actionIcon: {
    marginBottom: 2,
  },
  actionLabel: {
    textAlign: 'center',
  },
  processingChip: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  processingLabel: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
})
