import { useCallback, useEffect, useRef, useState } from 'react'
import { WeekCloseCierre } from '@/components/garden/week-close-cierre'
import { useGarden, type GardenData } from '@/features/garden/use-garden'
import {
  claimWeekCloseAutoShow,
  markWeekCloseSeen,
} from '@/features/garden/use-week-close-seen'

interface WeekCloseBridgeProps {
  familyId: string
  userId: string
}

/**
 * Bridge a nivel app: auto-dispara el "Cierre de semana" la primera vez que el
 * usuario abre la app en la semana nueva (recap de la semana que cerró). Una
 * vez por semana, persistido por usuario. Montado fuera del Stack para
 * sobrevivir la navegación. La gente lo ve igual tocando la card "Semana
 * pasada" de Mi jardín — esto sólo agrega el momento automático.
 *
 * DOS marcas, no una (T10): acá se reclama el AUTO-DISPARO
 * (`garden_week_close_shown_*`, lo que mantiene el 1×/semana) y el VISTO
 * (`garden_week_close_seen_*`) se escribe recién al CERRAR. Antes había una
 * sola marca, escrita antes de mostrar: con esa fuente el dot de "sin ver" de
 * la `SemanaPasadaCard` no podía prenderse nunca.
 */
export function WeekCloseBridge({ familyId, userId }: WeekCloseBridgeProps) {
  const { data } = useGarden(familyId, userId)
  // Snapshot congelado al disparar: el cierre recapitula una semana CERRADA,
  // así que no tiene por qué moverse mientras está abierto.
  const [active, setActive] = useState<GardenData | null>(null)
  const checkedRef = useRef(false)

  useEffect(() => {
    if (checkedRef.current) return
    if (!data || !data.weekCloseAvailable) return
    checkedRef.current = true
    const snapshot = data
    void claimWeekCloseAutoShow(userId, snapshot.weekCloseId).then((show) => {
      if (show) setActive(snapshot)
    })
  }, [data, userId])

  const handleClose = useCallback(() => {
    if (active) void markWeekCloseSeen(userId, active.weekCloseId)
    setActive(null)
  }, [active, userId])

  if (!active) return null
  return <WeekCloseCierre garden={active} userId={userId} onClose={handleClose} />
}
