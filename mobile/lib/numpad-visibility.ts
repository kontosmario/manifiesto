import { useEffect, useState } from 'react'

/**
 * Module-level observable for the shared InAppNumpad visibility +
 * measured height. Any bottom-anchored surface (ModalCard, sheets) can
 * subscribe via `useNumpadOffset` and push its content up so the
 * active field stays visible above the keyboard.
 *
 * The InAppNumpad publishes its height via `publishNumpadOpen(h)` when
 * it opens and `publishNumpadClose()` when it dismisses. We use a
 * counter instead of a boolean so nested numpad pushes don't drop the
 * offset prematurely (defensive — today only one numpad renders at a
 * time).
 */

type Listener = (offset: number) => void

let openCount = 0
let currentHeight = 0
const listeners = new Set<Listener>()

function emit() {
  const offset = openCount > 0 ? currentHeight : 0
  for (const listener of listeners) listener(offset)
}

export function publishNumpadOpen(height: number): void {
  openCount += 1
  if (height > currentHeight) currentHeight = height
  emit()
}

export function publishNumpadHeight(height: number): void {
  if (openCount === 0) return
  if (Math.abs(height - currentHeight) < 0.5) return
  currentHeight = height
  emit()
}

export function publishNumpadClose(): void {
  openCount = Math.max(0, openCount - 1)
  if (openCount === 0) currentHeight = 0
  emit()
}

/** Returns the current vertical offset any bottom-anchored surface
 *  should reserve so it sits above the numpad. 0 when no numpad. */
export function useNumpadOffset(): number {
  const [offset, setOffset] = useState(() => (openCount > 0 ? currentHeight : 0))

  useEffect(() => {
    listeners.add(setOffset)
    // Sync in case the observable changed between the render snapshot
    // above and this subscription.
    const next = openCount > 0 ? currentHeight : 0
    if (next !== offset) {
      setOffset(next)
    }
    return () => {
      listeners.delete(setOffset)
    }
    // Intentionally subscribe once on mount. Re-running on `offset` change
    // would re-add/remove the listener on every emission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return offset
}
