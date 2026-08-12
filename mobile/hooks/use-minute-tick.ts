// Reloj de MINUTO para las superficies cuyo contenido depende de la hora.
//
// Nació para "Mi jardín" (rediseño 2026-08): la etapa del brote se mide en
// HORAS (`crecimiento-model`), así que el modelo necesita la hora local viva y
// —sobre todo— el `todayIso` correcto al cruzar la medianoche con la app
// abierta (matriz ②7). Sin este tick los siete aros se quedaban pegados en el
// día viejo hasta que algo más forzara un re-render.
//
// Es el hermano de grano fino de `useCurrentDate` (que sólo dispara al cruzar
// la medianoche): acá la hora del día ES el dato, no sólo el día.
//
// Se monta SÓLO en la pantalla que lo necesita y viaja hacia abajo como
// parámetro. Cada tick devuelve una `Date` NUEVA, así que todo `useMemo` que
// lo tenga en sus deps recomputa: montarlo en un hook compartido lo cobraría
// en pantallas que no lo miran.

import { useEffect, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

/** Un minuto. El aro y los chips se mueven en horas: no hace falta más fino. */
const TICK_MS = 60_000

export function useMinuteTick(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    // El intervalo se re-arma en cada foreground: en background el SO puede
    // congelarlo (o directamente matarlo) y volver con un reloj atrasado —
    // justamente el caso "abrí la app a la mañana siguiente".
    let timer: ReturnType<typeof setInterval> | null = null
    const arm = () => {
      if (timer != null) clearInterval(timer)
      timer = setInterval(() => setNow(new Date()), TICK_MS)
    }

    const onAppStateChange = (status: AppStateStatus) => {
      if (status !== 'active') return
      setNow(new Date())
      arm()
    }

    arm()
    const sub = AppState.addEventListener('change', onAppStateChange)
    return () => {
      if (timer != null) clearInterval(timer)
      sub.remove()
    }
  }, [])

  return now
}
