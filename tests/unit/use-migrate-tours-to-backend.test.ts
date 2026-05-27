import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const kvStore = new Map<string, string>()
const rpcMock = vi.fn()

vi.mock('@/lib/persistent-kv', () => ({
  getPersistentValue: vi.fn(async (key: string) => kvStore.get(key) ?? null),
  setPersistentValue: vi.fn(async (key: string, value: string) => {
    kvStore.set(key, value)
  }),
  deletePersistentValue: vi.fn(async (key: string) => {
    kvStore.delete(key)
  }),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}))

import { runToursMigrationOnce } from '@/features/tours/use-migrate-tours-to-backend'

beforeEach(() => {
  kvStore.clear()
  rpcMock.mockReset()
  rpcMock.mockResolvedValue({ error: null })
})

describe('runToursMigrationOnce', () => {
  it('no-ops when migration-v2-done flag is set', async () => {
    kvStore.set('tour-seen.migration-v2-done', '1')
    kvStore.set('tour-seen.home', '1')
    const qc = new QueryClient()
    await runToursMigrationOnce({ userId: 'u1', queryClient: qc })
    expect(rpcMock).not.toHaveBeenCalled()
    // Pre-existing legacy flag is left alone (will be picked up on a
    // future run if the migration-done flag ever gets cleared).
    expect(kvStore.get('tour-seen.home')).toBe('1')
  })

  it('hoists local tour-seen.* flags to the backend and sets migration-done', async () => {
    kvStore.set('tour-seen.home', '1')
    kvStore.set('tour-seen.gastos', '1')
    const qc = new QueryClient()
    await runToursMigrationOnce({ userId: 'u1', queryClient: qc })
    expect(rpcMock).toHaveBeenCalledTimes(2)
    expect(rpcMock).toHaveBeenCalledWith('mark_tour_seen', { tour_key: 'home' })
    expect(rpcMock).toHaveBeenCalledWith('mark_tour_seen', { tour_key: 'gastos' })
    expect(kvStore.get('tour-seen.migration-v2-done')).toBe('1')
    expect(kvStore.has('tour-seen.home')).toBe(false)
    expect(kvStore.has('tour-seen.gastos')).toBe(false)
  })

  it('also retries pending fallback (tour-seen-pending.*) and cleans them', async () => {
    kvStore.set('tour-seen-pending.fijos', '1')
    kvStore.set('tour-seen-pending.control', '1')
    const qc = new QueryClient()
    await runToursMigrationOnce({ userId: 'u1', queryClient: qc })
    expect(rpcMock).toHaveBeenCalledTimes(2)
    expect(rpcMock).toHaveBeenCalledWith('mark_tour_seen', { tour_key: 'fijos' })
    expect(rpcMock).toHaveBeenCalledWith('mark_tour_seen', { tour_key: 'control' })
    expect(kvStore.has('tour-seen-pending.fijos')).toBe(false)
    expect(kvStore.has('tour-seen-pending.control')).toBe(false)
    expect(kvStore.get('tour-seen.migration-v2-done')).toBe('1')
  })

  it('does NOT set migration-done when any hoist RPC fails (retry next launch)', async () => {
    kvStore.set('tour-seen.home', '1')
    kvStore.set('tour-seen.gastos', '1')
    rpcMock.mockResolvedValueOnce({ error: null })
    rpcMock.mockResolvedValueOnce({ error: new Error('network down') })
    const qc = new QueryClient()
    await runToursMigrationOnce({ userId: 'u1', queryClient: qc })
    expect(kvStore.has('tour-seen.migration-v2-done')).toBe(false)
    // Legacy flags untouched so next launch re-attempts the full set.
    expect(kvStore.get('tour-seen.home')).toBe('1')
    expect(kvStore.get('tour-seen.gastos')).toBe('1')
  })

  it('cleans up legacy tour-seen.* keys after successful hoist', async () => {
    kvStore.set('tour-seen.home', '1')
    kvStore.set('tour-seen.fijos', '1')
    const qc = new QueryClient()
    await runToursMigrationOnce({ userId: 'u1', queryClient: qc })
    expect(kvStore.has('tour-seen.home')).toBe(false)
    expect(kvStore.has('tour-seen.fijos')).toBe(false)
    expect(kvStore.get('tour-seen.migration-v2-done')).toBe('1')
  })

  it('dedups when the same key appears in both legacy and pending stores', async () => {
    kvStore.set('tour-seen.home', '1')
    kvStore.set('tour-seen-pending.home', '1')
    const qc = new QueryClient()
    await runToursMigrationOnce({ userId: 'u1', queryClient: qc })
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('mark_tour_seen', { tour_key: 'home' })
    expect(kvStore.has('tour-seen.home')).toBe(false)
    expect(kvStore.has('tour-seen-pending.home')).toBe(false)
  })
})
