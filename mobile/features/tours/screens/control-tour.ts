import { TOUR_KEYS } from '../tour-keys'
import type { TourStepCopy } from './home-tour'

export const CONTROL_TOUR = TOUR_KEYS.control

export const CONTROL_TOUR_STEPS = {
  hoy: {
    order: 0,
    text: 'Tu pulso del día: cuánto te queda libre hoy y cómo vas contra tu cupo diario. Si estás verde, estás en ritmo; si te pones en rojo, ya cruzaste el techo.',
  },
  asesor: {
    order: 1,
    text: 'El asesor financiero. Acá leemos tus patrones y te avisamos lo que importa: gastos que se descontrolaron, fijos que no usás, oportunidades de ahorro. Tocá una tarjeta para resolver el caso.',
  },
  alcanza: {
    order: 2,
    text: 'Proyección de cierre: si seguís con este ritmo, ¿llegás bien a fin de mes? Más abajo vas a encontrar más cards con análisis de tu semana, comparación con meses anteriores y tu alcancía acumulada.',
  },
} as const satisfies Record<string, TourStepCopy>
