import { supabase } from '@/lib/supabase'
import {
  getCachedProfileDisplayName,
  setCachedProfileDisplayNames,
} from '@/lib/profile-display-name-cache'
import type {
  Expense,
  ProfileRow,
  RawExpense,
} from '@/features/expenses/expense-repository.model'

type EmbeddedProfile = { display_name: string }
type EmbedRow = RawExpense & {
  profiles?: EmbeddedProfile | EmbeddedProfile[] | null
}

function readEmbedDisplayName(
  profiles: EmbeddedProfile | EmbeddedProfile[] | null | undefined,
): string | null {
  if (!profiles) return null
  if (Array.isArray(profiles)) return profiles[0]?.display_name ?? null
  return profiles.display_name ?? null
}

/**
 * Single round-trip enrichment: when `loadExpenses` uses the embed
 * `profiles!expenses_created_by_profile_fkey(display_name)`, each row
 * arrives with a nested `profiles` payload. We flatten it into
 * `creator_display_name` and seed the cache so subsequent flows
 * (legacy fallback, recent expenses, recent activity) keep working
 * without an extra query.
 *
 * PostgREST may return `profiles` as an array (many-to-one default)
 * or a single object (when single-row inference applies). We accept
 * both via `readEmbedDisplayName`.
 */
export function enrichExpensesFromEmbed(rows: EmbedRow[]): Expense[] {
  const seed: ProfileRow[] = []
  for (const row of rows) {
    const name = readEmbedDisplayName(row.profiles)
    if (name) seed.push({ id: row.created_by, display_name: name })
  }
  if (seed.length > 0) setCachedProfileDisplayNames(seed)

  return rows.map((row) => ({
    category_id: row.category_id,
    commitment_id: typeof row.commitment_id === 'string' ? row.commitment_id : null,
    created_at: row.created_at,
    created_by: row.created_by,
    creator_display_name:
      readEmbedDisplayName(row.profiles) ??
      getCachedProfileDisplayName(row.created_by) ??
      'Sin nombre',
    description: row.description,
    // Normalize undefined → null so the consumer only branches on
    // null vs string (legacy snapshots without the column still
    // produce a usable shape).
    notes: typeof row.notes === 'string' ? row.notes : null,
    family_id: row.family_id,
    id: row.id,
    price: Number(row.price),
  }))
}

export async function enrichExpenses(rows: RawExpense[]): Promise<Expense[]> {
  const creatorIds = [...new Set(rows.map((row) => row.created_by))]
  const displayNames = new Map<string, string>()

  creatorIds.forEach((creatorId) => {
    const cachedDisplayName = getCachedProfileDisplayName(creatorId)
    if (cachedDisplayName) {
      displayNames.set(creatorId, cachedDisplayName)
    }
  })

  const missingCreatorIds = creatorIds.filter((creatorId) => !displayNames.has(creatorId))

  if (missingCreatorIds.length > 0) {
    const profilesResponse = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', missingCreatorIds)

    if (profilesResponse.error) {
      throw profilesResponse.error
    }

    const loadedProfiles = (profilesResponse.data as ProfileRow[] | null) ?? []
    setCachedProfileDisplayNames(loadedProfiles)

    loadedProfiles.forEach((profile) => {
      displayNames.set(profile.id, profile.display_name)
    })
  }

  return rows.map((row) => ({
    ...row,
    commitment_id: typeof row.commitment_id === 'string' ? row.commitment_id : null,
    notes: typeof row.notes === 'string' ? row.notes : null,
    creator_display_name: displayNames.get(row.created_by) ?? 'Sin nombre',
    price: Number(row.price),
  }))
}
