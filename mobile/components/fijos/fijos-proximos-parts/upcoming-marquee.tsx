import { useCallback, useEffect, useMemo } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated'
import type { FijoItem } from '@/features/fijos/fijos-aggregates.model'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'
import { MarqueeTicket, TICKET_GAP, TICKET_WIDTH } from './marquee-ticket'

/**
 * Marquee horizontal de upcoming — iOS look-and-feel + gesture-aware.
 *
 * Animación CONTINUA (no withRepeat reset):
 *   · useFrameCallback corre cada frame en UI thread (~16ms a 60fps).
 *   · Avanza un shared value `elapsed` por dt*SPEED/1000 pixeles,
 *     APLICANDO MODULO dentro del callback para prevenir drift de
 *     float después de muchas horas de runtime.
 *   · translateX = -elapsed.value — sin operación extra en el style.
 *
 * Gesture (Gesture.Pan):
 *   · onBegin: captura elapsed actual, pausa el frame loop.
 *   · onUpdate: elapsed = startElapsed - translationX (drag right →
 *     marquee va right; drag left → marquee sigue izquierda).
 *     Modulo aplicado para que el wrap funcione durante el drag.
 *   · onEnd: re-activa el frame loop — la animación CONTINÚA desde
 *     la posición exacta donde el user soltó. Sin saltos.
 *
 * activeOffsetX([-10,10]): la pan solo se activa con drag horizontal
 * neto >10pt — evita interferir con scroll vertical de la screen
 * (mismo patrón que SwipeRow).
 *
 * ReduceMotion-aware: fallback a ScrollView nativo manual.
 *
 * CR v2 GUARD CRÍTICO: el `setActive(true)` en onEnd/onFinalize
 * requiere `setWidth > 0` — sino la animación divide por 0 → NaN en
 * los siguientes frames. Preservar este guard.
 */
export function UpcomingMarquee({
  items,
  categoriesById,
}: {
  items: FijoItem[]
  categoriesById?: Map<string, { id: string; name: string; color: string }>
}) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const elapsed = useSharedValue(0)
  // Snapshot del elapsed al inicio del drag — para offsetar correcto.
  const dragStart = useSharedValue(0)

  const setWidth = items.length * (TICKET_WIDTH + TICKET_GAP)
  const SPEED_PX_PER_SEC = 35

  const frame = useFrameCallback((info) => {
    'worklet'
    const dt = info.timeSincePreviousFrame ?? 16
    // Wrap dentro del callback para evitar float drift en runtime largo.
    const next = elapsed.value + (dt * SPEED_PX_PER_SEC) / 1000
    elapsed.value = setWidth > 0 ? next % setWidth : 0
  }, false)

  // Wrapper JS-callable para `frame.setActive` — el gesture worklet
  // lo invoca via runOnJS para pausar/reanudar el loop según drag.
  const setFrameActive = useCallback(
    (active: boolean) => {
      frame.setActive(active)
    },
    [frame],
  )

  useEffect(() => {
    const active = !reduced && setWidth > 0 && items.length > 0
    frame.setActive(active)
    if (!active) elapsed.value = 0
  }, [reduced, setWidth, items.length, frame, elapsed])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -elapsed.value }],
  }))

  // Pan gesture — user puede arrastrar lateral, al soltar la
  // animación continúa desde la nueva posición.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10]) // solo activa con drag horizontal neto
        .onBegin(() => {
          'worklet'
          dragStart.value = elapsed.value
          runOnJS(setFrameActive)(false)
        })
        .onUpdate((e) => {
          'worklet'
          // Drag right (+translationX) → marquee va right → reducir elapsed
          const raw = dragStart.value - e.translationX
          // Wrap defensivo para que items duplicados estén siempre alineados.
          if (setWidth > 0) {
            // Modulo positivo (JS % puede dar negativo)
            elapsed.value = ((raw % setWidth) + setWidth) % setWidth
          } else {
            elapsed.value = raw
          }
        })
        .onEnd(() => {
          'worklet'
          // Re-activa el loop — la animación continúa desde
          // `elapsed.value` actual (NO desde 0). Sin salto. Guard
          // setWidth > 0 evita re-activar el frame loop antes de que
          // onLayout corra (sino la animación divide por 0 → NaN en
          // los siguientes frames). Code review UI-H3.
          if (!reduced && setWidth > 0) runOnJS(setFrameActive)(true)
        })
        .onFinalize(() => {
          'worklet'
          // Fallback: por si el gesture es cancelado sin onEnd. Mismo
          // guard que onEnd para evitar NaN en el loop.
          if (!reduced && setWidth > 0) runOnJS(setFrameActive)(true)
        }),
    [dragStart, elapsed, setWidth, reduced, setFrameActive],
  )

  if (reduced) {
    return (
      <View style={styles.marqueeContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.marqueeStaticRow}
        >
          {items.map((item) => (
            <MarqueeTicket
              key={item.id}
              item={item}
              category={
                item.category_id ? categoriesById?.get(item.category_id) : undefined
              }
              theme={theme}
            />
          ))}
        </ScrollView>
      </View>
    )
  }

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.marqueeContainer}>
        <Animated.View style={[styles.marqueeRow, animStyle]}>
          {items.map((item) => (
            <MarqueeTicket
              key={`a-${item.id}`}
              item={item}
              category={
                item.category_id ? categoriesById?.get(item.category_id) : undefined
              }
              theme={theme}
            />
          ))}
          {items.map((item) => (
            <MarqueeTicket
              key={`b-${item.id}`}
              item={item}
              category={
                item.category_id ? categoriesById?.get(item.category_id) : undefined
              }
              theme={theme}
            />
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  // ── Marquee premium ─────────────────────────────────────────────
  // Container con overflow hidden para clipear items que salen por los
  // bordes. marginHorizontal:-14 hace que el marquee toque los bordes
  // del card (cancela el padding del card), el paddingHorizontal:14
  // del row restaura el espacio para que items entren alineados.
  marqueeContainer: {
    marginTop: 4,
    marginHorizontal: -14, // matchea el paddingHorizontal del card (14)
    overflow: 'hidden',
    position: 'relative',
  },
  marqueeRow: {
    flexDirection: 'row',
    gap: 8, // matchea TICKET_GAP (crítico para el loop seamless)
    paddingHorizontal: 14,
    alignItems: 'stretch',
  },
  marqueeStaticRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    alignItems: 'stretch',
  },
})
