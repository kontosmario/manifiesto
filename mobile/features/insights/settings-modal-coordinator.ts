import { useSyncExternalStore } from 'react'

// Reactive coordinator for opening Settings sheets globally.
//
// Why this exists
// ===============
// The advisor signals used to navigate to `/(app)/settings` and rely
// on the user finding the right row. From a TESTING and UX angle
// that's two extra taps for a single intent ("ajustar el ingreso").
// The dispatcher now fires `open-settings-modal` with a specific
// `kind`, this store flips, and the global host (mounted inside
// `<AppStackShell />`) renders the corresponding sheet on top of
// whatever screen the user is currently on.
//
// State machine: `null` (closed) → `kind` (open) → `null` (closed).

export type SettingsModalKind =
  | 'income'
  | 'payday'
  | 'savings-percent'
  | 'usd-rate'
  | 'buffer'
  | 'display-name'
  | 'avatar'

let active: SettingsModalKind | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function openSettingsModal(kind: SettingsModalKind) {
  if (active === kind) return
  active = kind
  notify()
}

export function closeSettingsModal() {
  if (active === null) return
  active = null
  notify()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return active
}

/** Subscribe to the coordinator from React. Re-renders on transitions. */
export function useActiveSettingsModal(): SettingsModalKind | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
