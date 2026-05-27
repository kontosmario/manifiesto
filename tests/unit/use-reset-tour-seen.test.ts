import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}))

import {
  buildResetAllToursSeenMutation,
  buildResetTourSeenMutation,
  type ResetTourSeenContext,
} from '@/features/tours/use-reset-tour-seen'
import type { TourKey } from '@/features/tours/tour-keys'

let qc: QueryClient

function seedProfile() {
  qc.setQueryData(['profile', 'u1'], {
    id: 'u1',
    home_tour_seen_at: '2026-05-27T00:00:00Z',
    gastos_tour_seen_at: '2026-05-27T00:00:00Z',
    fijos_tour_seen_at: '2026-05-27T00:00:00Z',
    control_tour_seen_at: '2026-05-27T00:00:00Z',
  })
}

function makeResetOneObserver() {
  return new MutationObserver<void, Error, TourKey, ResetTourSeenContext>(
    qc,
    buildResetTourSeenMutation(qc, 'u1'),
  )
}

function makeResetAllObserver() {
  return new MutationObserver<void, Error, void, ResetTourSeenContext>(
    qc,
    buildResetAllToursSeenMutation(qc, 'u1'),
  )
}

beforeEach(() => {
  rpcMock.mockReset()
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  seedProfile()
})

afterEach(() => {
  qc.clear()
})

describe('useResetTourSeen', () => {
  it('resetOne calls reset_tour_seen RPC with the key', async () => {
    rpcMock.mockResolvedValue({ error: null })
    const observer = makeResetOneObserver()
    await observer.mutate('home')
    expect(rpcMock).toHaveBeenCalledWith('reset_tour_seen', { tour_key: 'home' })
  })

  it('resetOne optimistically nulls that column in cache', async () => {
    rpcMock.mockResolvedValue({ error: null })
    const observer = makeResetOneObserver()
    await observer.mutate('gastos')
    const profile = qc.getQueryData<{ gastos_tour_seen_at: string | null }>([
      'profile',
      'u1',
    ])
    expect(profile?.gastos_tour_seen_at).toBeNull()
  })

  it('resetAll calls reset_all_tours_seen RPC and nulls every column', async () => {
    rpcMock.mockResolvedValue({ error: null })
    const observer = makeResetAllObserver()
    await observer.mutate()
    expect(rpcMock).toHaveBeenCalledWith('reset_all_tours_seen')
    const profile = qc.getQueryData<{
      home_tour_seen_at: string | null
      gastos_tour_seen_at: string | null
      fijos_tour_seen_at: string | null
      control_tour_seen_at: string | null
    }>(['profile', 'u1'])
    expect(profile?.home_tour_seen_at).toBeNull()
    expect(profile?.gastos_tour_seen_at).toBeNull()
    expect(profile?.fijos_tour_seen_at).toBeNull()
    expect(profile?.control_tour_seen_at).toBeNull()
  })
})
