// mobile/lib/confetti-bus.ts
//
// Pub/sub minimal para celebraciones de confetti. Mismo patrón que
// `toast-bus.ts`. Un único listener (NoSpendConfettiHost) consume el
// stream; los productores en cualquier parte de la app llaman a
// confetti.celebrate(...) sin saber dónde se pinta.

export interface ConfettiPayload {
  id: string
  /** Duración total del burst en ms. Default 2000. */
  durationMs?: number
  /** Origen visual del burst. 'top' = cae desde arriba; 'center' =
   *  explota desde el centro. Default 'top'. */
  origin?: 'top' | 'center'
}

type Listener = (payload: ConfettiPayload) => void
const listeners = new Set<Listener>()
let counter = 0

export const confetti = {
  celebrate: (opts?: Omit<ConfettiPayload, 'id'>) => {
    counter += 1
    const payload: ConfettiPayload = {
      id: `${Date.now()}-${counter}`,
      durationMs: opts?.durationMs ?? 2000,
      origin: opts?.origin ?? 'top',
    }
    // Snapshot to array before iterating so a listener calling
    // confetti.celebrate() again (rare but defensible) doesn't
    // mutate the Set mid-iteration.
    Array.from(listeners).forEach((l) => {
      l(payload)
    })
  },
}

export function subscribeConfetti(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
