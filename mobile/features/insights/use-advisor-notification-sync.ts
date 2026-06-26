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
import i18n from '@/lib/i18n'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'
import { useNotificationPreferences } from '@/features/notifications/use-notification-preferences'
import { useAdvisorPreferences } from '@/features/insights/use-advisor-preferences'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'
import { DAY_MS } from '@/utils/time'

const STORAGE_KEY = 'advisor-piped:v1'
/** Default minimum interval used when a signal has no specific entry. */
const DEFAULT_INTERVAL_HOURS = 18
const HOUR_MS = 60 * 60 * 1000

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
 * Quiet hours filter — bloquea el push entre `start` y `end` (hora local).
 * Configurable desde notification_preferences (antes fijo 22→08). La señal
 * igual vive en la pantalla del asistente; solo no despierta el device.
 * Ventana que cruza medianoche (start>end, p.ej. 22→8) vs misma jornada
 * (start<end); start===end = sin quiet hours.
 */
function isQuietHour(now: Date, start: number, end: number): boolean {
  const h = now.getHours()
  if (start === end) return false
  if (start < end) return h >= start && h < end
  return h >= start || h < end
}

// Umbral de urgencia configurable (notification_preferences). Orden
// baja < media < alta: el push se dispara si la urgencia de la señal es
// >= al mínimo elegido. Default 'alta' (comportamiento previo).
const URGENCY_RANK: Record<string, number> = { baja: 0, media: 1, alta: 2 }
function urgencyMeetsThreshold(urgency: string, min: string): boolean {
  return (URGENCY_RANK[urgency] ?? 2) >= (URGENCY_RANK[min] ?? 2)
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
  // Prefs cross-device (notification_preferences + user_advisor_prefs).
  // Se leen aquí adentro para no tocar los 2 call sites; react-query
  // deduplica con las mismas queries que ya usa la pantalla.
  const notifPrefs = useNotificationPreferences().data
  const advisorEnabled = useAdvisorPreferences().data?.advisorEnabled ?? true
  const pushEnabled = notifPrefs?.advisorPushEnabled ?? true
  const quietStart = notifPrefs?.advisorQuietStart ?? 22
  const quietEnd = notifPrefs?.advisorQuietEnd ?? 8
  const minUrgency = notifPrefs?.advisorPushMinUrgency ?? 'alta'

  useEffect(() => {
    if (!familyId || !userId) return
    // Kill-switch total + "solo dentro de la app" (sin push).
    if (!advisorEnabled || !pushEnabled) return
    if (signals.length === 0) return

    let cancelled = false

    async function run() {
      await hydrate()
      if (cancelled) return

      // Solo señales que superan el umbral de urgencia elegido (default
      // 'alta') + alta confianza, fuera de quiet hours y con cooldown.
      const eligible = signals.filter(
        (s) =>
          urgencyMeetsThreshold(s.urgency, minUrgency) &&
          s.confidence >= 0.85 &&
          !isQuietHour(new Date(), quietStart, quietEnd) &&
          shouldPush(s.id),
      )
      if (eligible.length === 0) return

      const now = Date.now()
      const nextCache = { ...cache }

      // Anti-spam: si califican >2 señales en la misma corrida, mandamos
      // UNA sola push "Tienes N alertas en Control" en vez de una por señal.
      // 1-2 → individuales. En ambos casos bumpeamos el cooldown de TODAS
      // las señales incluidas para no re-pushear.
      if (eligible.length > 2) {
        await sendFamilyPush({
          familyId: familyId!,
          title: i18n.t('insights:push.digestTitle', { count: eligible.length }),
          body: i18n.t('insights:push.digestBody', {
            first: eligible[0].title,
            count: eligible.length - 1,
          }),
          kind: 'advisor_digest',
          url: '/(app)/(tabs)/control',
        }).catch(() => {
          // Best-effort; el cooldown se bumpea igual abajo.
        })
        for (const task of eligible) nextCache[task.id] = { pushedAt: now }
      } else {
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
      }

      cache = nextCache
      await persist()
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [
    signals,
    familyId,
    userId,
    advisorEnabled,
    pushEnabled,
    quietStart,
    quietEnd,
    minUrgency,
  ])
}
