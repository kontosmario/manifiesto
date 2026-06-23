import { useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { WeekCloseCelebration } from '@/components/garden/week-close-celebration'
import { useGarden } from '@/features/garden/use-garden'
import type { WeekClose } from '@/features/garden/garden-model'

interface WeekCloseBridgeProps {
  familyId: string
  userId: string
}

/**
 * Bridge a nivel app: auto-dispara la celebración de "Cierre de semana" la
 * primera vez que el usuario abre la app en la semana nueva (recap de la semana
 * que cerró). Una vez por semana, persistido en AsyncStorage por usuario.
 * Montado fuera del Stack para sobrevivir navegación. La gente lo ve igual
 * tocando el banner de Mi jardín — esto solo agrega el momento automático.
 */
export function WeekCloseBridge({ familyId, userId }: WeekCloseBridgeProps) {
  const { data } = useGarden(familyId, userId)
  const [active, setActive] = useState<WeekClose | null>(null)
  const checkedRef = useRef(false)

  useEffect(() => {
    if (checkedRef.current) return
    if (!data || !data.weekCloseAvailable) return
    checkedRef.current = true
    const key = `garden_week_close_seen_${userId}`
    const weekId = data.weekCloseId
    const weekClose = data.weekClose
    void (async () => {
      try {
        const seen = await AsyncStorage.getItem(key)
        if (seen !== weekId) {
          await AsyncStorage.setItem(key, weekId)
          setActive(weekClose)
        }
      } catch {
        // Best-effort: si AsyncStorage falla, no mostramos (nunca romper el boot).
      }
    })()
  }, [data, userId])

  if (!active) return null
  return <WeekCloseCelebration weekClose={active} onContinue={() => setActive(null)} />
}
