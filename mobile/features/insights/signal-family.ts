// Pure helper: collapse a full `signalId` to a stable `signalFamily`
// token. Lives in its own module so consumers (the signal builder, the
// blocklist hook, the persona engine, tests) can import it without
// dragging in the supabase client.
//
// Convention: dynamic ids carry a payload after a dash (`zombie-<id>`,
// `cap-<cat>-<level>`). We collapse those to the prefix; static ids
// return themselves.

const PREFIXES = [
  'cat-dominance-',
  'undetected-sub-',
  'member-imbalance-',
  'duplicate-',
  'causal-',
  'sub-usage-',
  'zombie-',
  'hike-',
  'cap-',
] as const

export function signalFamilyOf(signalId: string): string {
  for (const p of PREFIXES) {
    if (signalId.startsWith(p)) return p.replace(/-$/, '')
  }
  return signalId
}

// ─── Pure aggregator (interaction stats) ────────────────────────────
//
// Lives here alongside `signalFamilyOf` because both are pure helpers
// consumed across the cognitive layer (and by tests) without needing
// the supabase client. The query hook in `use-interaction-stats.ts`
// re-exports both so legacy callers don't break.

export interface SignalFamilyStats {
  shown: number
  acted: number
  dismissed: number
  ctr: number
  medianTimeToActionMs: number | null
  lastSeenAt: string | null
}

export interface InteractionStats {
  perFamily: Record<string, SignalFamilyStats>
  overall: {
    totalShown: number
    totalActed: number
    overallCtr: number
  }
}

interface InteractionRow {
  signal_family: string
  outcome: string
  time_to_action_ms: number | null
  created_at: string
}

const EMPTY_STATS: InteractionStats = {
  perFamily: {},
  overall: { totalShown: 0, totalActed: 0, overallCtr: 0 },
}

export function aggregateInteractionStats(
  rows: readonly InteractionRow[],
): InteractionStats {
  if (rows.length === 0) return EMPTY_STATS

  const buckets = new Map<string, {
    shown: number
    acted: number
    dismissed: number
    timesToAction: number[]
    lastSeenAt: string | null
  }>()

  let totalShown = 0
  let totalActed = 0

  for (const r of rows) {
    let b = buckets.get(r.signal_family)
    if (!b) {
      b = { shown: 0, acted: 0, dismissed: 0, timesToAction: [], lastSeenAt: null }
      buckets.set(r.signal_family, b)
    }
    if (r.outcome === 'shown_only' || r.outcome === 'acted' || r.outcome === 'dismissed') {
      b.shown++
      totalShown++
    }
    if (r.outcome === 'acted') {
      b.acted++
      totalActed++
      if (r.time_to_action_ms != null && r.time_to_action_ms >= 0) {
        b.timesToAction.push(r.time_to_action_ms)
      }
    }
    if (r.outcome === 'dismissed') b.dismissed++
    if (!b.lastSeenAt || r.created_at > b.lastSeenAt) b.lastSeenAt = r.created_at
  }

  const perFamily: Record<string, SignalFamilyStats> = {}
  for (const [family, b] of buckets) {
    const ctr = b.shown > 0 ? Math.min(1, b.acted / b.shown) : 0
    let medianTimeToActionMs: number | null = null
    if (b.timesToAction.length > 0) {
      const sorted = [...b.timesToAction].sort((a, c) => a - c)
      medianTimeToActionMs = sorted[Math.floor(sorted.length / 2)]
    }
    perFamily[family] = {
      shown: b.shown,
      acted: b.acted,
      dismissed: b.dismissed,
      ctr,
      medianTimeToActionMs,
      lastSeenAt: b.lastSeenAt,
    }
  }

  return {
    perFamily,
    overall: {
      totalShown,
      totalActed,
      overallCtr: totalShown > 0 ? Math.min(1, totalActed / totalShown) : 0,
    },
  }
}

export const EMPTY_INTERACTION_STATS = EMPTY_STATS
