// Trigger push delivery for high-priority advisor signals.
//
// PRIOR BEHAVIOUR (removed): this hook also inserted notification
// rows into the `notifications` table so advisor signals showed up
// in the regular notifications feed. That created the "mixing"
// problem — the user wanted asistente notifications kept INSIDE the
// asistente surface only. The asistente screen reads its signals
// directly from `useControlV2Data` and tracks dismissals via the
// new server-side `advisor_signal_dismissals` table; piping into
// the generic feed was redundant duplication.
//
// CURRENT BEHAVIOUR:
//  - For tasks with `urgency === 'alta'` AND `confidence >= 0.85`,
//    fire-and-forget `sendFamilyPush()` to wake the device. The
//    push system writes to the user's APNs/FCM token directly via
//    the `send-family-push` Edge Function — no notification row
//    inserted, no feed pollution.
//  - De-dup via SecureStore: a given signal id pushes at most once
//    per `MIN_INTERVAL_HOURS` window per device.
//  - In-app feed never receives advisor rows. Users see signals
//    only on the asistente screen.

import { useEffect } from 'react'
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
 * Push delivery cooldown tracker. Single timestamp per signal id —
 * the previous version also tracked `insertedAt` for the in-app
 * feed insert, but that path was removed (see header comment).
 */
interface PipedEntry {
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
      // Legacy v1 stored a single number; legacy v2 stored
      // {insertedAt, pushedAt}. Both collapse to the new {pushedAt}
      // shape — we take the newest timestamp from whichever shape
      // we find and use it as `pushedAt`.
      let pushedAt = 0
      if (typeof value === 'number' && Number.isFinite(value)) {
        pushedAt = value
      } else if (value && typeof value === 'object') {
        const v = value as { insertedAt?: unknown; pushedAt?: unknown }
        const ia =
          typeof v.insertedAt === 'number' && Number.isFinite(v.insertedAt)
            ? v.insertedAt
            : 0
        const pa =
          typeof v.pushedAt === 'number' && Number.isFinite(v.pushedAt)
            ? v.pushedAt
            : 0
        pushedAt = Math.max(ia, pa)
      }
      if (pushedAt > 0 && now - pushedAt < 30 * DAY_MS) {
        next[id] = { pushedAt }
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

      // Only high-confidence + high-urgency signals trigger a push.
      // Everything else lives inside the asistente screen and is
      // visible only when the user opens it.
      const eligible = signals.filter(
        (s) =>
          s.urgency === 'alta' &&
          s.confidence >= 0.85 &&
          !isQuietHour(new Date()) &&
          shouldPush(s.id),
      )
      if (eligible.length === 0) return

      const now = Date.now()
      const nextCache = { ...cache }

      await Promise.allSettled(
        eligible.map(async (task) => {
          const kind = `advisor_${task.id.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()}`
          await sendFamilyPush({
            familyId: familyId!,
            title: task.title,
            body: task.body,
            kind,
            url: '/(app)/(tabs)/control',
          }).catch(() => {
            // Push delivery is best-effort; cache still bumps below
            // so we don't retry on every render.
          })
          nextCache[task.id] = { pushedAt: now }
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
