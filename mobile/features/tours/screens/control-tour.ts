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
    text: 'Tu pulso del día: cuánto te queda libre hoy y cómo vas contra tu cupo diario. Si estás verde, estás en ritmo; si te ponés en rojo, ya cruzaste el techo.',
  },
  asesor: {
    order: 1,
    text: 'El asesor financiero. Acá leemos tus patrones y te avisamos lo que importa: gastos que se descontrolaron, fijos que no usás, oportunidades de ahorro. Tocá una tarjeta para resolver el caso.',
  },
  alcanza: {
    order: 2,
    text: '¿Llegás a fin de mes? Proyectamos tu cierre con tu ritmo actual. Si la app dice que no llegás, te muestra el día estimado en que se te termina el cupo y cuánto falta para ajustar.',
  },
  alcancia: {
    order: 3,
    text: 'Tu alcancía del ciclo: lo que NO gastaste cada día se acumula acá. Es el ahorro automático de quedarte por debajo del cupo diario. Tocá la tarjeta para ver el detalle.',
  },
  semana: {
    order: 4,
    text: 'Resumen de la semana actual contra la semana pasada. Si una categoría se disparó esta semana, lo vas a ver acá antes de que el ciclo se rompa.',
  },
  vsMes: {
    order: 5,
    text: 'Comparación contra meses anteriores. Mostramos si tu mes actual va por arriba, por debajo o igual al promedio histórico — útil para detectar si el mes está siendo atípico.',
  },
  patron: {
    order: 6,
    text: 'Tu patrón de gasto por día de la semana. Si los miércoles siempre gastás de más o los lunes te cuidás solo, acá lo ves como una huella propia.',
  },
  cobertura: {
    order: 7,
    text: 'Cobertura de tu ingreso: cuánto cubre tu sueldo a este ritmo, y cuántos días aguantarías si dejaras de cobrar hoy. Es el indicador de salud financiera más fundamental.',
  },
} as const satisfies Record<string, TourStepCopy>
