// Persistent record of "the last time the user opened the Control v2
// screen". Used by the tab badge to decide whether high-priority
// advisor signals are unread (signal exists AND user hasn't visited
// within the cool-down). Mounting the screen marks it visited.
//
// Persistence: SecureStore on native, localStorage on web.

import { useEffect, useState } from 'react'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'

const STORAGE_KEY = 'control-visit:v1'
const HOUR_MS = 60 * 60 * 1000
/**
 * Window after a visit during which we consider all current signals
 * "seen". After this, fresh `alta` signals re-trigger the tab badge.
 */
export const VISIT_FRESHNESS_HOURS = 18

let lastVisitMs: number | null = null
let hydrated = false
const listeners = new Set<(ts: number | null) => void>()

async function hydrate(): Promise<void> {
  if (hydrated) return
  hydrated = true
  try {
    const raw = await getPersistentValue(STORAGE_KEY)
    if (!raw) return
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) {
      lastVisitMs = parsed
      emit()
    }
  } catch {
    // Corrupt — keep null.
  }
}

function emit(): void {
  for (const cb of listeners) cb(lastVisitMs)
}

export function markControlVisited(): void {
  lastVisitMs = Date.now()
  emit()
  void setPersistentValue(STORAGE_KEY, String(lastVisitMs))
}

/**
 * True when the user hasn't visited Control within the freshness
 * window. New `alta` advisor signals raise the badge during this
 * state.
 */
export function isControlStale(): boolean {
  if (lastVisitMs == null) return true
  return Date.now() - lastVisitMs > VISIT_FRESHNESS_HOURS * HOUR_MS
}

/** Reactive snapshot — re-renders when `markControlVisited` runs. */
export function useLastControlVisit(): number | null {
  const [state, setState] = useState<number | null>(() => lastVisitMs)
  useEffect(() => {
    let active = true
    listeners.add(setState)
    void hydrate().then(() => {
      if (active) setState(lastVisitMs)
    })
    return () => {
      active = false
      listeners.delete(setState)
    }
  }, [])
  return state
}
