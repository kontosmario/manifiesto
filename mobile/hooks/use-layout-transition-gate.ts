import { useCallback, useState } from 'react'
import { InteractionManager } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'

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
export function useLayoutTransitionGate(): boolean {
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
      })
      return () => {
        // `cancel` puede no existir en runtimes web → safe-guard.
        handle.cancel?.()
      }
    }, [open]),
  )

  return open
}
