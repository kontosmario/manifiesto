import {
  withRepeat,
  withSequence,
  withTiming,
  type EasingFunction,
  type EasingFunctionFactory,
  type SharedValue,
} from 'react-native-reanimated'

/**
 * Latido simétrico 0↔1 que se puede PAUSAR sin rebobinar.
 *
 * ── El problema ─────────────────────────────────────────────────────────
 * Los loops decorativos de las tabs se pausan por foco (`paused={!isFocused}`)
 * porque con `freezeOnBlur:false` la pantalla queda montada y su
 * `withRepeat(-1)` seguiría latiendo en el runtime de UI para nadie. Hasta acá,
 * bien. El defecto estaba en CÓMO se pausaban: la rama de pausa escribía el
 * shared value (`pulse.value = 0`) y la de reanudación lo volvía a escribir
 * antes de arrancar el loop.
 *
 * Las dos escrituras son visibles. `useIsFocused()` flipea al ARRANQUE de la
 * transición de tab —lo documenta `card-particles.tsx`—, así que la pausa cae
 * mientras la pantalla saliente todavía se ve durante el fundido, y la
 * reanudación cae con la entrante ya en pantalla. El usuario ve el halo
 * contraerse de golpe al irse y saltar al mínimo al volver: exactamente el
 * "se reinician las animaciones" que `use-loop-animation.ts` eliminó a nivel
 * global y que estos loops se habían quedado afuera de arreglar.
 *
 * ── La solución ─────────────────────────────────────────────────────────
 * Pausar = SÓLO `cancelAnimation`, sin tocar el valor (se congela donde está,
 * y nadie lo ve). Reanudar = este helper, que retoma DESDE el valor parkeado.
 *
 * El detalle que obliga a la secuencia: `withRepeat(withTiming(1), -1, true)`
 * captura el valor de arranque como el piso del rebote, así que largarlo desde
 * un parkeo de 0.63 dejaría el latido oscilando entre 0.63 y 1 — la amplitud se
 * degradaría en cada pausa. Por eso primero se baja al piso real (0) en el
 * tiempo PROPORCIONAL a lo que falta, y recién ahí arranca el loop de amplitud
 * completa. Desde 0 (el montaje) la secuencia se saltea y el comportamiento es
 * idéntico al de siempre.
 *
 * Reduced motion NO usa esto: ahí el valor se fija en el extremo de reposo que
 * documenta cada componente (0 o 0.5) y no hay loop.
 */
export function startPulseLoop(
  pulse: SharedValue<number>,
  { duration, easing }: { duration: number; easing: EasingFunction | EasingFunctionFactory },
) {
  const half = duration / 2
  const loop = withRepeat(withTiming(1, { duration: half, easing }), -1, true)
  const parked = pulse.value
  if (parked <= 0.001) {
    pulse.value = loop
    return
  }
  pulse.value = withSequence(withTiming(0, { duration: half * parked, easing }), loop)
}
