import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface FamilyMemberRow {
  id: string
  name: string
  color: string
}

export const familyMembersKey = (familyId?: string) => ['family-members', familyId ?? null] as const

const COLOR_POOL = ['#2E7D5B', '#E08E63', '#6B3A4F', '#C9A23A', '#4D6FB3', '#8A4D9A']

export function useFamilyMembers(familyId?: string) {
  return useQuery<FamilyMemberRow[]>({
    queryKey: familyMembersKey(familyId),
    enabled: Boolean(familyId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!familyId) return []
      const { data, error } = await supabase
        .from('family_members')
        .select('user_id, profiles:profiles!inner(id, display_name)')
        .eq('family_id', familyId)
      if (error) throw error
      type Row = { user_id: string; profiles?: { display_name?: string } | { display_name?: string }[] | null }
      return (data ?? []).map((r: Row, i: number) => {
        const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
        return {
          id: r.user_id,
          name: profile?.display_name ?? '—',
          color: COLOR_POOL[i % COLOR_POOL.length],
        }
      })
    },
  })
}
