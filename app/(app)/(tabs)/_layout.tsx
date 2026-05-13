import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AppTabs } from '@/components/navigation/app-tabs'
import { useAuthSession } from '@/features/auth/use-auth-session'
import {
  homeSnapshotQueryKey,
  fetchHomeSnapshot,
} from '@/features/home/use-home-snapshot'
import { useWarmTabsSnapshots } from '@/hooks/use-warm-tabs-snapshots'

export default function TabsLayout() {
  const queryClient = useQueryClient()
  const userId = useAuthSession().data?.user.id

  useEffect(() => {
    if (!userId) return
    queryClient.prefetchQuery({
      queryKey: homeSnapshotQueryKey(userId),
      queryFn: fetchHomeSnapshot,
      staleTime: 60_000,
    })
  }, [queryClient, userId])

  // Warm-up de los snapshots de Gastos + Control después que Home
  // renderea. Diferido vía InteractionManager — corre cuando el UI
  // thread está idle, no compite con la primera frame. Cuando el user
  // tap Gastos/Control, cache hot → screen renderea en 1 frame.
  useWarmTabsSnapshots()

  return <AppTabs />
}
