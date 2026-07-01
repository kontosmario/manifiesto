// Gate para exponer las señales del asistente. Función PURA (testeable sin el
// hook) que decide cuándo las señales están listas para mostrarse.
//
// Regla: exponer las señales SOLO cuando (a) los FILTROS cargaron (blocklist +
// dismissed) Y (b) TODAS las fuentes que las ALIMENTAN cargaron (settled). Sin
// (b), las señales se computan con data PARCIAL (intelligence, snapshots, prefs,
// stats todavía cargando) → aparecen y después se esconden al llegar la data real
// = falsos positivos en las cards, el conteo y el push. Antes el gate esperaba
// solo (a), y como los filtros resuelven rápido (local/quick), las señales
// flickeaban mientras cargaba el resto.
//
// Se usa `*Loading` (no `data !== undefined`) para las entradas: un query con
// error —ya settled— no debe bloquear las señales para siempre; una query
// deshabilitada (sin userId) tampoco bloquea (su isLoading es false).

export interface SignalsReadyInput {
  /** Hay usuario logueado (si no, la blocklist per-usuario no aplica). */
  hasUserId: boolean
  /** blocklistQuery.data !== undefined (el filtro de bloqueados cargó). */
  blocklistLoaded: boolean
  /** Los dismissals se hidrataron del storage local. */
  dismissalsHydrated: boolean
  /** Core + intelligence (expenses/fixed/finance/categorías/summaries/velocity) cargando. */
  coreLoading: boolean
  /** advisorPrefs (kill-switch + persona) cargando. */
  prefsLoading: boolean
  /** interaction-stats (persona + cadencia de señales) cargando. */
  statsLoading: boolean
  /** control-snapshot (forecast) cargando. */
  snapshotLoading: boolean
  /** home-snapshot (subscription check-in) cargando. */
  homeSnapshotLoading: boolean
}

export function areSignalsReady(input: SignalsReadyInput): boolean {
  const filtersReady =
    (!input.hasUserId || input.blocklistLoaded) && input.dismissalsHydrated
  const inputsSettled =
    !input.coreLoading &&
    !input.prefsLoading &&
    !input.statsLoading &&
    !input.snapshotLoading &&
    !input.homeSnapshotLoading
  return filtersReady && inputsSettled
}
