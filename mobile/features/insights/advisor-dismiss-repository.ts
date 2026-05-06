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
 * Upsert a dismissal: insert a new row, or update an existing one
 * by (user_id, signal_id). The upsert sets `dismissed_at` to now
 * and bumps `ignore_count`.
 *
 * The caller passes the NEXT ignore_count (computed from the prior
 * cached value plus debounce logic) so the server doesn't need to
 * read-then-write — it's a single round trip.
 */
export async function upsertAdvisorDismissal(input: {
  familyId: string
  userId: string
  signalId: string
  nextIgnoreCount: number
  dismissedAt: number
}): Promise<void> {
  const { familyId, userId, signalId, nextIgnoreCount, dismissedAt } = input
  const { error } = await supabase
    .from('advisor_signal_dismissals')
    .upsert(
      {
        family_id: familyId,
        user_id: userId,
        signal_id: signalId,
        dismissed_at: new Date(dismissedAt).toISOString(),
        ignore_count: nextIgnoreCount,
      },
      { onConflict: 'user_id,signal_id' },
    )

  if (error && !isMissingDismissTableError(error)) {
    throw error
  }
}

/**
 * Delete a dismissal — surfaces the signal again immediately. Used
 * by a future "reactivar señales" settings affordance; not currently
 * wired up but kept here so the data layer is complete.
 */
export async function deleteAdvisorDismissal(input: {
  userId: string
  signalId: string
}): Promise<void> {
  const { error } = await supabase
    .from('advisor_signal_dismissals')
    .delete()
    .eq('user_id', input.userId)
    .eq('signal_id', input.signalId)

  if (error && !isMissingDismissTableError(error)) {
    throw error
  }
}
