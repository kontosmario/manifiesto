// Pipe high-priority advisor signals into the in-app notification
// feed and (optionally) trigger a push delivery via the existing
// `send-family-push` Edge Function.
//
// Why client-side: the signal engine runs on local data with React
// Query state; reproducing it server-side would require duplicating
// the rules in SQL/Edge. As long as the user opens the Control v2
// screen at least occasionally, the most actionable signals get
// surfaced into the feed and pushed out.
//
// What this DOES:
//  - For tasks with `urgency === 'alta'` AND `confidence >= 0.7`,
//    insert one notification row per signal id, scoped to the
//    current user, with `kind = 'advisor_<signalId>'`.
//  - For tasks with `urgency === 'alta'` AND `confidence >= 0.85`,
//    also fire-and-forget `sendFamilyPush()` to wake the device.
//  - De-dup via SecureStore: a given signal id is piped at most
//    once per `MIN_INTERVAL_HOURS` window per device.
//
// What this does NOT do:
//  - It does not pipe `media`/`baja` signals (avoid feed noise).
//  - It does not run when no familyId/userId is available.
//  - It does not retry on insert failure (the next render will).

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { sendFamilyPush } from '@/lib/send-family-push'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'

const STORAGE_KEY = 'advisor-piped:v1'
/** Don't re-pipe the same signal id within this many hours. */
const MIN_INTERVAL_HOURS = 18
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

type PipedMap = Record<string, number> // signalId → epochMs

let cache: PipedMap = {}
let hydrated = false

async function hydrate(): Promise<void> {
  if (hydrated) return
  hydrated = true
  try {
    const raw = await getPersistentValue(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const now = Date.now()
    const next: PipedMap = {}
    for (const [id, ts] of Object.entries(parsed)) {
      if (typeof ts === 'number' && Number.isFinite(ts)) {
        // Drop entries older than 30 days to keep blob small.
        if (now - ts < 30 * DAY_MS) next[id] = ts
      }
    }
    cache = next
  } catch {
    // Corrupt JSON — start fresh.
  }
}

async function persist(): Promise<void> {
  try {
    await setPersistentValue(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // Best-effort.
  }
}

function shouldPipe(signalId: string): boolean {
  const last = cache[signalId]
  if (last == null) return true
  return Date.now() - last >= MIN_INTERVAL_HOURS * HOUR_MS
}

interface SyncArgs {
  signals: ControlAdvisorTask[]
  familyId: string | null | undefined
  userId: string | null | undefined
}

/**
 * Side-effecting hook. Mounts in the Control v2 screen; each time the
 * signals list changes, evaluates which ones to pipe and fires the
 * inserts + pushes. No return value — the in-app feed picks up the
 * new rows via its own realtime subscription.
 */
export function useAdvisorNotificationSync({
  signals,
  familyId,
  userId,
}: SyncArgs): void {
  // Avoid running on the first render before hydration completes.
  const ranOnceRef = useRef(false)

  useEffect(() => {
    if (!familyId || !userId) return
    if (signals.length === 0) return

    let cancelled = false

    async function run() {
      await hydrate()
      if (cancelled) return

      // Filter to high-confidence + high-urgency only. Skip already-
      // piped within the cool-down window.
      const candidates = signals.filter(
        (s) =>
          s.urgency === 'alta' &&
          s.confidence >= 0.7 &&
          shouldPipe(s.id),
      )
      if (candidates.length === 0) return

      // Insert rows in parallel; mark as piped optimistically.
      const now = Date.now()
      const next = { ...cache }
      for (const t of candidates) next[t.id] = now
      cache = next
      await persist()

      await Promise.allSettled(
        candidates.map(async (task) => {
          const kind = `advisor_${task.id.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()}`
          const insertPromise = supabase.from('notifications').insert({
            family_id: familyId,
            user_id: userId,
            title: task.title,
            body: task.body,
            kind,
            severity: 'warning',
            metadata: {
              source: 'control-advisor',
              signal_id: task.id,
              category: task.cat,
              impact_raw: task.impactRaw,
              cta: task.cta,
              confidence: task.confidence,
              data_days: task.dataDays,
              route: '/(app)/(tabs)/control',
            },
          })

          // Push delivery for very-high-confidence tasks only — keeps
          // the push-quota tight (advisor usually surfaces 1-3
          // alta-urgencia signals per cycle).
          const pushPromise =
            task.confidence >= 0.85
              ? sendFamilyPush({
                  familyId: familyId!,
                  title: task.title,
                  body: task.body,
                  kind,
                  url: '/(app)/(tabs)/control',
                }).catch(() => {
                  // Push delivery is best-effort; in-app feed still
                  // has the row.
                })
              : Promise.resolve()

          await Promise.allSettled([insertPromise, pushPromise])
        }),
      )

      ranOnceRef.current = true
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [signals, familyId, userId])
}
