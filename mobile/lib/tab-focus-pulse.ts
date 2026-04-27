// Module-level pub/sub so tab screens can know when a *tab press*
// triggered their re-focus — as opposed to a stack pop (closing
// add-expense or similar). Only tab presses publish here, so screens
// that subscribe can safely animate on focus without also replaying
// the animation when a pushed modal dismisses.

type Listener = (ts: number) => void

let lastPulseAt = 0
const listeners = new Set<Listener>()

export function publishTabPress() {
  lastPulseAt = Date.now()
  for (const cb of listeners) cb(lastPulseAt)
}

export function getLastTabPressAt(): number {
  return lastPulseAt
}

export function subscribeTabPress(cb: Listener): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
