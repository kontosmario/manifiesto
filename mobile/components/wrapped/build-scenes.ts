import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { buildClosingScene } from './scenes/closing-scene'
import { buildCoverScene } from './scenes/cover-scene'
import { buildTopCategoryScene } from './scenes/top-category-scene'
import { buildTopExpenseScene } from './scenes/top-expense-scene'
import { resolveVerdictTone, buildVerdictScene } from './scenes/verdict-scene'
import type { LeftoverOption, Scene } from './scenes/types'

// Arma la lista de escenas a partir del payload + estado relevante para
// la closing scene (Spec B). Mantiene la composición pura: no toca
// hooks ni anima nada — solo describe qué escenas se rendean en qué
// orden con qué config.
export function buildScenes(
  payload: CycleWrappedPayload,
  isDark: boolean,
  leftoverSelected: LeftoverOption | null,
  onSelectLeftover: (next: LeftoverOption) => void,
): Scene[] {
  // El veredicto carga su propia paleta state-driven. El cierre usa
  // forest-deep para hacer statement de cierre, deliberadamente
  // desvinculado del estado anímico del veredicto (un over-budget
  // sigue cerrando con la misma identidad de marca).
  const verdict = resolveVerdictTone(payload.savingsDelta, isDark)

  return [
    buildCoverScene(payload),
    buildVerdictScene(payload, verdict),
    ...(payload.topCategory ? [buildTopCategoryScene(payload)] : []),
    ...(payload.topExpense ? [buildTopExpenseScene(payload)] : []),
    buildClosingScene(payload, leftoverSelected, onSelectLeftover),
  ]
}
