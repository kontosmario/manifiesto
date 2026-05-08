import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AppTabs } from '@/components/navigation/app-tabs'
import { useAuthSession } from '@/features/auth/use-auth-session'
import {
  homeSnapshotQueryKey,
  fetchHomeSnapshot,
} from '@/features/home/use-home-snapshot'

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

  return <AppTabs />
}
