import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import { InteractionManager } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { animLog } from '@/lib/dev/anim-log'

/**
 * Gate para `LinearTransition` (Reanimated) en screens de tabs pre-mounted.
 *
 * # El bug que cierra
 *
 * Con `lazy: false` los 5 tabs se pre-montan en boot del app. Los hooks
 * de data (`useFijosController`, etc) disparan sus queries pero el screen
 * renderea el "loading state" sin data. Cuando el user toca el tab por
 * primera vez:
 *
 *   1. Tab focusea → `useFocusEffect` fire
 *   2. Screen se attach al view hierarchy nativo
 *   3. Renderea con `controller.isLoading = true` → secciones vacías/skeleton
 *   4. Query resuelve → `controller.allItems` se llena
 *   5. Re-render con data → **layout cambia** (de empty a populated)
 *   6. `Animated.View layout={LinearTransition}` interpola el cambio
 *      → toda la vista hace un "warp" / "salto" visible
 *
 * Tab switches subsiguientes: el data ya está hot, no hay layout change,
 * no hay warp. Solo el FIRST-VISIT trigger el bug.
 *
 * # Cómo cierra
 *
 * Devuelve `false` desde el mount hasta el primer focus + interacciones
 * idle del JS thread (típicamente 50-150ms post-focus, después de que el
 * data resuelva + el layout pass settle). Después devuelve `true`.
 *
 * Uso en el screen:
 *
 *   const gateOpen = useLayoutTransitionGate()
 *   const sectionLayout = gateOpen ? LinearTransition.duration(260) : undefined
 *   ...
 *   <Animated.View layout={sectionLayout}>...</Animated.View>
 *
 * Con `sectionLayout = undefined` el primer paint NO tiene layout transition
 * → la vista renderea directo a su tamaño final sin warp. Cuando el gate
 * abre, las layout transitions se habilitan para los siguientes cambios
 * (add/delete fijo, expand section, etc).
 *
 * # Por qué `useFocusEffect` y no `useEffect`
 *
 * `useEffect` fire en mount. Para pre-mounted tabs eso es app boot → el
 * gate abriría antes que el user navegue → cuando navegue y el data
 * resuelva, el layout transition fire igual.
 *
 * `useFocusEffect` fire cuando el screen se focusea — exactamente cuando
 * empieza la ventana del warp. Si el user nunca visita el tab, el gate
 * nunca abre y no hay costo.
 */
export function useLayoutTransitionGate(label?: string): boolean {
  const [open, setOpen] = useState(false)

  useFocusEffect(
    useCallback(() => {
      if (open) return
      // `runAfterInteractions` espera a que el JS thread esté idle
      // (data fetches + layout pass + animation worklets terminados).
      // Eso garantiza que la primera layout pass del screen ya pasó
      // ANTES de habilitar las transiciones.
      const handle = InteractionManager.runAfterInteractions(() => {
        setOpen(true)
        animLog('gate', 'open', label ? { screen: label } : undefined)
      })
      return () => {
        // `cancel` puede no existir en runtimes web → safe-guard.
        handle.cancel?.()
      }
    }, [open, label]),
  )

  return open
}

// ─── Versión por contexto (cobertura completa del árbol) ─────────────
//
// `useLayoutTransitionGate()` resuelve el warp SÓLO en el componente que
// lo llama (p. ej. el screen y sus secciones). Pero los hijos —hero cards,
// rows, chips, banners— tienen sus PROPIOS `layout={LinearTransition}`
// hardcodeados, y cada uno warpea en el primer attach. En vez de pasar el
// boolean por props a cada uno, exponemos el gate por contexto:
//
//   · `LayoutTransitionGateProvider` envuelve el screen (en la route file).
//     Calcula `open` con el mismo mecanismo (focus + InteractionManager).
//   · `useGatedLayout(transition)` lo lee y devuelve `undefined` hasta que
//     el gate abre → el primer paint NO tiene layout animation (sin warp).
//     Después abre y los cambios siguientes (pagar fijo, expandir, etc.)
//     vuelven a transicionar suave.
//
// Default `true` (gate abierto) para componentes FUERA de un provider
// (sheets, onboarding, modales): se comportan como hoy, sin gating.
const LayoutTransitionGateContext = createContext<boolean>(true)
// Opener imperativo — el screen lo dispara en su PRIMERA interacción
// (scroll/tap) para abrir el gate. Default no-op (componentes fuera de un
// provider).
const LayoutGateOpenerContext = createContext<() => void>(() => {})

export function LayoutTransitionGateProvider({
  children,
  label,
}: {
  children: ReactNode
  /** Nombre de la vista para el log dev del gate (solo __DEV__). */
  label?: string
}) {
  const [open, setOpen] = useState(false)

  const openGate = useCallback(() => {
    setOpen((prev) => {
      if (prev) return prev
      animLog('gate', 'open', label ? { screen: label } : undefined)
      return true
    })
  }, [label])

  // # Por qué open-on-INTERACTION en vez de un timer
  //
  // Antes el gate abría con `InteractionManager.runAfterInteractions`
  // (~72ms post-focus). Pero el SectionList VIRTUALIZADO de Gastos y el
  // ScrollView de Control siguen asentando su layout DESPUÉS de ese
  // momento (virtualización, data async que llega 1-2 frames tarde). El
  // `LinearTransition` —ya armado al abrir el gate— interpolaba ese settle
  // = el "warp/salto" del primer attach. Fijos/Home no lo sufren porque su
  // data es warm y asienta en el primer frame (no hay delta que interpolar).
  //
  // Las transiciones de layout existen para cambios que CAUSA el usuario
  // (filtrar, agregar/borrar). Esos requieren interacción. Así que el gate
  // abre con la primera interacción: hasta entonces el settle del primer
  // attach (y cualquier delta tardío) SNAPEA, sin warp. Re-cierra en blur
  // para que cada visita arranque protegida. Fallback: abrir igual tras una
  // espera generosa por si el user nunca toca la pantalla (para que un
  // update en background eventualmente transicione suave).
  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(openGate, 1500)
      return () => {
        clearTimeout(timer)
        setOpen(false)
      }
    }, [openGate]),
  )

  return createElement(
    LayoutGateOpenerContext.Provider,
    { value: openGate },
    createElement(LayoutTransitionGateContext.Provider, { value: open }, children),
  )
}

/**
 * Devuelve un callback que abre el gate de layout. El screen lo dispara en
 * su PRIMERA interacción (p. ej. `onScrollBeginDrag` / `onTouchStart` del
 * SectionList/ScrollView) para que las transiciones de layout recién se
 * armen cuando el usuario empieza a interactuar — nunca durante el settle
 * del primer attach. No-op fuera de un provider.
 */
export function useOpenLayoutGate(): () => void {
  return useContext(LayoutGateOpenerContext)
}

/**
 * Devuelve la `transition` recibida sólo cuando el gate de layout está
 * abierto (post primer-attach idle); `undefined` mientras está cerrado.
 * Usar en cualquier `<Animated.View layout={useGatedLayout(LinearTransition...)}>`
 * dentro de un screen de tab para matar el warp del primer attach.
 */
export function useGatedLayout<T>(transition: T): T | undefined {
  const open = useContext(LayoutTransitionGateContext)
  return open ? transition : undefined
}

/**
 * Versión booleana del gate — para animaciones que NO son `layout`/
 * `entering` (p. ej. un `useSharedValue` que crece una barra): con el gate
 * cerrado se inicializa el valor en su estado FINAL (sin animar en el
 * primer attach) y solo se anima cuando el gate abre.
 */
export function useLayoutGateOpen(): boolean {
  return useContext(LayoutTransitionGateContext)
}
