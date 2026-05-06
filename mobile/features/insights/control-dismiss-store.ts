// Per-user dismissals for the Asistente Financiero, backed by the
// `advisor_signal_dismissals` Postgres table.
//
// Public API (preserved from the previous SecureStore-backed version
// so all existing callers keep compiling without changes):
//
//   · `dismissCard(id)`            — record a dismissal (server-side
//                                    upsert + optimistic local cache)
//   · `isDismissed(id)`            — sync read against local cache
//   · `dismissedIgnoreCount(id)`   — internal helper for escalation
//   · `useDismissedIds()`          — reactive hook returning the live
//                                    set of ids inside the cooldown
//   · `useAdvisorDismissalsSync()` — NEW. Mount once at app shell
//                                    level so the cache hydrates
//                                    when the user logs in / family
//                                    is known.
//
// Why a module-level cache + Supabase upserts (instead of pure React
// Query): the existing consumers expect synchronous reads
// (`isDismissed(id)` is called inside non-async render paths and
// signal builders). Hydrating once and keeping the cache hot lets us
// preserve that surface without a big consumer rewrite.

import { useEffect, useState } from 'react'
import {
  fetchAdvisorDismissals,
  upsertAdvisorDismissal,
  type AdvisorDismissalRow,
} from '@/features/insights/advisor-dismiss-repository'

const DAY_MS = 24 * 60 * 60 * 1000
/** Default cooldown for signals not listed in `BASE_TTL_DAYS`. */
const COOLDOWN_DAYS = 7

// ─── TTL escalado por familia de señal (igual al store anterior) ───
const BASE_TTL_DAYS: Record<string, number> = {
  velocity: 2,
  'recovery-hard': 2,
  'recovery-soft': 2,
  'payday-proximity': 2,
  'stress-week': 3,
  'start-splurge': 3,
  'end-acceleration': 3,
  'cat-accel': 5,
  'cat-win': 7,
  'cat-dominance': 7,
  'small-leaks': 7,
  'night-impulse': 10,
  'weekly-pattern': 14,
  'fijos-ratio': 14,
  'income-volatility': 14,
  zombie: 21,
  hike: 21,
  'undetected-sub': 21,
  cap: 7,
  'member-imbalance': 14,
  'savings-feasibility': 7,
  'savings-over': 7,
  'positive-forecast': 7,
  'streak-ok': 7,
  'high-single-expense': 1,
  duplicate: 3,
  'data-gap-warning': 3,
  'savings-milestone': 30,
  'cycle-start-projection': 7,
  'income-missing': 1,
  'causal-friday-cascade': 7,
  'causal-paired': 14,
  'causal-stress-spending': 14,
  'forecast-tomorrow-risk': 1,
  'forecast-storm-week': 3,
  'forecast-payday-gap': 2,
  'super-perfect-storm': 3,
  'super-savings-momentum': 7,
  'super-hidden-drain': 14,
}

function baseTtlDays(signalId: string): number {
  if (BASE_TTL_DAYS[signalId] != null) return BASE_TTL_DAYS[signalId]
  for (const [key, ttl] of Object.entries(BASE_TTL_DAYS)) {
    if (signalId.startsWith(`${key}-`)) return ttl
  }
  return COOLDOWN_DAYS
}

function escalation(ignoreCount: number): number {
  if (ignoreCount <= 1) return 1
  return Math.min(4, 1 + (ignoreCount - 1) * 0.5)
}

function ttlFor(signalId: string, ignoreCount: number): number {
  return baseTtlDays(signalId) * escalation(ignoreCount) * DAY_MS
}

interface DismissEntry {
  dismissedAt: number
  ignoreCount: number
}

type DismissMap = Record<string, DismissEntry>

// ─── Module-level cache ────────────────────────────────────────────
//
// The cache is the source of truth between Supabase round-trips.
// It's keyed solely by signal_id because it's already scoped to the
// active user — we clear/rehydrate when the user changes (see
// `useAdvisorDismissalsSync`).
let cache: DismissMap = {}
let activeUserId: string | null = null
let activeFamilyId: string | null = null
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

function rowsToMap(rows: AdvisorDismissalRow[]): DismissMap {
  const out: DismissMap = {}
  for (const row of rows) {
    out[row.signalId] = {
      dismissedAt: row.dismissedAt,
      ignoreCount: row.ignoreCount,
    }
  }
  return out
}

/** Repeat-tap window — see comment in `dismissCard`. */
const DISMISS_DEBOUNCE_MS = 1500

/**
 * Record a dismissal.
 *
 * Optimistic: updates the local cache and emits to listeners
 * immediately, then upserts to Supabase. On network failure the
 * server may stay out of sync until the next app open hydrates the
 * cache fresh from Supabase. We accept that gap because the
 * alternative — blocking on the network — would produce a sluggish
 * feel on a tap that should be instant.
 *
 * A repeat call for the same id within `DISMISS_DEBOUNCE_MS`
 * refreshes `dismissedAt` but does NOT bump `ignoreCount` — protects
 * against double-taps inflating the escalation factor.
 */
export function dismissCard(id: string): void {
  const prev = cache[id]
  const now = Date.now()
  const sameTap =
    prev != null && now - prev.dismissedAt < DISMISS_DEBOUNCE_MS
  const nextIgnoreCount = sameTap
    ? prev!.ignoreCount
    : (prev?.ignoreCount ?? 0) + 1

  cache = {
    ...cache,
    [id]: { dismissedAt: now, ignoreCount: nextIgnoreCount },
  }
  emit()

  // Server upsert — fire-and-forget. If we have no active
  // family/user (extremely unlikely while the asistente is on
  // screen), skip the network call; the local cache still holds.
  if (activeFamilyId && activeUserId) {
    void upsertAdvisorDismissal({
      familyId: activeFamilyId,
      userId: activeUserId,
      signalId: id,
      nextIgnoreCount,
      dismissedAt: now,
    }).catch(() => {
      // Best-effort. Cache stays optimistic; next hydration corrects.
    })
  }
}

export function isDismissed(id: string): boolean {
  const entry = cache[id]
  if (!entry) return false
  return !isExpired(id, entry, Date.now())
}

export function dismissedIgnoreCount(id: string): number {
  return cache[id]?.ignoreCount ?? 0
}

export function useDismissedIds(): ReadonlySet<string> {
  const [state, setState] = useState<ReadonlySet<string>>(() =>
    activeIds(cache, Date.now()),
  )
  useEffect(() => {
    listeners.add(setState)
    return () => {
      listeners.delete(setState)
    }
  }, [])
  return state
}

// ─── Hydration hook ────────────────────────────────────────────────
//
// Mount once at the app shell level (where familyId + userId are
// known). It:
//   1. Resets the cache when the active user changes (sign-out → new
//      sign-in).
//   2. Loads the user's dismissal rows from Supabase on first call /
//      after a user change.
//   3. Emits to listeners so any mounted `useDismissedIds()` sees
//      the freshly-hydrated state.
export function useAdvisorDismissalsSync(input: {
  familyId: string | null
  userId: string | null
}): void {
  const { familyId, userId } = input

  useEffect(() => {
    // User changed (or sign-out cleared the ids) → wipe the cache so
    // we never leak one user's dismiss state to another on the same
    // device.
    if (userId !== activeUserId) {
      activeUserId = userId
      activeFamilyId = familyId
      cache = {}
      hydrated = false
      emit()
    } else {
      // Same user, but family id may have settled later — keep cache.
      activeFamilyId = familyId
    }

    if (!familyId || !userId) return
    if (hydrated) return

    let cancelled = false
    void fetchAdvisorDismissals(userId)
      .then((rows) => {
        if (cancelled) return
        if (userId !== activeUserId) return // user switched mid-fetch
        cache = rowsToMap(rows)
        hydrated = true
        emit()
      })
      .catch(() => {
        // Non-fatal: cache stays empty, asistente shows everything
        // until the next attempt. Repeated mounts will retry.
      })

    return () => {
      cancelled = true
    }
  }, [familyId, userId])
}
