// Descriptores de layout-animation de los wizards, como INSTANCIAS ÚNICAS.
//
// Por qué no se construyen inline en el JSX:
// `AnimatedComponent.componentDidUpdate` llama a `_configureLayoutAnimation`
// para LAYOUT y EXITING en CADA update, y ese método sólo corta por IDENTIDAD
// referencial (`currentConfig === previousConfig`). `LinearTransition.duration(...)`
// y `FadeOut.duration(...)` devuelven una instancia NUEVA en cada render, así
// que nunca cortaba: cada update disparaba `updateLayoutAnimations` →
// serializar la config al runtime de worklets + un batch nativo.
//
// El caso concreto: en el paso 1, tipear "Cafetería" (9 caracteres) re-rendea
// la screen y con ella los tres `Animated.View` del encabezado (header, dots,
// píldora de back-date) más el bloque del paso — 5 re-registros por tecla, 45
// serializaciones y 45 llamadas nativas que no cambian nada, en el hilo JS y
// justo mientras el teclado inyecta eventos. Es exactamente el perfil de jank
// de Android gama baja que documenta el proyecto.
//
// Con identidad estable, `currentConfig === previousConfig` corta y el
// re-registro desaparece. `STEP_ENTER` no lo necesita (el ENTERING sólo se
// configura en `componentDidMount`), pero se comparte igual por consistencia y
// para no crear un objeto por montaje.
import { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { motionDurations } from '@/lib/motion'

/** Entrada del bloque de un paso. */
export const STEP_ENTER = FadeIn.duration(motionDurations.standard)
/** Salida del bloque de un paso (al cambiar de paso). */
export const STEP_EXIT = FadeOut.duration(motionDurations.quick)
/** Reacomodo de los elementos que sobreviven al cambio de paso (encabezado,
 *  dots, píldora de back-date) y del stack de cada paso. */
export const STEP_LAYOUT = LinearTransition.duration(motionDurations.deliberate)

/**
 * Entrada RETRASADA, para lo que tiene que aparecer DESPUÉS de la cascada de
 * cards del paso 2: el chip del delta y el aviso de "fuera del ciclo". Las
 * cards suben con `RiseView` a 0 / 80 / 160; sin el retraso estos dos quedaban
 * pintados desde el frame 0 mientras sus vecinos todavía subían, y se leían
 * como algo ajeno a la secuencia — justo los dos elementos que más atención
 * piden.
 *
 * Vive acá y no en cada paso porque los dos wizards lo tenían declarado
 * IDÉNTICO en su propio archivo (el de gasto con un comentario que decía
 * "copiado del hermano"): dos constantes que se pretenden iguales y nadie
 * obliga a que lo sigan siendo. Aplica además la misma regla de identidad
 * única del resto del archivo — `.delay(...)` devuelve una instancia nueva por
 * llamada.
 */
export const STEP_DELAYED_ENTER = FadeIn.duration(motionDurations.standard).delay(
  motionDurations.standard,
)
