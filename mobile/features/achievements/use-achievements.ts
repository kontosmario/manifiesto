import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Achievement system — types + read hooks + realtime unlock listener.
 *
 * Schema (migration `20260520000000_achievements.sql`):
 *   - `achievements_catalog`  (code, title, body, icon, tier, sort_order)
 *   - `achievements_earned`   (user_id, code, family_id, earned_at, context)
 *
 * Detection lives entirely server-side via triggers on `expenses`,
 * `fixed_expenses`, `fixed_expense_payments`, `user_streaks`,
 * `savings_goals`, `monthly_summaries`. The client never calls
 * `award_achievement` directly — that grant is locked to service_role
 * only (lockdown migration 20260520010000). The client only READS the
 * earned table to render the gallery + subscribes to realtime inserts
 * to celebrate fresh unlocks.
 */

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'legendary'

export interface AchievementCatalogEntry {
  code: string
  title: string
  body: string
  icon: string
  tier: AchievementTier
  sort_order: number
}

export interface AchievementEarnedRow {
  user_id: string
  code: string
  family_id: string | null
  earned_at: string
  context: Record<string, unknown> | null
}

/** Merged "view-model" — one row per catalog entry, plus the unlock
 *  timestamp when earned. Locked entries keep `earned_at = null`. */
export interface AchievementViewItem extends AchievementCatalogEntry {
  earned: boolean
  earned_at: string | null
  context: Record<string, unknown> | null
}

export interface AchievementsSummary {
  items: AchievementViewItem[]
  earnedCount: number
  totalCount: number
}

export const achievementsCatalogQueryKey = ['achievements', 'catalog'] as const
export const achievementsEarnedQueryKey = (userId?: string) =>
  ['achievements', 'earned', userId ?? null] as const

async function fetchCatalog(): Promise<AchievementCatalogEntry[]> {
  const { data, error } = await supabase
    .from('achievements_catalog')
    .select('code, title, body, icon, tier, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data as AchievementCatalogEntry[] | null) ?? []
}

async function fetchEarned(userId: string): Promise<AchievementEarnedRow[]> {
  const { data, error } = await supabase
    .from('achievements_earned')
    .select('user_id, code, family_id, earned_at, context')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false })
  if (error) throw error
  return (data as AchievementEarnedRow[] | null) ?? []
}

/**
 * Returns the full catalog + the user's earned state merged into a
 * single sorted list (locked items keep their sort_order; earned ones
 * are flagged + carry their earned_at).
 *
 * The catalog has long staleTime (10 min) because it almost never
 * changes — defined in the DB. Earned is shorter (1 min) plus a
 * realtime listener (separate hook) that invalidates on insert.
 */
export function useAchievements(userId?: string): {
  data: AchievementsSummary | null
  isLoading: boolean
  error: unknown
} {
  const catalogQuery = useQuery({
    queryKey: achievementsCatalogQueryKey,
    queryFn: fetchCatalog,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  })
  const earnedQuery = useQuery({
    queryKey: achievementsEarnedQueryKey(userId),
    queryFn: () => fetchEarned(userId!),
    enabled: Boolean(userId),
    staleTime: 60_000,
  })

  const catalog = catalogQuery.data
  const earned = earnedQuery.data

  if (!catalog) {
    return {
      data: null,
      isLoading: catalogQuery.isLoading || earnedQuery.isLoading,
      error: catalogQuery.error ?? earnedQuery.error ?? null,
    }
  }

  const earnedByCode = new Map<string, AchievementEarnedRow>()
  for (const row of earned ?? []) earnedByCode.set(row.code, row)

  const items: AchievementViewItem[] = catalog.map((entry) => {
    const row = earnedByCode.get(entry.code)
    return {
      ...entry,
      earned: Boolean(row),
      earned_at: row?.earned_at ?? null,
      context: row?.context ?? null,
    }
  })

  return {
    data: {
      items,
      earnedCount: earnedByCode.size,
      totalCount: catalog.length,
    },
    isLoading: catalogQuery.isLoading || earnedQuery.isLoading,
    error: catalogQuery.error ?? earnedQuery.error ?? null,
  }
}

/**
 * Subscribe to realtime inserts on `achievements_earned` filtered by
 * the current user_id. When a new row arrives, fires `onUnlock` with
 * the merged view item (so the caller can pop a celebration modal
 * without re-fetching) and invalidates the earned query so the
 * gallery refreshes.
 *
 * Mount once in the app shell (or a screen high enough that it's
 * always alive during the user's session). Multiple mounts would
 * fire the callback multiple times per event.
 */
export function useAchievementUnlocks(
  userId: string | undefined,
  onUnlock: (item: AchievementViewItem) => void,
) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`achievements:user:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'achievements_earned',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as AchievementEarnedRow
          // Look up the catalog entry to compose the view item. Read
          // from the cached catalog query first (synchronous; the
          // gallery probably populated it already). If absent, fetch
          // catalog lazily — only happens on a cold device where the
          // unlock arrives before the gallery is opened.
          const cached = queryClient.getQueryData<AchievementCatalogEntry[]>(
            achievementsCatalogQueryKey,
          )
          const finalize = (catalog: AchievementCatalogEntry[]) => {
            const entry = catalog.find((e) => e.code === row.code)
            if (!entry) return // Unknown code (race with new catalog row) — skip
            onUnlock({
              ...entry,
              earned: true,
              earned_at: row.earned_at,
              context: row.context,
            })
            // Invalidate so the gallery re-fetches and reflects the
            // new earned state.
            void queryClient.invalidateQueries({
              queryKey: achievementsEarnedQueryKey(userId),
            })
          }
          if (cached) {
            finalize(cached)
          } else {
            void fetchCatalog().then((catalog) => {
              queryClient.setQueryData(achievementsCatalogQueryKey, catalog)
              finalize(catalog)
            })
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, onUnlock, queryClient])
}
