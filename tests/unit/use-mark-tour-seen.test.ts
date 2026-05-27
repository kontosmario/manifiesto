import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()
const pendingStore = new Map<string, string>()

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}))
vi.mock('@/features/tours/tour-pending-store', () => ({
  setTourPending: vi.fn(async (key: string) => {
    pendingStore.set(key, '1')
  }),
  clearTourPending: vi.fn(async (key: string) => {
    pendingStore.delete(key)
  }),
}))

import {
  buildMarkTourSeenMutation,
  type MarkTourSeenContext,
} from '@/features/tours/use-mark-tour-seen'
import type { TourKey } from '@/features/tours/tour-keys'

let qc: QueryClient

function seedProfile() {
  qc.setQueryData(['profile', 'u1'], {
    id: 'u1',
    home_tour_seen_at: null,
    gastos_tour_seen_at: null,
    fijos_tour_seen_at: null,
    control_tour_seen_at: null,
  })
}

function makeObserver() {
  return new MutationObserver<void, Error, TourKey, MarkTourSeenContext>(
    qc,
    buildMarkTourSeenMutation(qc, 'u1'),
  )
}

beforeEach(() => {
  rpcMock.mockReset()
  pendingStore.clear()
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  seedProfile()
})

afterEach(() => {
  qc.clear()
})

describe('useMarkTourSeen', () => {
  it('calls mark_tour_seen RPC with the right key on success', async () => {
    rpcMock.mockResolvedValue({ error: null })
    const observer = makeObserver()
    await observer.mutate('home')
    expect(rpcMock).toHaveBeenCalledWith('mark_tour_seen', { tour_key: 'home' })
  })

  it('optimistically sets the profile cache column to a timestamp', async () => {
    rpcMock.mockResolvedValue({ error: null })
    const observer = makeObserver()
    await observer.mutate('gastos')
    const profile = qc.getQueryData<{ gastos_tour_seen_at: string | null }>([
      'profile',
      'u1',
    ])
    expect(profile?.gastos_tour_seen_at).toBeTruthy()
  })

  it('writes pending fallback when RPC fails', async () => {
    rpcMock.mockResolvedValue({ error: new Error('network down') })
    const observer = makeObserver()
    try {
      await observer.mutate('control')
    } catch {
      /* expected */
    }
    expect(pendingStore.get('control')).toBe('1')
  })

  it('clears any prior pending fallback on success', async () => {
    pendingStore.set('fijos', '1')
    rpcMock.mockResolvedValue({ error: null })
    const observer = makeObserver()
    await observer.mutate('fijos')
    expect(pendingStore.has('fijos')).toBe(false)
  })
})
