import { useCallback } from 'react'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import type { MapContext } from './map-to-review-rows'

/**
 * Cableado común del wizard de import: identidad (familyId/userId) y
 * fábrica del MapContext (fecha hoy + tipo de cambio + row ids).
 * Compartido por el tab button (picker path) y ShareImportHost
 * (share-to-import) para que la config del parser no se duplique.
 */
export function useImportWizardContext() {
  const session = useAuthSession()
  const userId = session.data?.user.id
  const homeSnapshot = useHomeSnapshot(userId)
  const familyId = homeSnapshot.data?.family?.familyId ?? undefined
  const financeQuery = useFamilyFinance(familyId)
  const usdToArsRate = financeQuery.data?.usd_exchange_rate ?? 1000

  const makeMapContext = useCallback((): MapContext => {
    const today = new Date().toISOString().slice(0, 10)
    let idCounter = 0
    return {
      today,
      usdToArsRate,
      generateRowId: () => `r-${++idCounter}`,
    }
  }, [usdToArsRate])

  return { familyId, userId, makeMapContext }
}
