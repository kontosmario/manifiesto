import { useMemo } from 'react'
import { triggerHaptic } from '@/lib/haptics'

/**
 * `screenListeners` para el `<Tabs>` de expo-router: dispara el háptico de
 * selección en cada toque de tab.
 *
 * Antes también publicaba un "pulso de tab" a un bus module-level
 * (`lib/tab-focus-pulse`) para que las pantallas pudieran animar según la
 * DIRECCIÓN del cambio. Ese bus nunca tuvo un solo suscriptor —y su productor
 * estaba roto: derivaba el nombre del route partiendo la key por el primer
 * guion, así que `fixed-expenses-<nanoid>` publicaba `'fixed'`, que no es una
 * ruta—. Se borró entero (2026-08-12).
 *
 * Lo que sí faltaba —reaccionar al toque sobre la tab YA activa— lo resuelve
 * `useScrollToTop` de React Navigation, cableado en las 4 pantallas: escucha
 * este mismo `tabPress`, sólo actúa con la pantalla enfocada y respeta el
 * `preventDefault()` del tour. Por eso el háptico se emite siempre: ahora
 * confirma una acción que ocurre de verdad.
 */
export function useTabHaptics() {
  return useMemo(
    () => ({
      tabPress: () => {
        void triggerHaptic('selection')
      },
    }),
    [],
  )
}
