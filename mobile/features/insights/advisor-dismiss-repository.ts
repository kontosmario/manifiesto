import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// ─── Server-side advisor signal dismissals ─────────────────────────
//
// Backed by the `advisor_signal_dismissals` table. Each row is one
// (user_id, signal_id) pair — the unique constraint guarantees a
// single live dismissal per signal per user.
//
// TTL/escalation lives on the client (control-dismiss-store.ts).
// This repo only persists/reads the raw record.

export interface AdvisorDismissalRow {
  signalId: string
  dismissedAt: number // epoch ms
  ignoreCount: number
}

interface RawRow {
  signal_id: string
  dismissed_at: string
  ignore_count: number
}

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])

export function isMissingDismissTableError(error: PostgrestError): boolean {
  const code = error.code ?? ''
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  return (
    MISSING_TABLE_CODES.has(code) ||
    text.includes('advisor_signal_dismissals') &&
      (text.includes('does not exist') || text.includes('schema cache'))
  )
}

function rowToEntry(row: RawRow): AdvisorDismissalRow {
  return {
    signalId: row.signal_id,
    dismissedAt: new Date(row.dismissed_at).getTime(),
    ignoreCount: row.ignore_count,
  }
}

/**
 * Fetch all dismissal rows for the current user.
 *
 * Returns `[]` when the table doesn't exist yet (fresh DB without
 * the migration applied) — the caller treats that as "nothing
 * dismissed", which keeps the asistente functional during rollout.
 */
export async function fetchAdvisorDismissals(
  userId: string,
): Promise<AdvisorDismissalRow[]> {
  const { data, error } = await supabase
    .from('advisor_signal_dismissals')
    .select('signal_id, dismissed_at, ignore_count')
    .eq('user_id', userId)

  if (error) {
    if (isMissingDismissTableError(error)) return []
    throw error
  }

  return ((data as RawRow[] | null) ?? []).map(rowToEntry)
}

/**
 * Dismiss a signal. Goes through the `dismiss_advisor_signal`
 * SECURITY DEFINER RPC (security hardening 2026-05-11): direct
 * INSERT/UPDATE on `advisor_signal_dismissals` is denied by RLS.
 * The RPC bumps `ignore_count` on conflict and sets `dismissed_at`
 * server-side (clock authoritative), enforces a per-user rate limit
 * (60/min), and validates active membership.
 *
 * `nextIgnoreCount` and `dismissedAt` from the previous client-driven
 * shape are no longer used — the server owns both — but the
 * parameter shape is preserved so callers don't need to change.
 */
export async function upsertAdvisorDismissal(input: {
  familyId: string
  userId: string
  signalId: string
  nextIgnoreCount: number
  dismissedAt: number
}): Promise<void> {
  const { error } = await supabase.rpc('dismiss_advisor_signal', {
    p_family_id: input.familyId,
    p_signal_id: input.signalId,
  })

  if (error && !isMissingDismissTableError(error)) {
    throw error
  }
}

