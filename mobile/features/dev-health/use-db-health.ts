import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DbHealthSnapshot } from './db-health-types'

export const dbHealthKey = () => ['db-health'] as const

async function fetchDbHealth(): Promise<DbHealthSnapshot | null> {
  const { data, error } = await supabase.rpc('db_health_snapshot')
  if (error) throw error
  return data as DbHealthSnapshot | null
}

export function useDbHealth() {
  return useQuery({
    queryKey: dbHealthKey(),
    queryFn: fetchDbHealth,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}
