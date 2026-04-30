// Module-level pub/sub so tab screens can know when a *tab press*
// triggered their re-focus — as opposed to a stack pop (closing
// add-expense or similar). Only tab presses publish here, so screens
// that subscribe can safely animate on focus without also replaying
// the animation when a pushed modal dismisses.
//
// Beyond timing, the pulse also carries the destination route so each
// tab screen can compute the *direction* of the switch (incoming from
// left vs right) and translate its content accordingly. We snapshot
// the *previous* destination on each press, which is what the
// receiving screen compares against to know "where am I coming from".

type Listener = (pulse: TabPulse) => void

export interface TabPulse {
  ts: number
  /** Route name of the tab the user just pressed. */
  to: string | null
  /** Route name that was active immediately before this press. */
  from: string | null
}

let lastPulse: TabPulse = { ts: 0, to: null, from: null }
const listeners = new Set<Listener>()

export function publishTabPress(toRoute?: string) {
  lastPulse = {
    ts: Date.now(),
    to: toRoute ?? lastPulse.to,
    // The screen that *was* focused becomes the "from" of this pulse.
    // We grab it from the previous pulse's `to`.
    from: lastPulse.to,
  }
  for (const cb of listeners) cb(lastPulse)
}

export function getLastTabPulse(): TabPulse {
  return lastPulse
}

export function getLastTabPressAt(): number {
  return lastPulse.ts
}

export function subscribeTabPress(cb: Listener): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

// ─── Tab order (single source of truth for direction logic) ──────
// Maps a route name (matches Tabs.Screen `name=`) to its visual index
// in the tab bar. The "add" tab is the FAB — not a destination — so
// it's omitted; pressing it routes to a modal stack instead of a
// sibling tab, and direction is irrelevant.
export const TAB_ORDER: Readonly<Record<string, number>> = {
  home:           0,
  expenses:       1,
  'fixed-expenses': 2,
  insights:       3,
}

/**
 * Returns +1 if going from `from` to `to` moves right in the tab bar,
 * -1 if it moves left, 0 if direction is undefined (unknown route or
 * same tab).
 */
export function tabDirection(from: string | null, to: string | null): -1 | 0 | 1 {
  if (!from || !to || from === to) return 0
  const fromIdx = TAB_ORDER[from]
  const toIdx = TAB_ORDER[to]
  if (fromIdx == null || toIdx == null) return 0
  if (toIdx > fromIdx) return 1
  if (toIdx < fromIdx) return -1
  return 0
}
