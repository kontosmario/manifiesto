// Tab-bar visibility heuristic for the advisor.
//
// Returns `true` when the user has unseen high-priority advisor
// signals — i.e. there's at least one task in the engine output with
// `urgency === 'alta'` AND the user hasn't visited Control within
// the freshness window.
//
// Wraps `useControlV2Data` (which is already React-Query cached) so
// calling this from the tab bar costs only re-renders, not network.

import { useMemo } from 'react'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useFamily } from '@/features/family/use-family'
import { useControlV2Data } from '@/features/insights/use-control-v2-data'
import {
  useLastControlVisit,
  VISIT_FRESHNESS_HOURS,
} from '@/features/insights/control-visit-store'

const HOUR_MS = 60 * 60 * 1000

interface AdvisorBadgeState {
  /** True when the badge dot should render on the Control tab. */
  show: boolean
  /** Count of `alta`-urgency signals (for diagnostics; not rendered). */
  altaCount: number
}

export function useAdvisorBadge(): AdvisorBadgeState {
  const sessionQuery = useAuthSession()
  const userId = sessionQuery.data?.user.id
  const familyQuery = useFamily(userId)
  const familyId = familyQuery.data?.familyId
  // userId → `signals` ya viene filtrado por blocklist + dismissed (no
  // contamos el dot por señales bloqueadas/descartadas). `signalsReady`
  // evita prender el dot con datos sin filtrar (flash). Deduped con las
  // demás llamadas a useControlV2Data.
  const { signals, signalsReady } = useControlV2Data(familyId ?? '', userId)
  const lastVisit = useLastControlVisit()

  return useMemo<AdvisorBadgeState>(() => {
    if (!familyId || !signalsReady) return { show: false, altaCount: 0 }
    const altaCount = signals.filter((s) => s.urgency === 'alta').length
    if (altaCount === 0) return { show: false, altaCount: 0 }
    if (lastVisit == null) return { show: true, altaCount }
    const fresh = Date.now() - lastVisit < VISIT_FRESHNESS_HOURS * HOUR_MS
    return { show: !fresh, altaCount }
  }, [familyId, signalsReady, signals, lastVisit])
}
