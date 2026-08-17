import { type ReactNode, useEffect, useState } from 'react'
import {
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionDurations } from '@/lib/motion'

interface CollapsingRevealProps {
  /** Mientras true, el contenido se muestra. Al pasar a false, el contenido
   *  COLAPSA (altura → 0 + fade) y recién después se desmonta. */
  visible: boolean
  /**
   * Espera antes de arrancar el colapso cuando `visible` pasa a false. Sirve
   * cuando un sheet/modal que TAPA la pantalla está cerrándose: si la card se
   * desmontara de inmediato, el colapso correría OCULTO detrás del sheet y el
   * usuario vería la card "desaparecer de golpe" al revelarse el fondo. Con un
   * delay ~= la duración de cierre del sheet, el colapso se ve sobre el Home ya
   * visible. Default 0.
   */
  hideDelayMs?: number
  children: ReactNode
  style?: StyleProp<ViewStyle>
}

/**
 * Envuelve contenido que aparece/desaparece por condición y le da una salida
 * SUAVE: en vez de un unmount seco (el padre lo saca del árbol y el contenido
 * de abajo salta para cerrar el hueco), colapsa su propia altura a 0 con un
 * fade → el layout normal hace que lo de abajo se deslice hacia arriba sin
 * salto. La altura natural se mide una vez (onLayout) y se anima `altura ×
 * progress`; `overflow: hidden` recorta el contenido mientras encoge.
 *
 * RESTRICCIÓN — el hijo NO puede llevar sombra propia: el `overflow: hidden`
 * es obligatorio para colapsar la altura y recorta todo lo que se dibuje fuera
 * del rectángulo, así que una `boxShadow` outset (y más aún el glow blanco del
 * neumorfismo) queda cortada en seco y se lee como un halo cuadrado alrededor
 * del contenido. Si el contenido necesita sombra, tiene que vivir FUERA:
 * envolver ESTE componente en un wrapper que la lleve, no el hijo.
 */
export function CollapsingReveal({
  visible,
  hideDelayMs = 0,
  children,
  style,
}: CollapsingRevealProps) {
  const reduceMotion = useReducedMotion()
  // Render real: se mantiene true durante el colapso para que la animación se
  // vea; recién se apaga (null) cuando el colapso terminó.
  const [rendered, setRendered] = useState(visible)
  const progress = useSharedValue(visible ? 1 : 0)
  // Altura natural medida (UI thread). 0 = todavía sin medir → no fijamos
  // altura y el contenido se dimensiona solo.
  const measuredHeight = useSharedValue(0)

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- re-montar y expandir al volverse visible
      setRendered(true)
      progress.value = withTiming(1, { duration: motionDurations.standard })
      return
    }
    if (!rendered) return
    if (reduceMotion) {
      // Sin animación: respetamos el delay (para no cortar detrás del sheet)
      // y desmontamos.
      const t = setTimeout(() => setRendered(false), hideDelayMs)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => {
      progress.value = withTiming(
        0,
        { duration: motionDurations.standard },
        (finished) => {
          'worklet'
          if (finished) runOnJS(setRendered)(false)
        },
      )
    }, hideDelayMs)
    return () => clearTimeout(t)
  }, [visible, rendered, hideDelayMs, reduceMotion, progress])

  const animatedStyle = useAnimatedStyle(() => {
    if (measuredHeight.value <= 0) {
      // Pre-medición: solo fade, altura natural.
      return { opacity: progress.value }
    }
    return {
      opacity: progress.value,
      height: measuredHeight.value * progress.value,
    }
  })

  if (!rendered) return null

  return (
    <Animated.View
      style={[style, { overflow: 'hidden' }, animatedStyle]}
      onLayout={(e: LayoutChangeEvent) => {
        // Solo medimos mientras está expandida (visible). Durante el colapso la
        // altura ya viene de la animación — re-medir corrompería la base.
        if (!visible) return
        const h = e.nativeEvent.layout.height
        if (h > 0 && Math.abs(h - measuredHeight.value) > 0.5) {
          measuredHeight.value = h
        }
      }}
    >
      {children}
    </Animated.View>
  )
}
