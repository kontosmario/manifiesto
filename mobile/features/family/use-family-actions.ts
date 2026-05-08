import { useMutation, useQueryClient } from '@tanstack/react-query'
import { categoriesQueryKey } from '@/features/categories/use-categories'
import { expenseQueryKeys } from '@/features/expenses/expense-query-keys'
import { familyFinanceQueryKey } from '@/features/finance/use-family-finance'
import { fixedExpenseQueryKeys } from '@/features/fixed-expenses/fixed-expense-query-keys'
import { notificationQueryKeys } from '@/features/notifications/notification-query-keys'
import { profileQueryKey } from '@/features/profile/use-profile'
import { pushSubscriptionQueryKey } from '@/features/push/use-push-notifications'
import { supabase } from '@/lib/supabase'
import { familyQueryKey } from '@/features/family/use-family'

interface FamilyRpcResult {
  family_id: string
}

function pickRpcResult(data: unknown): FamilyRpcResult {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('No se pudo obtener la familia desde Supabase.')
  }

  return data[0] as FamilyRpcResult
}

export function useBootstrapFamily(userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error('No hay sesión activa para crear la familia.')
      }

      const { data, error } = await supabase.rpc('bootstrap_family')

      if (error) {
        throw error
      }

      const result = pickRpcResult(data)
      return result
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: familyQueryKey(userId) }),
        queryClient.invalidateQueries({ queryKey: categoriesQueryKey(result.family_id) }),
        queryClient.invalidateQueries({ queryKey: expenseQueryKeys.all }),
      ])
    },
  })
}

// ─── Family invites (single-use ephemeral codes) ────────────────────
//
// Replace the persistent `families.code` model: instead of one
// long-lived family code anyone can join with, every invitation is
// a fresh single-use token with a 7-day TTL. Three RPCs:
//   • create_family_invite()       → owner / member generates a new code
//   • peek_family_invite(code)     → joiner previews the family (no insert)
//   • consume_family_invite(code, contribution) → join + mark code used

export interface FamilyInviteCreated {
  code: string
  expires_at: string
}

/** Generate a fresh single-use invite code for the caller's family.
 *  Returns the code + expiry timestamp. The code is **not persisted
 *  on the client** — it's surfaced once via the modal/sheet and
 *  forgotten; the user copies it and shares out-of-band. */
export function useCreateFamilyInvite() {
  return useMutation({
    mutationFn: async (): Promise<FamilyInviteCreated> => {
      const { data, error } = await supabase.rpc('create_family_invite')
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      if (!row || typeof row.code !== 'string') {
        throw new Error('No se pudo generar el código de invitación.')
      }
      return {
        code: row.code as string,
        expires_at: row.expires_at as string,
      }
    },
  })
}

/** Look up a family by its invite code without consuming the
 *  invite. Returns null `pendingFamily` if the code doesn't exist,
 *  is expired, or was already used. */
export function usePeekFamilyInvite() {
  return useMutation({
    mutationFn: async (rawCode: string) => {
      const normalized = rawCode.trim().toUpperCase()
      if (!normalized) {
        throw new Error('Ingresa un código de invitación válido.')
      }
      const { data, error } = await supabase.rpc('peek_family_invite', {
        p_code: normalized,
      })
      if (error) throw error
      if (!data) throw new Error('No se pudo consultar la familia.')
      return data as FamilyPeek
    },
  })
}

/** Consume a single-use invite code. Inserts the caller's
 *  `family_members` row (with the optional contribution) and marks
 *  the invite as used. Subsequent calls with the same code raise
 *  "Invite already used". */
export interface ConsumeFamilyInviteInput {
  code: string
  monthlyIncomeContribution?: number | null
}

export function useConsumeFamilyInvite(userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: ConsumeFamilyInviteInput) => {
      if (!userId) {
        throw new Error('No hay sesión activa para unirse a la familia.')
      }
      const normalized = input.code.trim().toUpperCase()
      if (!normalized) {
        throw new Error('Ingresa un código de invitación válido.')
      }
      const { data, error } = await supabase.rpc('consume_family_invite', {
        p_code: normalized,
        p_contribution: input.monthlyIncomeContribution ?? null,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      if (!row || typeof row.family_id !== 'string') {
        throw new Error('No se pudo unir a la familia.')
      }
      return { family_id: row.family_id as string }
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: familyQueryKey(userId) }),
        queryClient.invalidateQueries({ queryKey: categoriesQueryKey(result.family_id) }),
        queryClient.invalidateQueries({ queryKey: expenseQueryKeys.all }),
      ])
    },
  })
}

/** Read-only preview of a family looked up by an invite code.
 *  Trimmed by the 2026-05-10 hardening migration: per-member
 *  contribution amounts, goal amounts, cycle stats and the
 *  blocked flag are only available after `consume_family_invite`.
 *  The peek surfaces just enough for the joiner to confirm "is this
 *  the right family?" — names, avatars, the household income total,
 *  and the active goal title (no progress figures). */
export interface FamilyPeek {
  family_id: string
  family_code: string
  members: Array<{
    display_name: string
    avatar_animal: string | null
    role: string
  }>
  member_count: number
  monthly_income: number
  active_goal_title: string | null
  invite_expires_at: string
}

/**
 * Update the current user's `monthly_income_contribution`. Used from
 * Settings when a member adjusts their own income — the trigger
 * recomputes `family_finance.monthly_income` automatically.
 */
export function useUpdateMyIncomeContribution(
  userId?: string,
  familyId?: string,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (amount: number) => {
      if (!userId) {
        throw new Error('No hay sesión activa para actualizar tu aporte.')
      }
      const safe = Math.max(0, Number.isFinite(amount) ? amount : 0)
      const { data, error } = await supabase.rpc('update_my_income_contribution', {
        p_amount: safe,
      })
      if (error) throw error
      return typeof data === 'number' ? data : safe
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: familyQueryKey(userId) }),
        familyId
          ? queryClient.invalidateQueries({ queryKey: familyFinanceQueryKey(familyId) })
          : Promise.resolve(),
      ])
    },
  })
}

export function useLeaveCurrentFamily(userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error('No hay sesión activa para salir de la familia.')
      }

      const { data, error } = await supabase.rpc('leave_current_family')

      if (error) {
        throw error
      }

      return pickRpcResult(data)
    },
    onSuccess: async (result) => {
      // The `leave_current_family` RPC now resets
      // `onboarding_completed_at` atomically on the server (see
      // migration 20260426162741), so we only need to invalidate the
      // profile cache here so the local copy reflects that change
      // and the route guard in `/(app)/onboarding.tsx` re-enters
      // the wizard. `previously_onboarded` stays true on the server
      // so the rejoin copy surfaces.
      if (userId) {
        await queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) })
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: familyQueryKey(userId) }),
        queryClient.removeQueries({ queryKey: categoriesQueryKey(result.family_id) }),
        queryClient.removeQueries({ queryKey: expenseQueryKeys.family(result.family_id) }),
        queryClient.removeQueries({ queryKey: expenseQueryKeys.recentFamily(result.family_id) }),
        queryClient.removeQueries({ queryKey: expenseQueryKeys.total(result.family_id) }),
        queryClient.removeQueries({
          queryKey: expenseQueryKeys.periodTotalFamily(result.family_id),
        }),
        queryClient.removeQueries({
          queryKey: expenseQueryKeys.monthlySpentFamily(result.family_id),
        }),
        queryClient.removeQueries({ queryKey: familyFinanceQueryKey(result.family_id) }),
        queryClient.removeQueries({ queryKey: fixedExpenseQueryKeys.family(result.family_id) }),
        queryClient.removeQueries({ queryKey: notificationQueryKeys.family(result.family_id) }),
        queryClient.removeQueries({
          queryKey: pushSubscriptionQueryKey(result.family_id, userId),
        }),
      ])
    },
  })
}
