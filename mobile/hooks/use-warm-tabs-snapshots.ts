import { useEffect } from 'react'
import { InteractionManager } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useFamily } from '@/features/family/use-family'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { prefetchGastosSnapshot } from '@/features/gastos/use-gastos-snapshot'
import { prefetchControlIntelligence } from '@/features/insights/use-control-v2-data'
import { computeCupoDiario } from '@/features/gastos/cupo-diario'

/**
 * Warm-up de los snapshots de los tabs Gastos y Control después que
 * Home renderea. Sin este hook, cuando el user toca el tab Gastos por
 * primera vez en el ciclo, el screen GATEA en `useGastosSnapshot.data`
 * → cold RPC → 400-800ms de freeze visible durante la transition de
 * 220ms del shift animation. Mismo problema con Control intelligence.
 *
 * El warmup se difiere via `InteractionManager.runAfterInteractions()`
 * para correr DESPUÉS que la primera frame de Home pintó y la auth
 * transition splash desaparece. JS thread idle = perfect moment para
 * fire-and-forget RPCs en paralelo. Si el user toca el tab antes que
 * resuelvan, React Query dedupea (mismo queryKey reusa la promise
 * pending).
 *
 * Idempotente: si los snapshots ya están fresh (staleTime), prefetch
 * es no-op.
 */
export function useWarmTabsSnapshots(): void {
  const queryClient = useQueryClient()
  const session = useAuthSession()
  const userId = session.data?.user.id
  const familyQuery = useFamily(userId)
  const familyId = familyQuery.data?.familyId
  const dashboard = useFamilyDashboard(familyId)
  const { cycle, today } = usePayCycle(familyId)

  // Compute cupoDiario igual que GastosV2Screen — keys deben matchear
  // exactamente para que el cache hit funcione cuando el user mounte
  // el screen.
  const monthlyIncome = dashboard.monthlyIncome
  const fixedExpensesMonthlyTotal = dashboard.fixedExpensesMonthlyTotal
  const savingsGoal = dashboard.savingsGoal
  const cycleDays = cycle.days
  const cycleStartIso = cycle.start.toISOString()
  const cycleEndIso = cycle.end.toISOString()

  useEffect(() => {
    if (!familyId || !userId || cycleDays <= 0) return
    // Mismo helper compartido que GastosV2Screen + el controller. El queryKey
    // del gastos_snapshot incluye cupoDiario; si el warm calculara distinto
    // que el screen, el cache no haría hit → cold-start → null-gate. El
    // redondeo (computeCupoDiario) absorbe el drift sub-peso entre el momento
    // del warm-prefetch y el del mount.
    const cupoDiario = computeCupoDiario({
      monthlyIncome,
      fixedExpensesMonthlyTotal,
      savingsGoal,
      cycleDays,
    })

    // Defer hasta que la UI thread idle · evita competir con el
    // first-paint de Home + la cascade de cards animadas.
    const handle = InteractionManager.runAfterInteractions(() => {
      void prefetchGastosSnapshot(queryClient, {
        familyId,
        userId,
        cycleStart: cycle.start,
        cycleEnd: cycle.end,
        today,
        cupoDiario,
        daysPerPage: 7,
      })
      void prefetchControlIntelligence(queryClient, familyId)
    })

    return () => {
      handle.cancel()
    }
  }, [
    queryClient,
    familyId,
    userId,
    monthlyIncome,
    fixedExpensesMonthlyTotal,
    savingsGoal,
    cycleDays,
    cycleStartIso,
    cycleEndIso,
    cycle.start,
    cycle.end,
    today,
  ])
}
