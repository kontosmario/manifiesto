import { useCallback, useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
} from 'react-native'
import { useTranslation } from 'react-i18next'
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
  type SharedValue,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useThemeTokens } from '@/theme/theme-provider'
import { typography } from '@/theme/typography'
import { triggerHaptic, type AppHapticTone } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion'

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
  processingLabel,
  actionWidth = 96,
}: SwipeRowProps) {
  // PERF · NI `useTranslation()` NI `useThemeTokens()` viven acá.
  //
  // Este componente se monta ~70 veces a la vez (feed de Gastos). `useTranslation()`
  // sin opciones recibe un objeto de opciones NUEVO por render, así que su
  // `useSyncExternalStore` interno RE-SUSCRIBE (off + on en el emitter de i18n)
  // en cada render de cada fila — ~140 operaciones de listener por commit de la
  // lista, para un string que solo se dibuja mientras una mutación viaja. Ambos
  // hooks se movieron a `<ProcessingChip/>`, que monta SOLO con `isProcessing`.
  const translateX = useSharedValue(0)
  // Ancla del gesto en UN solo shared value (FIX perf — menos costo por fila
  // montada, ver el bloque del GestureDetector). `startAdjust = posición
  // pre-gesto − translation del finger al activarse`; onUpdate reconstruye la
  // posición absoluta como `startAdjust + event.translationX`. Es EXACTAMENTE
  // el mismo cálculo que llevaban dos SVs separados —
  //   startAdjust + tx  =  (startX − startTranslation) + tx
  //                     =  startX + (tx − startTranslation)
  // — donde startX era la posición pre-gesto y startTranslation el offset del
  // finger al activarse. Un SV menos por fila (de 4 a 3), sin cambiar el gesto.
  // Sigue resolviendo los dos jumps que motivaron los SVs originales:
  //   (a) un 2º pan desde el row YA ABIERTO continúa desde su posición (antes,
  //       sin startX, saltaba a translateX = translationX que arranca en 0 →
  //       jump visual de −96 a −5), y
  //   (b) el salto de ~10px al cruzar el threshold de activación — event.
  //       translationX se mide desde el touch-down, no desde la activación, y
  //       restarlo en el ancla lo cancela.
  const startAdjust = useSharedValue(0)
  // Tracking del estado para haptic inteligente: solo dispara cuando
  // realmente abrimos (transición cerrado → abierto), no cada vez que
  // termina un gesto sobre un row ya abierto.
  const wasOpen = useSharedValue(false)

  const rightWidth = rightActions.length * actionWidth
  const leftWidth = leftActions.length * actionWidth
  const rightCount = rightActions.length
  const leftCount = leftActions.length

  // PANELES DE ACCIÓN DIFERIDOS AL TOUCH-DOWN (perf).
  //
  // En idle los paneles están off-screen: nadie los ve, pero cada uno monta un
  // `RectButton` (recognizer NATIVO de RNGH) + un glifo de icon-font. Con ~70
  // filas montadas eso es ~70 recognizers y ~70 glifos que jamás se dibujan.
  //
  // Se arman desde `.onBegin()`, que RNGH dispara en el TOUCH-DOWN — varios
  // frames antes de que el pan se active (activeOffsetX ±10px). Para cuando el
  // row se puede haber movido un pixel, el panel ya está montado.
  //
  // Esto NO es el mismo caso que el GestureDetector (ver la nota larga abajo de
  // por qué ESE no puede ser lazy): el panel no NEGOCIA el toque, solo se
  // dibuja. Y una vez armado se queda armado — no hay churn de mount/unmount
  // por gesto.
  const [actionsArmed, setActionsArmed] = useState(false)
  const armActions = useCallback(() => {
    setActionsArmed((armed) => (armed ? armed : true))
  }, [])

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

  // PERF · el gesto se construye UNA vez por combinación de props, no por
  // render. `Gesture.Pan()` devuelve un objeto NUEVO cada vez, y `GestureDetector`
  // compara por identidad: con un literal nuevo por render cruzaba a nativo un
  // `updateGestureHandler` en CADA commit de la lista — ~70 actualizaciones de
  // recognizer por commit cuando la memo de la fila estaba derrotada.
  //
  // Las deps que MUEVEN la aguja son las primitivas de props (`isProcessing`,
  // los counts y los anchos): son las únicas que cambian de verdad. Los shared
  // values y los callbacks van en la lista para satisfacer al linter, pero ya
  // son ref-estables por construcción → no reconstruyen el gesto.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!isProcessing)
        .activeOffsetX([-10, 10])
        .failOffsetY([-15, 15])
        .onBegin(() => {
          'worklet'
          // Interrumpimos cualquier spring en flight para que el gesto sea
          // interrumpible (emil: "animations must be interruptible; user
          // tap/gesture cancels in-progress animation immediately").
          cancelAnimation(translateX)
          // Touch-down → montar los paneles de acción (ver `actionsArmed`).
          runOnJS(armActions)()
        })
        .onStart((event) => {
          'worklet'
          // Ancla combinada = posición pre-gesto − translation del finger al
          // activarse. Con esto el row continúa desde donde estaba (2º pan sobre
          // un row abierto) y sin el salto del threshold de activación, con un
          // solo SV.
          startAdjust.value = translateX.value - event.translationX
          wasOpen.value = Math.abs(translateX.value) > 1
        })
        .onUpdate((event) => {
          'worklet'
          // Posición absoluta = ancla combinada + translation actual del finger.
          // Equivale a startX + (translationX − startTranslation) del cálculo
          // previo.
          const next = startAdjust.value + event.translationX
          // Clamp al rango disponible según las acciones definidas.
          const minX = rightCount > 0 ? -rightWidth : 0
          const maxX = leftCount > 0 ? leftWidth : 0
          translateX.value = Math.max(minX, Math.min(maxX, next))
        })
        .onEnd((event) => {
          'worklet'
          const dx = translateX.value
          const vx = event.velocityX

          // Decisión del target en dos pasadas:
          // 1) Flick fuerte → respeta la intención de la dirección del finger
          //    (cierra aunque estés más del 50% abierto si flickás cerrando).
          // 2) Sin flick → snap-to-nearest extremo (intuitivo, Apple-style).
          let target = 0
          if (Math.abs(vx) > FLICK_VELOCITY_PX_S) {
            if (vx < 0 && rightCount > 0) target = -rightWidth
            else if (vx > 0 && leftCount > 0) target = leftWidth
            // else: cierra (target = 0)
          } else {
            if (rightCount > 0 && dx < -rightWidth / 2) target = -rightWidth
            else if (leftCount > 0 && dx > leftWidth / 2) target = leftWidth
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
        }),
    [
      isProcessing,
      rightCount,
      leftCount,
      rightWidth,
      leftWidth,
      translateX,
      startAdjust,
      wasOpen,
      fireOpenHaptic,
      armActions,
    ],
  )

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
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
      {/* RIGHT / LEFT action panels — off-screen en idle, slides in al swipear.
          Dos gates, por dos razones distintas:
          · `rightCount/leftCount > 0` (FIX C): cada panel vive en su propio
            componente para que su `useAnimatedStyle` se instancie SOLO cuando
            ese lado tiene acciones. Antes el hook de AMBOS lados se creaba en
            toda fila aunque el lado no se dibujara — con ~70 filas montadas era
            costo muerto (ningún consumidor usa `leftActions`).
          · `actionsArmed` (FIX E): además, hasta el primer touch-down NO se
            monta NADA — ver el bloque de `actionsArmed` arriba. El
            GestureDetector/Pan y los shared values sí se mantienen siempre
            (diferir el gesto perdería el primer swipe, ver abajo).
          Transparente: mismos Animated.View, estilos, anchos, keys y wiring. */}
      {actionsArmed && rightCount > 0 ? (
        <SwipeActionsPanel
          side="right"
          actions={rightActions}
          actionWidth={actionWidth}
          translateX={translateX}
          onActionPress={handleActionPress}
        />
      ) : null}

      {actionsArmed && leftCount > 0 ? (
        <SwipeActionsPanel
          side="left"
          actions={leftActions}
          actionWidth={actionWidth}
          translateX={translateX}
          onActionPress={handleActionPress}
        />
      ) : null}

      {/* Row content — translateX driven por el gesto.
          FIX C (perf) — por qué el GestureDetector NO es lazy-mount: se evaluó
          diferir la creación del gesto/animated styles hasta el primer touch-in
          (montar solo un Pressable liviano y recién ahí montar el Pan real). Se
          DESCARTÓ: RNGH registra el recognizer nativo al montar la vista; un
          recognizer montado a mitad del touch NO captura el toque en vuelo (el
          responder ya lo tomó y iOS/Android no lo re-negocian) → el PRIMER swipe
          se pierde (hay que levantar el dedo y volver a swipear). Eso rompe la
          transparencia que exige el approach (mismo primer swipe en TODOS los
          consumidores: gastos vieja/neo, actividad, fijos, notifs). Lo que SÍ se
          recortó, sin tocar el gesto ni la UX: un useSharedValue menos por fila
          (startX+startTranslation → startAdjust) y la extracción de los paneles
          de acción a su propio componente (su useAnimatedStyle solo se instancia
          cuando el lado tiene acciones, ver arriba). */}
      {/* FIX D (perf) · el dim de "procesando" ya NO tiene su propio View. La
          opacidad y el `pointerEvents` conviven sin problema con el transform
          del gesto en el MISMO nodo → un nodo nativo menos por fila (~70 en el
          feed de Gastos). Visualmente es idéntico: la opacidad se aplicaba al
          contenedor directo de `children` y sigue aplicándose al contenedor
          directo de `children`. */}
      <GestureDetector gesture={pan}>
        <Animated.View
          pointerEvents={isProcessing ? 'none' : 'auto'}
          style={[rowStyle, isProcessing ? styles.processingDim : null]}
        >
          {children}
        </Animated.View>
      </GestureDetector>

      {isProcessing ? <ProcessingChip label={processingLabel} /> : null}
    </View>
  )
}

/**
 * Chip "Procesando…" sobreimpreso mientras una mutación viaja.
 *
 * Vive en su PROPIO componente (perf): es el único consumidor de
 * `useTranslation()` y `useThemeTokens()` de todo el SwipeRow, y solo se monta
 * con `isProcessing` — o sea, como mucho 1 vez a la vez. Tenerlos en el cuerpo
 * de `SwipeRow` los cobraba en las ~70 filas montadas del feed, con el agravante
 * de que `useTranslation()` re-suscribe su listener de i18n en cada render.
 */
function ProcessingChip({ label }: { label?: string }) {
  const { t } = useTranslation()
  const theme = useThemeTokens()
  return (
    <Animated.View
      entering={FadeIn.duration(motionDurations.quick)}
      exiting={FadeOut.duration(motionDurations.micro)}
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
        style={[styles.processingLabel, typography.buttonCompact, { color: theme.colors.text }]}
      >
        {label ?? t('states:swipeRow.processing')}
      </Text>
    </Animated.View>
  )
}

interface SwipeActionsPanelProps {
  side: 'left' | 'right'
  actions: SwipeAction[]
  actionWidth: number
  translateX: SharedValue<number>
  onActionPress: (action: SwipeAction) => void
}

/**
 * Panel de acciones de UN lado. Extraído de `SwipeRow` (FIX C perf): al vivir en
 * su propio componente, su `useAnimatedStyle` se instancia SOLO cuando el lado
 * tiene acciones y se renderiza — evita crear el mapper del panel ausente en cada
 * una de las ~60-70 filas montadas (ningún consumidor usa `leftActions`, así que
 * ese hook era 100% muerto). El transform es idéntico al original:
 *   - right: posicionado en right:0; en idle shifted +width (off-screen), y
 *     shifted=0 cuando translateX = -width (visible pegado al borde).
 *   - left: posicionado en left:0; en idle shifted -width, shifted=0 cuando
 *     translateX = +width.
 * `translateX` es el mismo SharedValue del gesto (ref estable) → el panel sigue
 * al row en el UI thread exactamente como antes.
 */
function SwipeActionsPanel({
  side,
  actions,
  actionWidth,
  translateX,
  onActionPress,
}: SwipeActionsPanelProps) {
  const width = actions.length * actionWidth
  const panelStyle = useAnimatedStyle(() => {
    const base = side === 'right' ? width : -width
    return { transform: [{ translateX: base + translateX.value }] }
  })
  return (
    <Animated.View
      style={[
        side === 'right' ? styles.actionsAbsoluteRight : styles.actionsAbsoluteLeft,
        { width },
        panelStyle,
      ]}
    >
      {actions.map((action, i) => (
        <SwipeActionButton
          key={`${side[0]}-${action.label}-${i}`}
          action={action}
          width={actionWidth}
          onPress={() => onActionPress(action)}
        />
      ))}
    </Animated.View>
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
  // fg legible sobre el fill brillante, por-modo (cream/ink) — danger y
  // non-danger usan fills theme-paired (danger / primary), así que el mismo
  // token sirve. Antes: blanco sobre danger dark = 2.92, brand.deep sobre
  // primary mint = 2.89.
  const foreground = theme.colors.textOnPrimary

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
  // Dim del contenido mientras la mutación viaja. Vive en el mismo nodo que el
  // transform del gesto (ver FIX D arriba).
  processingDim: { opacity: 0.55 },
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
