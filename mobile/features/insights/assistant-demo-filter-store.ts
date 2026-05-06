import { useEffect, useSyncExternalStore } from 'react'
import {
  deletePersistentValue,
  getPersistentValue,
  setPersistentValue,
} from '@/lib/persistent-kv'
import type { ControlAction } from '@/features/insights/control-action'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'

// ─── Filter buckets ──────────────────────────────────────────────
//
// `all`          — every demo signal.
// `read-only`    — signals whose CTA only acknowledges/closes (no
//                  navigation, no mutation). Today that's `dismiss`.
// `no-action`    — signals without an `action` field (the CTA is a
//                  no-op). Useful to test the "informational-only"
//                  rendering path.
// `routing`      — CTAs that take the user somewhere: another route,
//                  a sheet, an in-page anchor, an external URL, the
//                  coach mode, or a Settings modal.
// `action`       — CTAs that perform a confirmed mutation: family
//                  warning + quick savings contribution.

export type AssistantDemoFilter =
  | 'all'
  | 'read-only'
  | 'no-action'
  | 'routing'
  | 'action'

const STORAGE_KEY = 'assistant-demo-filter'

let cached: AssistantDemoFilter = 'all'
let hydrated = false
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function isFilter(raw: string | null | undefined): raw is AssistantDemoFilter {
  return (
    raw === 'all' ||
    raw === 'read-only' ||
    raw === 'no-action' ||
    raw === 'routing' ||
    raw === 'action'
  )
}

async function hydrate() {
  if (hydrated) return
  hydrated = true
  const raw = await getPersistentValue(STORAGE_KEY)
  // Migration: `'no-action'` used to be a separate bucket in the
  // SegmentedControl. After folding the only two no-action demos
  // into the read-only bucket (with `dismiss` actions), the option
  // was removed from the UI. Any stored `'no-action'` value would
  // leave the SegmentedControl with no visible selection — reset to
  // `'all'` so the UI is always coherent.
  if (raw === 'no-action') {
    await deletePersistentValue(STORAGE_KEY)
    return
  }
  if (isFilter(raw) && raw !== cached) {
    cached = raw
    notify()
  }
}

export async function setAssistantDemoFilter(
  filter: AssistantDemoFilter,
): Promise<void> {
  cached = filter
  if (filter === 'all') {
    await deletePersistentValue(STORAGE_KEY)
  } else {
    await setPersistentValue(STORAGE_KEY, filter)
  }
  notify()
}

export function getAssistantDemoFilter(): AssistantDemoFilter {
  return cached
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return cached
}

export function useAssistantDemoFilter(): AssistantDemoFilter {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  useEffect(() => {
    void hydrate()
  }, [])
  return value
}

// ─── Classification + filter ──────────────────────────────────────

const ROUTING_KINDS = new Set<ControlAction['kind']>([
  'navigate',
  'open-fixed-expense',
  'open-expenses-filtered',
  'open-add-fixed-prefilled',
  'open-savings-goal',
  'open-streak-sheet',
  'scroll-to-section',
  'open-external-url',
  'open-coach-mode',
  'open-settings-modal',
])

const ACTION_KINDS = new Set<ControlAction['kind']>([
  'send-member-warning',
  'quick-savings-contribution',
])

/**
 * Bucket an action by behavior class. Used by the demo filter and
 * could be reused by analytics later if we need to count "tapped a
 * routing CTA vs. tapped a mutation CTA".
 */
export function classifyAction(
  action: ControlAction | undefined,
): AssistantDemoFilter {
  if (!action) return 'no-action'
  if (action.kind === 'dismiss') return 'read-only'
  if (ACTION_KINDS.has(action.kind)) return 'action'
  if (ROUTING_KINDS.has(action.kind)) return 'routing'
  // Fallback: treat unknown kinds as routing rather than dropping
  // them — better to over-show during testing than to hide.
  return 'routing'
}

export function applyAssistantDemoFilter(
  signals: ControlAdvisorTask[],
  filter: AssistantDemoFilter,
): ControlAdvisorTask[] {
  if (filter === 'all') return signals
  return signals.filter((task) => classifyAction(task.action) === filter)
}
