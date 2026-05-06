import { TOUR_KEYS } from '../tour-keys'
import type { TourStepCopy } from './home-tour'

export const CONTROL_TOUR = TOUR_KEYS.control

/**
 * Control tour — 8 stops covering every analytics card top-to-bottom
 * so the user understands what each one tells them.
 */
export const CONTROL_TOUR_STEPS = {
  hoy: {
    order: 0,
    text: 'Tu pulso del día: cuánto te queda libre hoy y cómo vas contra tu cupo diario. En verde estás dentro del ritmo; si pasas a rojo, ya cruzaste el techo.',
  },
  asesor: {
    order: 1,
    text: 'El asesor financiero. Lee tus patrones y te avisa lo que importa: gastos que se descontrolaron, fijos que no usas, oportunidades de ahorro. Toca una tarjeta para resolver cada caso.',
  },
  alcanza: {
    order: 2,
    text: '¿Llegas a fin de mes? Proyectamos el cierre con tu ritmo actual. Si la proyección no llega, te muestra el día estimado en que se acaba el cupo y cuánto necesitas ajustar.',
  },
  alcancia: {
    order: 3,
    text: 'Tu alcancía del ciclo: lo que NO gastaste cada día se acumula aquí. Es el ahorro automático que generas al quedarte por debajo del cupo diario. Toca la tarjeta para ver el detalle.',
  },
  semana: {
    order: 4,
    text: 'Resumen de la semana actual frente a la anterior. Si una categoría se disparó esta semana, lo vas a notar aquí antes de que el ciclo se rompa.',
  },
  vsMes: {
    order: 5,
    text: 'Comparación contra meses anteriores. Te indica si tu mes actual va por encima, por debajo o igual al promedio histórico — útil para detectar si el mes está siendo atípico.',
  },
  patron: {
    order: 6,
    text: 'Tu patrón de gasto por día de la semana. Si los miércoles siempre gastas de más o los lunes te cuidas solo, aquí lo ves como una huella propia.',
  },
  cobertura: {
    order: 7,
    text: 'La cobertura de tu ingreso: cuánto cubre tu sueldo a este ritmo y cuántos días aguantarías si dejaras de cobrar hoy. Es el indicador de salud financiera más fundamental.',
  },
} as const satisfies Record<string, TourStepCopy>
