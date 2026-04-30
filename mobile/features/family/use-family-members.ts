import { useQuery } from '@tanstack/react-query'
import { isAvatarSlug, type AvatarSlug } from '@/assets/avatars'
import { supabase } from '@/lib/supabase'

export interface FamilyMemberRow {
  id: string
  name: string
  color: string
  avatarSlug: AvatarSlug | null
}

export const familyMembersKey = (familyId?: string) => ['family-members', familyId ?? null] as const

const COLOR_POOL = ['#2E7D5B', '#E08E63', '#6B3A4F', '#C9A23A', '#4D6FB3', '#8A4D9A']

/**
 * Fetches display info for every member of a family. We can't use a
 * single-shot select with a `profiles(...)` embed because
 * `family_members.user_id` and `profiles.id` both reference
 * `auth.users(id)` — PostgREST can't infer a direct FK between the
 * two tables, so it answers 400 on the implicit join. Instead: fetch
 * members first, then their profiles in a second round-trip.
 */
export function useFamilyMembers(familyId?: string) {
  return useQuery<FamilyMemberRow[]>({
    queryKey: familyMembersKey(familyId),
    enabled: Boolean(familyId),
    // Family roster rarely flips mid-session. Bumped from 60s so tab
    // switches don't trigger silent refetches.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!familyId) return []

      const membersResponse = await supabase
        .from('family_members')
        .select('user_id')
        .eq('family_id', familyId)
      if (membersResponse.error) throw membersResponse.error

      const userIds = (membersResponse.data ?? []).map((m) => m.user_id)
      if (userIds.length === 0) return []

      const profilesResponse = await supabase
        .from('profiles')
        .select('id, display_name, avatar_animal')
        .in('id', userIds)
      if (profilesResponse.error) throw profilesResponse.error

      const nameById = new Map<string, string>()
      const avatarById = new Map<string, AvatarSlug | null>()
      for (const p of profilesResponse.data ?? []) {
        if (p.id && typeof p.display_name === 'string') {
          nameById.set(p.id, p.display_name)
        }
        if (p.id) {
          const raw = (p as { avatar_animal?: unknown }).avatar_animal
          avatarById.set(
            p.id,
            typeof raw === 'string' && isAvatarSlug(raw) ? raw : null,
          )
        }
      }

      return userIds.map((id, i) => ({
        id,
        // Empty string when display_name is missing — `Avatar` falls
        // back to a person silhouette in that case. Previously this
        // was '—' which rendered as a stranded em dash inside the
        // colored circle (looked like a broken icon).
        name: nameById.get(id) ?? '',
        color: COLOR_POOL[i % COLOR_POOL.length],
        avatarSlug: avatarById.get(id) ?? null,
      }))
    },
  })
}
