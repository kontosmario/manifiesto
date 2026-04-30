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

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { sendFamilyPush } from '@/lib/send-family-push'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'

const STORAGE_KEY = 'advisor-piped:v1'
/** Default minimum interval used when a signal has no specific entry. */
const DEFAULT_INTERVAL_HOURS = 18
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

// ─── Cooldown variable por familia de señal ─────────────────────────
//
// Push delivery is louder than the in-app feed — what's appropriate
// depends on the signal's nature. Cycle-mechanics warnings (velocity,
// recovery, payday) deserve a faster re-fire when the situation
// shifts; structural patterns (zombie, hike, weekly-pattern) should
// only fire once per behaviour cycle.
const COOLDOWN_HOURS: Record<string, number> = {
  // cycle mechanics — fast re-fire
  'velocity': 6,
  'recovery-hard': 6,
  'recovery-soft': 6,
  'payday-proximity': 8,
  'stress-week': 12,
  'start-splurge': 12,
  'end-acceleration': 12,
  // category — medium
  'cat-accel': 18,
  'cap': 18,
  'cat-dominance': 24,
  // pattern — slow
  'small-leaks': 36,
  'night-impulse': 48,
  'weekly-pattern': 72,
  // structural — slow
  'fijos-ratio': 48,
  'income-volatility': 48,
  'zombie': 72,
  'hike': 72,
  'undetected-sub': 72,
  'member-imbalance': 48,
  'savings-feasibility': 24,
  // P1 — atomic awareness
  'high-single-expense': 4,
  'duplicate': 12,
  'data-gap-warning': 48,
  'savings-milestone': 168,
  'cycle-start-projection': 36,
  'income-missing': 4,
  // P3 — causal patterns (no se pushean nunca, pero por consistencia)
  'causal-friday-cascade': 72,
  'causal-paired': 72,
  'causal-stress-spending': 72,
  // P1 — forecast
  'forecast-tomorrow-risk': 8,
  'forecast-storm-week': 12,
  'forecast-payday-gap': 6,
  // P1 — super-signals
  'super-perfect-storm': 12,
  'super-savings-momentum': 48,
  'super-hidden-drain': 72,
}

function cooldownHoursFor(signalId: string): number {
  if (COOLDOWN_HOURS[signalId] != null) return COOLDOWN_HOURS[signalId]
  for (const [key, hours] of Object.entries(COOLDOWN_HOURS)) {
    if (signalId.startsWith(`${key}-`)) return hours
  }
  return DEFAULT_INTERVAL_HOURS
}

/**
 * Quiet hours filter — block push delivery between 22:00 and 08:00
 * local time. The in-app notifications still get inserted (silent)
 * so the feed reflects the signal next time the user opens the app,
 * but no push wakes the device at night.
 */
function isQuietHour(now: Date): boolean {
  const h = now.getHours()
  return h >= 22 || h < 8
}

/**
 * Each signal has two independent timers: one for the in-app feed
 * insert and one for the push delivery. Splitting them prevents a
 * signal that first becomes eligible during quiet hours from being
 * permanently silenced — the insert lands, but `pushedAt` stays
 * untouched so the push can still fire on the next eligible window.
 */
interface PipedEntry {
  insertedAt: number
  pushedAt: number
}
type PipedMap = Record<string, PipedEntry>

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
    for (const [id, value] of Object.entries(parsed)) {
      // Migrate v1 (number) → v2 (entry) by treating the legacy
      // timestamp as both insertedAt and pushedAt.
      if (typeof value === 'number' && Number.isFinite(value)) {
        if (now - value < 30 * DAY_MS) {
          next[id] = { insertedAt: value, pushedAt: value }
        }
        continue
      }
      if (value && typeof value === 'object') {
        const v = value as { insertedAt?: unknown; pushedAt?: unknown }
        const insertedAt =
          typeof v.insertedAt === 'number' && Number.isFinite(v.insertedAt)
            ? v.insertedAt
            : 0
        const pushedAt =
          typeof v.pushedAt === 'number' && Number.isFinite(v.pushedAt)
            ? v.pushedAt
            : 0
        const newest = Math.max(insertedAt, pushedAt)
        if (newest > 0 && now - newest < 30 * DAY_MS) {
          next[id] = { insertedAt, pushedAt }
        }
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

function shouldInsert(signalId: string): boolean {
  const entry = cache[signalId]
  if (!entry) return true
  return Date.now() - entry.insertedAt >= cooldownHoursFor(signalId) * HOUR_MS
}

function shouldPush(signalId: string): boolean {
  const entry = cache[signalId]
  if (!entry) return true
  return Date.now() - entry.pushedAt >= cooldownHoursFor(signalId) * HOUR_MS
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
  useEffect(() => {
    if (!familyId || !userId) return
    if (signals.length === 0) return

    let cancelled = false

    async function run() {
      await hydrate()
      if (cancelled) return

      // High-urgency + reliable signals are the only ones that ever
      // touch the feed/push. Everything else stays inside the screen.
      const eligible = signals.filter(
        (s) => s.urgency === 'alta' && s.confidence >= 0.7,
      )
      // Track per-signal which side of the pipeline still has budget;
      // a signal might be due for its first push without needing a
      // second feed insert (or vice versa).
      const work = eligible
        .map((s) => ({
          signal: s,
          insert: shouldInsert(s.id),
          push:
            s.confidence >= 0.85 &&
            !isQuietHour(new Date()) &&
            shouldPush(s.id),
        }))
        .filter((w) => w.insert || w.push)
      if (work.length === 0) return

      const now = Date.now()
      const nextCache = { ...cache }

      await Promise.allSettled(
        work.map(async ({ signal: task, insert, push }) => {
          const kind = `advisor_${task.id.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()}`
          const insertPromise = insert
            ? supabase.from('notifications').insert({
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
            : Promise.resolve()

          const pushPromise = push
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

          const prev = nextCache[task.id] ?? { insertedAt: 0, pushedAt: 0 }
          nextCache[task.id] = {
            insertedAt: insert ? now : prev.insertedAt,
            pushedAt: push ? now : prev.pushedAt,
          }
        }),
      )

      cache = nextCache
      await persist()
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [signals, familyId, userId])
}
