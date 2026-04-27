import { useEffect, useState } from 'react'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'

/**
 * Device-local store for dismissed fijo-hike alerts.
 *
 * The user can tap "Entendido" on a price-hike alert to mark it as
 * acknowledged — we persist `{ [fixedExpenseId]: priceAtDismissal }`
 * to SecureStore so the alert stays hidden across app launches. The
 * key records the *price* at dismiss time: if the vendor raises the
 * price again later, the stored value no longer matches the live
 * amount and the alert automatically re-surfaces.
 *
 * Not a server-side concern — the dismiss is per-device, contextual
 * ("I saw this already"), not a shared family decision.
 */

const STORAGE_KEY = 'fijo-hike-dismissed:v1'

type DismissMap = Record<string, number>

let cache: DismissMap = {}
let hydrated = false
const listeners = new Set<(m: DismissMap) => void>()

function emit() {
  for (const cb of listeners) cb(cache)
}

async function hydrate(): Promise<void> {
  if (hydrated) return
  hydrated = true
  try {
    const raw = await getPersistentValue(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object') {
      const next: DismissMap = {}
      for (const [id, price] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof price === 'number' && Number.isFinite(price)) next[id] = price
      }
      cache = next
      emit()
    }
  } catch {
    // Corrupt JSON or unavailable store — fall back to empty map.
  }
}

function normalizePrice(price: number): number {
  return Math.round(price)
}

/**
 * Returns true when a hike for `fixedExpenseId` has been dismissed
 * at the current price. Any subsequent price change (rounded to the
 * nearest peso) invalidates the dismiss automatically.
 */
export function isHikeDismissed(
  fixedExpenseId: string,
  currentPrice: number,
  map: DismissMap = cache,
): boolean {
  const at = map[fixedExpenseId]
  if (at == null) return false
  return at === normalizePrice(currentPrice)
}

/** Persist a dismiss for the given fijo at its current price. */
export async function dismissHike(
  fixedExpenseId: string,
  currentPrice: number,
): Promise<void> {
  await hydrate()
  const next = { ...cache, [fixedExpenseId]: normalizePrice(currentPrice) }
  cache = next
  emit()
  try {
    await setPersistentValue(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Best-effort persistence. In-memory state still reflects dismiss
    // so the alert hides for this session even if write failed.
  }
}

/** Reactive snapshot of the dismiss map for render-time filtering. */
export function useDismissedHikes(): DismissMap {
  const [state, setState] = useState<DismissMap>(() => cache)
  useEffect(() => {
    let active = true
    listeners.add(setState)
    void hydrate().then(() => {
      if (active) setState(cache)
    })
    return () => {
      active = false
      listeners.delete(setState)
    }
  }, [])
  return state
}
