import { type SharedValue } from 'react-native-reanimated'
import { useUnboundedLoopAnimation } from '@/hooks/use-unbounded-loop-animation'

/**
 * Starts a set of infinite UI-thread loops, cancelling them on unmount and
 * reduced-motion. Pass a `start` callback that kicks off your `withRepeat(...)`
 * calls; the hook handles teardown.
 *
 * ── Por qué ya NO se gatea por foco (premium: sin reinicios) ──────────────
 * Antes este hook pausaba los loops en blur (`useIsFocused()`) para ahorrar
 * batería off-tab. Pero eso hacía que cada loop se REINICIE / re-sincronice
 * cada vez que la pantalla recuperaba foco: cambiar de tab o volver de una
 * sub-pantalla de Settings snapeaba el loop a su inicio (varios consumidores
 * resetean posición dentro de `start()` — float `y=-amp/2`, shine `x=-width`).
 * Se sentía como "se reinician las animaciones".
 *
 * Como los tab screens están siempre montados (`lazy:false`) y ya no se
 * congelan en blur (`freezeOnBlur:false` en `(tabs)`), el focus-gating
 * ahorraba poco y costaba ese jank. Ahora delega en
 * `useUnboundedLoopAnimation`: los loops corren CONTINUOS (start una vez al
 * montar; cancel en unmount + reduced-motion), igual que el patrón de
 * partículas/blobs/aurora. Resultado: el loop YA está en movimiento cuando
 * llegás a su pantalla → cero reinicio. La API es idéntica, así que los call
 * sites no cambian.
 */
export function useLoopAnimation(
  start: () => void,
  sharedValues: SharedValue<number>[],
  deps: ReadonlyArray<unknown> = [],
) {
  useUnboundedLoopAnimation(start, sharedValues, deps)
}
