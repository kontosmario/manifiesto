import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import type { ResolvedThemeMode } from '@/theme/palette'
import { wrappedPalette } from './wrapped-constants'
import { buildClosingScene } from './scenes/closing-scene'
import { buildCoverScene } from './scenes/cover-scene'
import { buildTopCategoryScene } from './scenes/top-category-scene'
import { buildTopExpenseScene } from './scenes/top-expense-scene'
import { resolveVerdictTone, buildVerdictScene } from './scenes/verdict-scene'
import type { LeftoverOption, Scene } from './scenes/types'

// Arma la lista de escenas a partir del payload + estado relevante para
// la closing scene (Spec B). Mantiene la composición pura: no toca
// hooks ni anima nada — solo describe qué escenas se rendean en qué
// orden con qué material.
export function buildScenes(
  payload: CycleWrappedPayload,
  mode: ResolvedThemeMode,
  leftoverSelected: LeftoverOption | null,
  onSelectLeftover: (next: LeftoverOption) => void,
): Scene[] {
  const palette = wrappedPalette(mode)
  // El veredicto elige su material según el resultado del ciclo. El cierre
  // usa el panel profundo para hacer statement de cierre, deliberadamente
  // desvinculado del estado anímico del veredicto (un over-budget sigue
  // cerrando con la misma identidad de marca).
  const verdict = resolveVerdictTone(payload.savingsDelta, palette)

  return [
    buildCoverScene(payload, palette.paper),
    buildVerdictScene(payload, verdict),
    ...(payload.topCategory ? [buildTopCategoryScene(payload, palette.surface)] : []),
    ...(payload.topExpense ? [buildTopExpenseScene(payload, palette.warm)] : []),
    buildClosingScene(payload, palette.deep, leftoverSelected, onSelectLeftover),
  ]
}
