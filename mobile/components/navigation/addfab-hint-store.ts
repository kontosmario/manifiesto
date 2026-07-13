// One-time discoverability flag for the central "+" FAB long-press (the
// speed-dial of extra actions: ingreso, fijo, importar, día sin gasto). Users
// don't discover the gesture on their own, so we surface a coach-mark pill
// until they either use the long-press or the hint times out once.
//
// Persistence: SecureStore on native, localStorage on web (same as
// control-visit-store).

import { useEffect, useState } from 'react'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'

const STORAGE_KEY = 'addfab-hint-seen:v1'

let seen = false
let hydrated = false
const listeners = new Set<(v: boolean) => void>()

function emit(): void {
  for (const cb of listeners) cb(seen)
}

async function hydrate(): Promise<void> {
  if (hydrated) return
  hydrated = true
  try {
    const raw = await getPersistentValue(STORAGE_KEY)
    if (raw === '1') {
      seen = true
      emit()
    }
  } catch {
    // Corrupt / unavailable — keep showing the hint (harmless).
  }
}

export function markAddFabHintSeen(): void {
  if (seen) return
  seen = true
  emit()
  void setPersistentValue(STORAGE_KEY, '1')
}

/** Reactive snapshot — re-renders when `markAddFabHintSeen` runs. */
export function useAddFabHintSeen(): boolean {
  const [state, setState] = useState<boolean>(() => seen)
  useEffect(() => {
    let active = true
    listeners.add(setState)
    void hydrate().then(() => {
      if (active) setState(seen)
    })
    return () => {
      active = false
      listeners.delete(setState)
    }
  }, [])
  return state
}
