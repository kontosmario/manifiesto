import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()

vi.mock('@/lib/persistent-kv', () => ({
  getPersistentValue: vi.fn(async (key: string) => store.get(key) ?? null),
  setPersistentValue: vi.fn(async (key: string, value: string) => {
    store.set(key, value)
  }),
  deletePersistentValue: vi.fn(async (key: string) => {
    store.delete(key)
  }),
}))

import {
  clearTourPending,
  getPendingTours,
  setTourPending,
} from '@/features/tours/tour-pending-store'

beforeEach(() => {
  store.clear()
})

describe('tour-pending-store', () => {
  it('getPendingTours returns empty when nothing is pending', async () => {
    expect(await getPendingTours()).toEqual([])
  })

  it('setTourPending then getPendingTours returns that key', async () => {
    await setTourPending('home')
    expect(await getPendingTours()).toEqual(['home'])
  })

  it('multiple pending tours are returned together in canonical order', async () => {
    await setTourPending('gastos')
    await setTourPending('home')
    await setTourPending('control')
    expect(await getPendingTours()).toEqual(['home', 'gastos', 'control'])
  })

  it('clearTourPending removes the flag', async () => {
    await setTourPending('fijos')
    await clearTourPending('fijos')
    expect(await getPendingTours()).toEqual([])
  })
})
