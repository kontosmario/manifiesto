import { useEffect, useSyncExternalStore } from 'react'
import {
  deletePersistentValue,
  getPersistentValue,
  setPersistentValue,
} from '@/lib/persistent-kv'

// Reactive store + SecureStore-backed flag for the "Modo demo del
// asistente" toggle. When ON, `useControlV2Data` swaps its computed
// `signals` for a curated fixture covering every signal scenario and
// CTA action kind, so internal testing can step through every coach
// card / quick action without having to reproduce each precondition
// in real data.
//
// IMPORTANT: this is a TESTING-ONLY flag. The Settings row that
// flips it is gated on `__DEV__` so the toggle never reaches a
// production build.

const STORAGE_KEY = 'assistant-demo-mode'

let cached: boolean = false
let hydrated = false
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

async function hydrate() {
  if (hydrated) return
  hydrated = true
  const raw = await getPersistentValue(STORAGE_KEY)
  if (raw === '1' && !cached) {
    cached = true
    notify()
  }
}

export async function setAssistantDemoMode(enabled: boolean): Promise<void> {
  cached = enabled
  if (enabled) {
    await setPersistentValue(STORAGE_KEY, '1')
  } else {
    await deletePersistentValue(STORAGE_KEY)
  }
  notify()
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

/**
 * Subscribe to the demo flag in React. Triggers hydration the first
 * time it mounts in the tree so the SecureStore-persisted value
 * reaches the in-memory cache; subsequent reads are synchronous.
 */
export function useAssistantDemoMode(): boolean {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  useEffect(() => {
    void hydrate()
  }, [])
  return value
}
