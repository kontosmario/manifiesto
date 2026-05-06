import { TOUR_KEYS } from '../tour-keys'

export const HOME_TOUR = TOUR_KEYS.home

export interface TourStepCopy {
  order: number
  text: string
}

/**
 * Home tour — 8 stops covering the bones of the screen, in
 * top-to-bottom reading order with the FAB and header chrome
 * bracketing the content. The order field is the global order in
 * the tour; consumers reference these by name.
 */
export const HOME_TOUR_STEPS = {
  // Top: chrome.
  headerActions: {
    order: 0,
    text: 'En la parte superior derecha tienes tres accesos rápidos: el asistente financiero, tu buzón de notificaciones y la configuración general. Toca cualquiera para abrirlo.',
  },
  // Middle: family + cycle context.
  familyStrip: {
    order: 1,
    text: 'Tu grupo familiar y los días que faltan para tu próximo cobro. Cuando recibas tu sueldo, toca la cápsula para confirmarlo y arrancar un ciclo nuevo.',
  },
  // Hero card: the savings goal at-a-glance.
  hero: {
    order: 2,
    text: 'Tu meta de ahorro de un vistazo: cuánto llevas, cuánto falta y el ritmo al que avanzas. Si aún no has configurado tu ingreso mensual, aquí encontrarás el atajo para hacerlo.',
  },
  // Two halves of the MonthSummaryCard, highlighted as separate
  // steps so the user understands each side does its own thing.
  variables: {
    order: 3,
    text: 'Tus gastos variables del ciclo: cuánto llevas gastado y cuál es la categoría que lidera. Toca la tarjeta para abrir el detalle en Gastos.',
  },
  fixed: {
    order: 4,
    text: 'Tus compromisos fijos del ciclo: cuántos pagaste y cuál es el próximo a vencer. Toca la tarjeta para abrir el detalle en Fijos.',
  },
  // Conditional — only registers if MetaCard renders (savings goal
  // configured). When MetaEmptyCard renders instead, this step
  // doesn't register and the tour skips it naturally.
  meta: {
    order: 5,
    text: 'Tu meta de ahorro como una alcancía digital: ves cuánto llevas guardado, agregas un aporte rápido y ajustas el objetivo desde aquí.',
  },
  // Activity feed.
  activity: {
    order: 6,
    text: 'Tus movimientos recientes del ciclo, ordenados por fecha. Desliza una fila hacia la izquierda para editar o borrar, o toca "Ver todos" para abrir la pantalla completa.',
  },
  // Last: bottom chrome — FAB long-press hint.
  fab: {
    order: 7,
    text: 'El botón de acciones rápidas. Un toque registra un gasto al instante. Manténlo presionado para abrir un menú con tres opciones: gasto, gasto fijo o ingreso. Es la forma más rápida de sumar movimientos.',
  },
} as const satisfies Record<string, TourStepCopy>
