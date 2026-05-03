// Family member roster with profile + per-member income contribution.
//
// `useFamilyMembers` returns just `id / name / color / avatarSlug` —
// enough for the Home strip. The onboarding "family summary" step
// and Settings → Family Admin need the contribution amount on top,
// so this hook does the same two-round-trip dance (members → profiles)
// but pulls `monthly_income_contribution` from the membership row.

import { useQuery } from '@tanstack/react-query'
import { isAvatarSlug, type AvatarSlug } from '@/assets/avatars'
import { supabase } from '@/lib/supabase'

export interface FamilyMemberDetail {
  userId: string
  displayName: string
  avatarSlug: AvatarSlug | null
  /** Monthly income contributed to the household (ARS). 0 means
   *  the member doesn't contribute. */
  monthlyIncomeContribution: number
}

export const familyMembersDetailKey = (familyId?: string) =>
  ['family-members-detail', familyId ?? null] as const

export function useFamilyMembersDetail(familyId?: string) {
  return useQuery<FamilyMemberDetail[]>({
    queryKey: familyMembersDetailKey(familyId),
    enabled: Boolean(familyId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!familyId) return []

      const membersResponse = await supabase
        .from('family_members')
        .select('user_id, monthly_income_contribution')
        .eq('family_id', familyId)
      if (membersResponse.error) throw membersResponse.error

      const rows = membersResponse.data ?? []
      if (rows.length === 0) return []

      const userIds = rows.map((m) => m.user_id as string)
      const profilesResponse = await supabase
        .from('profiles')
        .select('id, display_name, avatar_animal')
        .in('id', userIds)
      if (profilesResponse.error) throw profilesResponse.error

      const profileById = new Map<
        string,
        { display_name: string | null; avatar_animal: string | null }
      >()
      for (const p of profilesResponse.data ?? []) {
        if (typeof p.id === 'string') {
          profileById.set(p.id, {
            display_name:
              typeof p.display_name === 'string' ? p.display_name : null,
            avatar_animal:
              typeof (p as { avatar_animal?: unknown }).avatar_animal ===
              'string'
                ? ((p as { avatar_animal: string }).avatar_animal as string)
                : null,
          })
        }
      }

      return rows.map((row): FamilyMemberDetail => {
        const profile = profileById.get(row.user_id as string)
        const rawAvatar = profile?.avatar_animal ?? null
        return {
          userId: row.user_id as string,
          displayName: profile?.display_name ?? '',
          avatarSlug:
            typeof rawAvatar === 'string' && isAvatarSlug(rawAvatar)
              ? (rawAvatar as AvatarSlug)
              : null,
          monthlyIncomeContribution: Number(row.monthly_income_contribution ?? 0),
        }
      })
    },
  })
}
