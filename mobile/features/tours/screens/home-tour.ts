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
    text: 'Arriba a la derecha tenés acceso rápido al asistente financiero (estrella), tu buzón de notificaciones (campanita) y los ajustes generales (mezcladora). Tocá cualquiera para abrirlo.',
  },
  // Middle: family + cycle context.
  familyStrip: {
    order: 1,
    text: 'Tu grupo familiar y los días que faltan para tu próximo cobro. Tap en la cápsula confirma que cobraste y arranca un ciclo nuevo.',
  },
  // Hero card: the savings goal at-a-glance.
  hero: {
    order: 2,
    text: 'Tu meta de ahorro: cuánto llevás, cuánto falta y a qué ritmo vas. Si todavía no configuraste tu ingreso mensual, vas a ver el atajo para hacerlo desde acá.',
  },
  // Two halves of the MonthSummaryCard, highlighted as separate
  // steps so the user understands each side does its own thing.
  variables: {
    order: 3,
    text: 'Tus gastos variables del ciclo: cuánto llevás gastado y cuál es tu categoría líder. Tocá la tarjeta para ir al detalle de Gastos.',
  },
  fixed: {
    order: 4,
    text: 'Tus compromisos fijos del ciclo: cuántos pagaste y cuál es el próximo a vencer. Tocá la tarjeta para ir al detalle de Fijos.',
  },
  // Conditional — only registers if MetaCard renders (savings goal
  // configured). When MetaEmptyCard renders instead, this step
  // doesn't register and the tour skips it naturally.
  meta: {
    order: 5,
    text: 'Tu meta de ahorro como una alcancía digital. Mostrá cuánto llevás guardado, sumá rápido un aporte y ajustá el objetivo desde acá.',
  },
  // Activity feed.
  activity: {
    order: 6,
    text: 'Tu actividad reciente del ciclo: los últimos movimientos, ordenados por fecha. Deslizá una fila a la izquierda para editar o borrar; tocá "Ver todos" para abrir la pantalla completa.',
  },
  // Last: bottom chrome — FAB long-press hint.
  fab: {
    order: 7,
    text: 'Este es el botón de acciones rápidas. Tap simple agrega un gasto. Mantenelo apretado y aparece un menú con 3 opciones: gasto, gasto fijo o ingreso. Es el atajo para sumar movimientos en segundos.',
  },
} as const satisfies Record<string, TourStepCopy>
