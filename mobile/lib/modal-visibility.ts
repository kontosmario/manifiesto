import { useEffect, useState } from 'react'

/**
 * Module-level observable for "is there at least one modal card open".
 *
 * Why we need this:
 *  When a ModalCard opens and its input auto-focuses, the OS keyboard
 *  shows. Both the ModalCard's KeyboardAvoidingView and the underlying
 *  Screen's KeyboardAvoidingView receive the keyboard event, so both
 *  apply padding-bottom. The modal's padding pushes the sheet above
 *  the keyboard (correct). The screen's padding pushes the content
 *  behind the modal upward (visible through the overlay — bad).
 *
 *  The Screen component subscribes via `useIsAnyModalOpen()` and
 *  disables its own keyboard avoidance while at least one modal is
 *  open. ModalCard publishes open/close on visibility transitions.
 *
 *  A counter (not boolean) lets nested modals compose correctly.
 */

type Listener = (open: boolean) => void

let openCount = 0
const listeners = new Set<Listener>()

function emit() {
  const open = openCount > 0
  for (const listener of listeners) listener(open)
}

export function publishModalOpen(): void {
  openCount += 1
  if (openCount === 1) emit()
}

export function publishModalClose(): void {
  const next = Math.max(0, openCount - 1)
  const wasOpen = openCount > 0
  openCount = next
  if (wasOpen && openCount === 0) emit()
}

export function useIsAnyModalOpen(): boolean {
  const [open, setOpen] = useState(() => openCount > 0)
  useEffect(() => {
    listeners.add(setOpen)
    // Sync in case state changed between the render snapshot and this
    // subscription.
    const next = openCount > 0
    if (next !== open) setOpen(next)
    return () => {
      listeners.delete(setOpen)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe once on mount
  }, [])
  return open
}
