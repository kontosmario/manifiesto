import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useSharedValue, type SharedValue } from 'react-native-reanimated'
import { ARC_PHASE_CLOSED } from './arc-hub-machine'

/**
 * Los shared values que comparten las dos mitades del hub Arco: el FAB
 * (que corre el `Gesture.Pan`) y el host de raíz (que dibuja el arco).
 *
 * Van por CONTEXTO y no por `makeMutable` de módulo para garantizar que
 * los dos árboles capturen las MISMAS instancias en sus worklets. El
 * value se memoiza vacío de dependencias, así que el provider nunca
 * re-renderiza a sus hijos — que incluyen al `<Stack>` entero.
 *
 * Todo lo que tiene que ocurrir a 60fps (hit-test, escala del puck
 * apuntado, hundido, rotación del glifo) se resuelve leyendo esto en el
 * UI thread. El puente a JS (`arc-hub-bus`) sólo cruza en los eventos
 * discretos: abrir, cambiar de sector, cerrar, disparar.
 */

/**
 * Las fases viven en `arc-hub-machine` (módulo puro, testeable bajo vitest)
 * y se re-exportan acá para que los consumidores sigan importando fase y
 * shared values del mismo lugar.
 */
export {
  ARC_PHASE_CLOSED,
  ARC_PHASE_DRAG,
  ARC_PHASE_LATCHED,
  ARC_PHASE_FIRING,
} from './arc-hub-machine'

export interface ArcHubValues {
  phase: SharedValue<number>
  /** Centro del disco del FAB, en coordenadas de ventana. */
  cx: SharedValue<number>
  cy: SharedValue<number>
  /** Radio efectivo del abanico, resuelto al abrir. */
  radius: SharedValue<number>
  /** Índice del puck apuntado en `ARC_ORDER`; −1 = zona muerta. */
  pointed: SharedValue<number>
}

const ArcHubContext = createContext<ArcHubValues | null>(null)

export function ArcHubProvider({ children }: { children: ReactNode }) {
  const phase = useSharedValue(ARC_PHASE_CLOSED)
  const cx = useSharedValue(0)
  const cy = useSharedValue(0)
  const radius = useSharedValue(0)
  const pointed = useSharedValue(-1)

  const value = useMemo<ArcHubValues>(
    () => ({ phase, cx, cy, radius, pointed }),
    [phase, cx, cy, radius, pointed],
  )

  return <ArcHubContext.Provider value={value}>{children}</ArcHubContext.Provider>
}

/**
 * Devuelve `null` fuera del provider. El FAB vive en la barra de tabs, que
 * también se monta en el preview de dev y en la nav vieja: ahí no hay
 * provider y el arco simplemente no participa.
 */
export function useArcHubValues(): ArcHubValues | null {
  return useContext(ArcHubContext)
}
