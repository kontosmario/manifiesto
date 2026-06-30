import { useMutation, useQueryClient } from '@tanstack/react-query'
import { categoriesQueryKey } from '@/features/categories/use-categories'
import { expenseQueryKeys } from '@/features/expenses/expense-query-keys'
import { familyFinanceQueryKey } from '@/features/finance/use-family-finance'
import { profileQueryKey } from '@/features/profile/use-profile'
import { supabase } from '@/lib/supabase'
import { familyQueryKey } from '@/features/family/use-family'
import { familyMembersKey } from '@/features/family/use-family-members'
import { familyMembersDetailKey } from '@/features/family/use-family-members-detail'
import { familyAdminMemberStatsQueryKey } from '@/features/family/use-family-admin'
import { homeSnapshotQueryKey } from '@/features/home/home-snapshot-query-keys'
import { entitlementQueryKey } from '@/features/billing/use-entitlement'
import type { AccountKind } from '@/features/family/account-kind'
import i18n from '@/lib/i18n'

interface FamilyRpcResult {
  family_id: string
}

function pickRpcResult(data: unknown): FamilyRpcResult {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(i18n.t('settings:familyActions.noFamilyFromSupabase'))
  }

  return data[0] as FamilyRpcResult
}

export function useBootstrapFamily(userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error(i18n.t('settings:familyActions.noSessionCreate'))
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
        // El entitlement se resuelve con la familia (trial nuevo o cobertura del
        // hogar). Sin esto, el snapshot BLOCKED cacheado durante la ventana
        // sin-familia del reset quedaba pegado (staleTime 60s) y el paywall duro
        // no se soltaba.
        queryClient.invalidateQueries({ queryKey: entitlementQueryKey(userId) }),
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
        throw new Error(i18n.t('settings:familyActions.couldNotGenerateCode'))
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
        throw new Error(i18n.t('settings:familyActions.invalidInviteCode'))
      }
      const { data, error } = await supabase.rpc('peek_family_invite', {
        p_code: normalized,
      })
      if (error) throw error
      if (!data) throw new Error(i18n.t('settings:familyActions.couldNotPeekFamily'))
      return data as FamilyPeek
    },
  })
}

/** Consume a single-use invite code. Inserts the caller's
 *  `family_members` row (with the optional contribution) and marks
 *  the invite as used. Subsequent calls with the same code raise the
 *  generic "Invalid invite" message (Sprint P · Audit #9 P-8 collapsed
 *  the previously-distinct not-found / already-used / expired / owner-
 *  pending-deletion branches into one). */
export interface ConsumeFamilyInviteInput {
  code: string
  monthlyIncomeContribution?: number | null
}

export function useConsumeFamilyInvite(userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: ConsumeFamilyInviteInput) => {
      if (!userId) {
        throw new Error(i18n.t('settings:familyActions.noSessionJoin'))
      }
      const normalized = input.code.trim().toUpperCase()
      if (!normalized) {
        throw new Error(i18n.t('settings:familyActions.invalidInviteCode'))
      }
      const { data, error } = await supabase.rpc('consume_family_invite', {
        p_code: normalized,
        p_contribution: input.monthlyIncomeContribution ?? null,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      if (!row || typeof row.family_id !== 'string') {
        throw new Error(i18n.t('settings:familyActions.couldNotJoin'))
      }
      return { family_id: row.family_id as string }
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: familyQueryKey(userId) }),
        queryClient.invalidateQueries({ queryKey: categoriesQueryKey(result.family_id) }),
        queryClient.invalidateQueries({ queryKey: expenseQueryKeys.all }),
        // El entitlement se resuelve con la familia (trial nuevo o cobertura del
        // hogar). Sin esto, el snapshot BLOCKED cacheado durante la ventana
        // sin-familia del reset quedaba pegado (staleTime 60s) y el paywall duro
        // no se soltaba.
        queryClient.invalidateQueries({ queryKey: entitlementQueryKey(userId) }),
      ])
    },
  })
}

/** Read-only preview of a family looked up by an invite code.
 *  Trimmed by the 2026-05-10 hardening migration: per-member
 *  contribution amounts, goal amounts, cycle stats and the
 *  blocked flag are only available after `consume_family_invite`.
 *  The peek surfaces just enough for the joiner to confirm "is this
 *  the right family?" — names, avatars + member count only. NO se expone
 *  información financiera de la familia (ingreso / meta) a un no-miembro con
 *  un código de invite (security hardening audit 2026-06-30). */
export interface FamilyPeek {
  family_id: string
  family_code: string
  members: Array<{
    display_name: string
    avatar_animal: string | null
    role: string
  }>
  member_count: number
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
        throw new Error(i18n.t('settings:familyActions.noSessionUpdateContribution'))
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
        throw new Error(i18n.t('settings:familyActions.noSessionLeave'))
      }

      const { data, error } = await supabase.rpc('leave_current_family')

      if (error) {
        throw error
      }

      return pickRpcResult(data)
    },
    onSuccess: async (_result) => {
      // The `leave_current_family` RPC resets `onboarding_completed_at`
      // atomically on the server (migración 20260426162741); el client
      // sólo invalida `profile` para que el route guard de
      // `/(app)/onboarding.tsx` re-entre al wizard.
      if (userId) {
        await queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) })
      }

      // Code review H7 (sprint A, 2026-06-08): el set previo de 9
      // removeQueries dejaba caches huérfanos para home_snapshot,
      // gastos-* RPCs, control snapshots, savings, streaks, family
      // members, income, etc. Cualquier query con datos de la familia
      // anterior podía surface durante el bootstrap de la nueva.
      // Solución: purgar TODO el cache excepto `auth`, mismo predicate
      // que usa `useAuthSession` en SIGN_OUT (que es el otro path
      // similar). Más simple y seguro que listar key por key.
      queryClient.removeQueries({
        predicate: (q) => q.queryKey[0] !== 'auth',
      })
    },
  })
}

/** Setea families.kind ('solo'|'shared') para la familia del caller
 *  (owner-only en el backend). Usado por el onboarding del modo solo
 *  justo después de bootstrap_family(). Invalida la cache de familia. */
export function useSetFamilyKind(userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (kind: AccountKind) => {
      const { data, error } = await supabase.rpc('set_family_kind', { p_kind: kind })
      if (error) throw error
      return (typeof data === 'string' ? data : kind) as AccountKind
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: familyQueryKey(userId) })
    },
  })
}

/** Owner-only: convierte la familia a modo solo (familia invisible de 1).
 *  Quita a los demás miembros en el backend (vuelven a onboardear) y deja
 *  kind='solo'. El owner CONSERVA sus datos — por eso solo invalidamos
 *  (no removeQueries) lo que cambió: tipo de cuenta, miembros, ingreso. */
export function useConvertToSolo(userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('convert_family_to_solo')
      if (error) throw error
      return pickRpcResult(data)
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: familyQueryKey(userId) }),
        queryClient.invalidateQueries({ queryKey: familyMembersKey(result.family_id) }),
        queryClient.invalidateQueries({ queryKey: familyMembersDetailKey(result.family_id) }),
        queryClient.invalidateQueries({ queryKey: familyAdminMemberStatsQueryKey }),
        queryClient.invalidateQueries({ queryKey: familyFinanceQueryKey(result.family_id) }),
        queryClient.invalidateQueries({ queryKey: homeSnapshotQueryKey(userId) }),
      ])
    },
  })
}

/** Soltero → Familia: pasa el espacio a kind='shared' (no destructivo).
 *  Reusa la RPC set_family_kind. Invalida tipo de cuenta + home snapshot
 *  para que aparezca la UI de familia. */
export function useConvertToFamily(userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('set_family_kind', { p_kind: 'shared' as AccountKind })
      if (error) throw error
      return (typeof data === 'string' ? data : 'shared') as AccountKind
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: familyQueryKey(userId) }),
        queryClient.invalidateQueries({ queryKey: homeSnapshotQueryKey(userId) }),
      ])
    },
  })
}
