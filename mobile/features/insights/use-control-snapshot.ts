// Hook that consumes the materialised `control_snapshot()` RPC.
//
// The RPC is populated by the DB-side compute helper introduced in
// migration 20260512030000_control_snapshot_table_and_rpc.sql. It
// returns a pre-computed JSONB blob with 8 keys. `recommended_actions`
// is an intentional empty-array placeholder — the compute helper does
// not populate it yet; we expose it typed but don't act on it.
//
// Pattern mirrors `use-home-snapshot.ts` (queryKey factory + bare
// fetcher + hook with staleTime/gcTime).

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────

export interface OverBudgetCategoryRow {
  category_id: string
  monthly_cap: number
  spent: number
  ratio: number
}

export interface ZombieCandidateRow {
  fixed_expense_id: string
  name: string
  amount: number
  last_used_at: string | null
}

export interface MemberPressureRow {
  user_id: string
  total: number
}

export interface ControlSnapshot {
  family_id: string
  forecast_close_amount: number | null
  forecast_overshoot_pct: number | null
  over_budget_categories: OverBudgetCategoryRow[]
  zombie_candidates: ZombieCandidateRow[]
  member_pressure: MemberPressureRow[]
  /** Intentionally empty placeholder — compute helper not yet populating this. */
  recommended_actions: unknown[]
  computed_at: string
}

// ─── Query key ────────────────────────────────────────────────────────

// userId va en la key para que la cache se invalide correctamente
// cuando cambia la sesión (logout/login con otra cuenta).
export const controlSnapshotKey = (userId?: string) =>
  ['control-snapshot', userId] as const

// ─── Fetcher ──────────────────────────────────────────────────────────

/**
 * Bare fetcher — calls `control_snapshot()` RPC and returns the typed
 * payload. Returns `null` on any error (do not throw) so callers can
 * treat the snapshot as an optional enrichment and fall back gracefully.
 */
export async function fetchControlSnapshot(): Promise<ControlSnapshot | null> {
  const { data, error } = await supabase.rpc('control_snapshot')
  if (error) {
    // Tolerate the RPC not existing yet (migration not applied in this
    // environment) or any transient error — consumers must handle null.
    return null
  }
  if (!data) return null
  return data as ControlSnapshot
}

// ─── Hook ─────────────────────────────────────────────────────────────

/**
 * Loads the materialised `control_snapshot` for the authenticated
 * user's family. Returns `null` while loading or on error.
 *
 * Cache tuned for a pre-computed snapshot: 5-minute staleTime so
 * navigation between tabs doesn't re-fetch aggressively, 30-minute
 * gcTime to keep it warm in memory for the full session.
 *
 * **Auth gate:** la RPC requiere `auth.uid()` server-side. Si fires
 * antes que la session se hidrate en el supabase client (race en web
 * sobre todo, donde la session vive en memory), la RPC tira
 * `raise exception 'No session'` → 400 → react-query retiene → cascada
 * de re-renders. Por eso gateamos con `enabled: !!userId` y
 * desactivamos retry para esta condición transitoria.
 */
export function useControlSnapshot(userId?: string) {
  return useQuery<ControlSnapshot | null>({
    queryKey: controlSnapshotKey(userId),
    queryFn: fetchControlSnapshot,
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    // 'No session' es transitorio (auth aún no hidratada) o
    // estructural (RPC no aplicada en este env): retry no ayuda y
    // genera ruido (3× POST + cascada de re-renders).
    retry: false,
  })
}
