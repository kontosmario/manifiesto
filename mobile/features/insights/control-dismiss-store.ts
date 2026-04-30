// Persistent store for dismissed Asistente cards.
//
// When the user taps "Entendido" on an awareness card, we hide it
// for `COOLDOWN_DAYS` (7 by default) — long enough that the same
// pattern surfaces again only if it actually persists across the
// next week, short enough that real changes get re-evaluated.
//
// Persistence: SecureStore on native, localStorage on web. We
// hydrate lazily on first hook subscription; the in-memory cache
// owns the truth between hydration and the next write.
//
// Design notes:
//  - Each id stores `dismissedAt` (epoch ms). `isDismissed(id)` is
//    true while now − dismissedAt < COOLDOWN_DAYS × DAY_MS.
//  - Expired entries are pruned on every read so the persisted blob
//    stays small. We also track `ignoreCount` so future iterations
//    can degrade urgency for chronically-ignored signals — exposed
//    via `dismissedIgnoreCount(id)` for the builder to consume.
//  - The same id can be re-dismissed; we update timestamp and
//    increment count without rewriting history.

import { useEffect, useState } from 'react'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'

const STORAGE_KEY = 'control-advisor-dismiss:v2'
const DAY_MS = 24 * 60 * 60 * 1000
/** Default cooldown when a signal has no specific entry in `BASE_TTL_DAYS`. */
const COOLDOWN_DAYS = 7

// ─── TTL escalado por familia de señal ──────────────────────────────
//
// Each signal family has a different "right" cooldown:
//  · time-sensitive cycle mechanics (velocity, recovery, payday) → short
//    so they re-surface quickly when the situation changes
//  · pattern signals (weekly-pattern, night-impulse) → medium, real
//    behaviour change takes 1-2 weeks to validate
//  · structural / commitment signals (zombie, hike, fijos-ratio) → long,
//    they don't change day-to-day and re-firing them is just noise
//
// On top of that, every additional dismiss for the same id multiplies
// the cooldown by 1.5 (capped) so users who chronically dismiss a
// particular pattern stop seeing it as often.
const BASE_TTL_DAYS: Record<string, number> = {
  // cycle mechanics — short
  'velocity': 2,
  'recovery-hard': 2,
  'recovery-soft': 2,
  'payday-proximity': 2,
  'stress-week': 3,
  'start-splurge': 3,
  'end-acceleration': 3,
  // category — medium
  'cat-accel': 5,
  'cat-win': 7,
  'cat-dominance': 7,
  // pattern — medium-long
  'small-leaks': 7,
  'night-impulse': 10,
  'weekly-pattern': 14,
  // structural / commitment — long
  'fijos-ratio': 14,
  'income-volatility': 14,
  'zombie': 21,
  'hike': 21,
  'undetected-sub': 21,
  'cap': 7,
  'member-imbalance': 14,
  'savings-feasibility': 7,
  'savings-over': 7,
  'positive-forecast': 7,
  'streak-ok': 7,
  // P1 — atomic awareness
  'high-single-expense': 1,
  'duplicate': 3,
  'data-gap-warning': 3,
  'savings-milestone': 30,
  'cycle-start-projection': 7,
  'income-missing': 1,
  // P3 — causal patterns
  'causal-friday-cascade': 7,
  'causal-paired': 14,
  'causal-stress-spending': 14,
  // P1 — forecast
  'forecast-tomorrow-risk': 1,
  'forecast-storm-week': 3,
  'forecast-payday-gap': 2,
  // P1 — super-signals
  'super-perfect-storm': 3,
  'super-savings-momentum': 7,
  'super-hidden-drain': 14,
}

/** Match `signalId` to a base TTL using exact id then prefix lookup. */
function baseTtlDays(signalId: string): number {
  if (BASE_TTL_DAYS[signalId] != null) return BASE_TTL_DAYS[signalId]
  for (const [key, ttl] of Object.entries(BASE_TTL_DAYS)) {
    if (signalId.startsWith(`${key}-`)) return ttl
  }
  return COOLDOWN_DAYS
}

/** Escalation factor capped at 4× — enough to silence chronic dismissers
 *  without disabling the signal entirely. */
function escalation(ignoreCount: number): number {
  if (ignoreCount <= 1) return 1
  return Math.min(4, 1 + (ignoreCount - 1) * 0.5)
}

function ttlFor(signalId: string, ignoreCount: number): number {
  return baseTtlDays(signalId) * escalation(ignoreCount) * DAY_MS
}

interface DismissEntry {
  /** Epoch ms when the user last dismissed. */
  dismissedAt: number
  /** Count of times this signal was dismissed (across cycles). */
  ignoreCount: number
}

type DismissMap = Record<string, DismissEntry>

let cache: DismissMap = {}
let hydrated = false
const listeners = new Set<(s: ReadonlySet<string>) => void>()

function isExpired(id: string, entry: DismissEntry, now: number): boolean {
  return now - entry.dismissedAt > ttlFor(id, entry.ignoreCount)
}

function activeIds(map: DismissMap, now: number): Set<string> {
  const out = new Set<string>()
  for (const [id, entry] of Object.entries(map)) {
    if (!isExpired(id, entry, now)) out.add(id)
  }
  return out
}

function emit(): void {
  const snapshot = activeIds(cache, Date.now())
  for (const cb of listeners) cb(snapshot)
}

async function hydrate(): Promise<void> {
  if (hydrated) return
  hydrated = true
  try {
    const raw = await getPersistentValue(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return
    const next: DismissMap = {}
    const now = Date.now()
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const v = value as { dismissedAt?: unknown; ignoreCount?: unknown }
      const dismissedAt =
        typeof v.dismissedAt === 'number' && Number.isFinite(v.dismissedAt)
          ? v.dismissedAt
          : null
      const ignoreCount =
        typeof v.ignoreCount === 'number' && Number.isFinite(v.ignoreCount)
          ? v.ignoreCount
          : 1
      if (dismissedAt == null) continue
      // Drop expired entries on hydration so the blob stays small.
      // We keep entries with non-zero ignoreCount even when expired
      // so chronic dismissers can be detected later — but only if
      // not too old.
      const ageMs = now - dismissedAt
      const tooOld = ageMs > 60 * DAY_MS
      if (tooOld) continue
      next[id] = { dismissedAt, ignoreCount }
    }
    cache = next
    emit()
  } catch {
    // Corrupt JSON or unavailable store — empty map.
  }
}

async function persist(): Promise<void> {
  try {
    await setPersistentValue(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // Best-effort; in-memory state already updated.
  }
}

/** Window during which a repeat `dismissCard(id)` is treated as the
 *  same accidental tap — refreshes the timestamp but does NOT bump
 *  `ignoreCount` (which would otherwise inflate the TTL escalation
 *  for users that just double-tapped the CTA). */
const DISMISS_DEBOUNCE_MS = 1500

/** Record a dismissal. Sets fresh `dismissedAt`, bumps ignoreCount.
 *  A repeat call for the same id within `DISMISS_DEBOUNCE_MS`
 *  refreshes the timestamp without incrementing the count. */
export function dismissCard(id: string): void {
  const prev = cache[id]
  const now = Date.now()
  const sameTap =
    prev != null && now - prev.dismissedAt < DISMISS_DEBOUNCE_MS
  const next: DismissMap = {
    ...cache,
    [id]: {
      dismissedAt: now,
      ignoreCount: sameTap
        ? prev!.ignoreCount
        : (prev?.ignoreCount ?? 0) + 1,
    },
  }
  cache = next
  emit()
  void persist()
}

/** True while `now - dismissedAt < ttlFor(id, ignoreCount)`. */
export function isDismissed(id: string): boolean {
  const entry = cache[id]
  if (!entry) return false
  return !isExpired(id, entry, Date.now())
}

/** How many times the user has dismissed this signal (across cycles). */
export function dismissedIgnoreCount(id: string): number {
  return cache[id]?.ignoreCount ?? 0
}

/** Snapshot of currently-dismissed (still-cooling) ids. */
export function useDismissedIds(): ReadonlySet<string> {
  const [state, setState] = useState<ReadonlySet<string>>(() =>
    activeIds(cache, Date.now()),
  )
  useEffect(() => {
    let active = true
    listeners.add(setState)
    void hydrate().then(() => {
      if (active) setState(activeIds(cache, Date.now()))
    })
    return () => {
      active = false
      listeners.delete(setState)
    }
  }, [])
  return state
}
