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
    creator_display_name: displayNames.get(row.created_by) ?? 'Sin nombre',
    price: Number(row.price),
  }))
}
