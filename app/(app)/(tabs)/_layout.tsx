import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AppTabs } from '@/components/navigation/app-tabs'
import {
  homeSnapshotQueryKey,
  fetchHomeSnapshot,
} from '@/features/home/use-home-snapshot'

export default function TabsLayout() {
  const queryClient = useQueryClient()

  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: homeSnapshotQueryKey(),
      queryFn: fetchHomeSnapshot,
      staleTime: 60_000,
    })
  }, [queryClient])

  return <AppTabs />
}
