import i18n from '@/lib/i18n'
import { TOUR_KEYS } from '../tour-keys'
import type { TourStepCopy } from './home-tour'

export const GASTOS_TOUR = TOUR_KEYS.gastos

/**
 * Gastos tour — 6 paradas. Orden:
 *   0. Hero (resumen del ciclo)
 *   1. Desplegable de ciclo (abre las ediciones ya cerradas)
 *   2. Botón-ícono del jardín (racha + acceso a Mi jardín)
 *   3. Filtros
 *   4. Calendario
 *   5. Listado de movimientos
 *
 * El paso 1 y el 2 salieron de PARTIR el viejo `streak`, que resaltaba el
 * header ENTERO (pedido del owner 2026-08-17: "debería mostrar 2 cosas: el
 * desplegable para ver cierres anteriores si los hay, y otro step aparte para
 * el acceso al jardín de Brot resaltando el ícono botón del mismo"). Cada uno
 * apunta ahora a SU elemento vía ref (`cycleTriggerRef` / `gardenButtonRef` del
 * `GastosHeader` del kit), no al bloque completo.
 *
 * `text` vía getter para reaccionar al cambio de idioma en runtime.
 */
export const GASTOS_TOUR_STEPS = {
  hero: {
    order: 0,
    get text() {
      return i18n.t('states:tour.gastos.hero')
    },
  },
  // Trigger del ciclo: "Ciclo 20 jun → 19 jul ▾". Siempre está en pantalla (el
  // header lo dibuja aunque no haya ninguna edición cerrada todavía), así que
  // el paso no depende de que existan cierres — lo que la lista tenga adentro
  // es lo que cambia. En la pantalla VIEJA (`gastos-v2-screen`, ya no ruteada)
  // no hay desplegable: ahí el paso simplemente no se registra y el tour lo
  // omite, igual que `filters` en su empty state.
  cycles: {
    order: 1,
    get text() {
      return i18n.t('states:tour.gastos.cycles')
    },
  },
  // Botón-ícono del jardín (Brot + badge de racha), esquina superior derecha.
  garden: {
    order: 2,
    get text() {
      return i18n.t('states:tour.gastos.garden')
    },
  },
  // El filtro va antes que el calendario porque así está en pantalla desde el
  // 2026-08-12 (gobierna hero + calendario + listado, ver la nota del
  // `ListHeader` en neo-gastos-screen). El tour recorre por `order`: si no se
  // acompañaba, el paso mandaba a scrollear al calendario y el siguiente de
  // vuelta hacia arriba.
  filters: {
    order: 3,
    get text() {
      return i18n.t('states:tour.gastos.filters')
    },
  },
  calendar: {
    order: 4,
    get text() {
      return i18n.t('states:tour.gastos.calendar')
    },
  },
  list: {
    order: 5,
    get text() {
      return i18n.t('states:tour.gastos.list')
    },
  },
} satisfies Record<string, TourStepCopy>
