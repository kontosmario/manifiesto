// @i18n-ignore-file — pieza gráfica del kit de rediseño; no tiene copy propio.
//
// El aro de crecimiento de "Mi jardín" (handoff jardin 2026-08, README:120–127).
// Lo usan las dos escalas de la pantalla con la MISMA geometría:
//   · aro grande de foco  130/10 → pozo 100 + Brot 52
//   · fila de 7 días       40/4  → pozo 28  + Brot 15–20
//
// El porcentaje es CRECIMIENTO, no riego [OWNER-6]: cuánto le adelantaste hoy
// al brote (§3 del plan). Por eso el aro NUNCA baja por registrar, y el cupo
// entra como TONO (verde dentro / ámbar afuera / celeste sin datos), no como
// suma — de ahí que el color sea una prop animable y no un valor fijo.
import { useEffect } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  interpolateColor,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import { ringGeometry } from '@/components/redesign/jardin/jardin-spec'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

// `Circle` no sufre el problema de tipado de los children de
// react-native-svg (Defs/LinearGradient/Stop, que rechazan children y
// exigen `as React.FC<...>`): no lleva children, así que envolverlo con
// `createAnimatedComponent` es directo. Mismo patrón que `DrawRing` y
// `ScoreRing`. Este aro es de color plano —los tokens `ringGreen`/
// `ringAmber`/`ringWater`/`calmaRing` son strings, no gradientes— así que
// no hace falta ningún `<Defs>` y el cast no aparece en este archivo.
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/** Barrido del progreso (plan T2 Step 3). */
const SWEEP_MS = 600
/** `Easing` de reanimated: el MISMO runtime que el `withTiming` que lo consume. */
const SWEEP_EASING = Easing.out(Easing.cubic)
/**
 * Cruce de tono verde↔ámbar↔celeste. Más corto que el barrido: el tono es
 * ESTADO (te pasaste del cupo o no), no progreso, y tiene que leerse como un
 * cambio de color, no como una segunda animación de llenado.
 */
const TONE_MS = 400

/**
 * Geometría del anillo exterior del **día en calma** [OWNER-4].
 *
 * Va por FUERA del aro principal, no por dentro: entre el trazo y el pozo
 * quedan 4px en el aro grande y 1px en el de día (`JARDIN_GEOMETRY.ringDay`
 * well 28 contra r=17), o sea adentro no entra a ninguna escala. Como el
 * contenedor del aro no puede llevar `overflow:'hidden'` (el dibujo del Brot
 * sobresale 12u de su caja), el anillo extra puede sobresalir sin recortarse:
 * el `<Svg>` se dibuja más grande que la caja de layout y se centra en
 * absoluto, así el aro sigue midiendo `size` para quien lo acomoda.
 */
function outerRingGeometry(size: number, stroke: number) {
  const { r } = ringGeometry(size, stroke)
  const gap = Math.max(1.5, stroke * 0.2)
  const width = Math.max(1.5, stroke * 0.35)
  const radius = r + stroke / 2 + gap + width / 2
  return {
    r: radius,
    c: 2 * Math.PI * radius,
    stroke: width,
    /** Cuánto sobresale de la caja de `size`, por lado. */
    bleed: Math.ceil(radius + width / 2 - size / 2),
  }
}

export interface GrowthRingProps {
  /** Diámetro de la caja de layout (130 el foco, 40 los días). */
  size: number
  /** Grosor del trazo (10 el foco, 4 los días). */
  stroke: number
  /** Progreso 0..1. Se clampea: el modelo ya topea, pero el aro no confía. */
  pct: number
  /** Tono del aro (§3.3): verde dentro del cupo, ámbar fuera, celeste sin datos. */
  color: string
  /** Track siempre visible debajo del progreso. */
  trackColor: string
  /** Día en calma: suma un segundo anillo exterior (D4). */
  double?: boolean
  /** `false` → sin barrido ni cruce de tono, valores directos. */
  animated?: boolean
  style?: StyleProp<ViewStyle>
  /** El pozo con el Brot. Va FUERA del `<Svg>`, absoluto y centrado. */
  children?: React.ReactNode
}

/**
 * Aro SVG con progreso y tono animados.
 *
 * El progreso se dibuja con `strokeDasharray = c` y `strokeDashoffset =
 * c × (1 − pct)` sobre un `rotate(-90)` centrado (arranca a las 12 y barre en
 * sentido horario). El tono cruza con `interpolateColor` entre el color
 * anterior y el nuevo, así el paso a ámbar cuando te pasaste del cupo no
 * parpadea.
 *
 * Reduced motion (gate del repo, `@/hooks/use-reduced-motion` — nunca el
 * `useReducedMotion` de reanimated, que es el import trap con regla ESLint):
 * el aro se pinta en su estado final desde el primer frame, igual que
 * `animated={false}`. No se degrada a un fade más corto porque acá no hay nada
 * decorativo que suavizar: el valor final ES la información.
 */
export function GrowthRing({
  size,
  stroke,
  pct,
  color,
  trackColor,
  double = false,
  animated = true,
  style,
  children,
}: GrowthRingProps) {
  const reduceMotion = useReducedMotion()
  const motion = animated && !reduceMotion

  // Geometría en JS, nunca dentro de un worklet.
  const { r, c } = ringGeometry(size, stroke)
  const outer = outerRingGeometry(size, stroke)
  const bleed = double ? outer.bleed : 0
  const canvas = size + 2 * bleed
  const center = canvas / 2
  const clamped = Math.min(Math.max(pct, 0), 1)

  // Sin motion arranca en su valor final (nada de flash de aro vacío).
  const progress = useSharedValue(motion ? 0 : clamped)

  useEffect(() => {
    if (!motion) {
      cancelAnimation(progress)
      progress.value = clamped
      return
    }
    progress.value = withTiming(clamped, { duration: SWEEP_MS, easing: SWEEP_EASING })
    return () => {
      cancelAnimation(progress)
    }
  }, [clamped, motion, progress])

  // El cruce de tono necesita el color ANTERIOR como ancla; los shared values
  // lo guardan para que el worklet los lea sin volver al hilo de JS.
  const colorFrom = useSharedValue(color)
  const colorTo = useSharedValue(color)
  const toneMix = useSharedValue(1)

  useEffect(() => {
    if (colorTo.value === color) return
    // El ancla de salida es el tono anterior, no el color exacto que se esté
    // pintando en este frame: leer el valor interpolado desde JS obligaría a
    // un `runOnJS` por frame, y dos cambios de tono dentro de los 400ms no
    // existen en esta pantalla (el cupo no cambia dos veces por frame).
    colorFrom.value = colorTo.value
    colorTo.value = color
    if (!motion) {
      cancelAnimation(toneMix)
      toneMix.value = 1
      return
    }
    toneMix.value = 0
    toneMix.value = withTiming(1, { duration: TONE_MS, easing: SWEEP_EASING })
    return () => {
      cancelAnimation(toneMix)
    }
  }, [color, motion, colorFrom, colorTo, toneMix])

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: c * (1 - progress.value),
    stroke: interpolateColor(toneMix.value, [0, 1], [colorFrom.value, colorTo.value]),
  }))

  const outerProps = useAnimatedProps(() => ({
    strokeDashoffset: outer.c * (1 - progress.value),
    stroke: interpolateColor(toneMix.value, [0, 1], [colorFrom.value, colorTo.value]),
  }))

  // Con progreso 0 el arco mide 0: `round` puede dejar un punto a las 12 en
  // los días sin registros (7 puntos fantasma en la fila), `butt` no dibuja
  // nada. En cuanto hay algo que mostrar vuelve la punta redonda del handoff.
  const linecap = clamped > 0 ? 'round' : 'butt'

  return (
    <View style={[styles.root, { width: size, height: size }, style]}>
      <Svg
        width={canvas}
        height={canvas}
        viewBox={`0 0 ${canvas} ${canvas}`}
        pointerEvents="none"
        style={[styles.svg, { left: -bleed, top: -bleed }]}
      >
        <Circle cx={center} cy={center} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        {double ? (
          <AnimatedCircle
            animatedProps={outerProps}
            cx={center}
            cy={center}
            fill="none"
            origin={`${center}, ${center}`}
            r={outer.r}
            rotation={-90}
            strokeDasharray={`${outer.c}`}
            strokeLinecap={linecap}
            strokeWidth={outer.stroke}
          />
        ) : null}
        <AnimatedCircle
          animatedProps={ringProps}
          cx={center}
          cy={center}
          fill="none"
          origin={`${center}, ${center}`}
          r={r}
          rotation={-90}
          strokeDasharray={`${c}`}
          strokeLinecap={linecap}
          strokeWidth={stroke}
        />
      </Svg>
      {children != null ? (
        // SIN `overflow:'hidden'`: la tinta del Brot sobresale 12u de su caja
        // (BROT_INK_BLEED_TOP) y cualquier clip acá lo guillotina.
        // `box-none` deja pasar el toque al pressable que envuelve al aro.
        <View style={styles.children} pointerEvents="box-none">
          {children}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  svg: { position: 'absolute' },
  children: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
