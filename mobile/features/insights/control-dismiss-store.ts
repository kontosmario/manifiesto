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
const COOLDOWN_DAYS = 7

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

function isExpired(entry: DismissEntry, now: number): boolean {
  return now - entry.dismissedAt > COOLDOWN_DAYS * DAY_MS
}

function activeIds(map: DismissMap, now: number): Set<string> {
  const out = new Set<string>()
  for (const [id, entry] of Object.entries(map)) {
    if (!isExpired(entry, now)) out.add(id)
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

/** Record a dismissal. Sets fresh `dismissedAt`, bumps ignoreCount. */
export function dismissCard(id: string): void {
  const prev = cache[id]
  const next: DismissMap = {
    ...cache,
    [id]: {
      dismissedAt: Date.now(),
      ignoreCount: (prev?.ignoreCount ?? 0) + 1,
    },
  }
  cache = next
  emit()
  void persist()
}

/** True while `now - dismissedAt < COOLDOWN_DAYS`. */
export function isDismissed(id: string): boolean {
  const entry = cache[id]
  if (!entry) return false
  return !isExpired(entry, Date.now())
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
