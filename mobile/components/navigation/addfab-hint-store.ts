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

/**
 * Reactive snapshot. `hydrated` flips true once the persisted flag has been
 * read — callers must wait for it before deciding to show the hint, otherwise a
 * slow SecureStore read could show the tip to a user who already dismissed it
 * (the module starts optimistically at seen=false).
 */
export function useAddFabHint(): { seen: boolean; hydrated: boolean } {
  const [state, setState] = useState<{ seen: boolean; hydrated: boolean }>(
    () => ({ seen, hydrated }),
  )
  useEffect(() => {
    let active = true
    const listener = (v: boolean) => {
      if (active) setState({ seen: v, hydrated: true })
    }
    listeners.add(listener)
    void hydrate().then(() => {
      if (active) setState({ seen, hydrated: true })
    })
    return () => {
      active = false
      listeners.delete(listener)
    }
  }, [])
  return state
}
