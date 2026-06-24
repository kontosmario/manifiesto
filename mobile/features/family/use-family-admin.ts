import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAvatarSlug, type AvatarSlug } from '@/assets/avatars'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/utils/error-message'

export type FamilyMemberRole = 'owner' | 'member' | 'blocked'

export interface FamilyMemberStats {
  userId: string
  displayName: string
  avatarAnimal: AvatarSlug | null
  role: FamilyMemberRole
  blockedAt: string | null
  memberSince: string
  expensesCount: number
  expensesTotal: number
  fixedPaidCount: number
  currentStreak: number
  longestStreak: number
  lastExpenseAt: string | null
  spendSharePct: number
}

export const familyAdminMemberStatsQueryKey = ['family-admin', 'member-stats'] as const

function parseRole(raw: unknown): FamilyMemberRole {
  if (raw === 'owner' || raw === 'blocked') return raw
  return 'member'
}

function toNumber(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function toInt(raw: unknown): number {
  const n = toNumber(raw)
  return Math.trunc(n)
}

function toNullableString(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

function normalizeRow(row: Record<string, unknown>): FamilyMemberStats {
  const rawAvatar = row.avatar_animal
  const avatarSlug =
    typeof rawAvatar === 'string' && isAvatarSlug(rawAvatar) ? rawAvatar : null
  const displayNameRaw = row.display_name
  return {
    userId: String(row.user_id ?? ''),
    displayName:
      typeof displayNameRaw === 'string' && displayNameRaw.trim().length > 0
        ? displayNameRaw
        : 'Usuario',
    avatarAnimal: avatarSlug,
    role: parseRole(row.role),
    blockedAt: toNullableString(row.blocked_at),
    memberSince:
      typeof row.member_since === 'string' ? row.member_since : new Date().toISOString(),
    expensesCount: toInt(row.expenses_count),
    expensesTotal: toNumber(row.expenses_total),
    fixedPaidCount: toInt(row.fixed_paid_count),
    currentStreak: toInt(row.current_streak),
    longestStreak: toInt(row.longest_streak),
    lastExpenseAt: toNullableString(row.last_expense_at),
    spendSharePct: toNumber(row.spend_share_pct),
  }
}

/**
 * Calls `family_member_stats()` RPC — returns one row per member of the
 * caller's family (including blocked members) with per-cycle usage stats.
 * Only non-blocked callers resolve; blocked users get an empty list.
 */
export function useFamilyMemberStats() {
  return useQuery<FamilyMemberStats[]>({
    queryKey: familyAdminMemberStatsQueryKey,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('family_member_stats')
      if (error) throw error
      if (!Array.isArray(data)) return []
      return (data as Record<string, unknown>[]).map(normalizeRow)
    },
  })
}

interface MutationInput {
  targetUserId: string
}

function useFamilyAdminMutation(rpcName: string, fallbackMessage: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ targetUserId }: MutationInput) => {
      const { error } = await supabase.rpc(rpcName, {
        target_user_id: targetUserId,
      })
      if (error) {
        // Surface server-side Spanish strings verbatim.
        throw new Error(getErrorMessage(error, fallbackMessage))
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['family-admin'] }),
        queryClient.invalidateQueries({ queryKey: ['family-members'] }),
      ])
    },
  })
}

export function useBlockMember() {
  return useFamilyAdminMutation('family_block_member', 'No pudimos bloquear al miembro.')
}

export function useUnblockMember() {
  return useFamilyAdminMutation(
    'family_unblock_member',
    'No pudimos desbloquear al miembro.',
  )
}

export function useRemoveMember() {
  return useFamilyAdminMutation('family_remove_member', 'No pudimos eliminar al miembro.')
}
