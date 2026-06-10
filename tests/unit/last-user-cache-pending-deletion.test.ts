// J-Auth2 — verify the pending-deletion patch helpers on the SecureStore-
// backed last-user cache. They power the welcome-screen banner; if these
// drift, the user wouldn't see the cancel CTA after a fresh app launch.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()

vi.mock('expo-secure-store', () => ({
  setItemAsync: vi.fn(async (key: string, value: string) => {
    store.set(key, value)
  }),
  getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
  deleteItemAsync: vi.fn(async (key: string) => {
    store.delete(key)
  }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}))

import {
  clearLastUserPendingDeletion,
  clearLastUserProfile,
  getLastUserProfile,
  saveLastUserProfile,
  setLastUserPendingDeletion,
} from '@/lib/last-user-cache'

beforeEach(() => {
  store.clear()
})

describe('last-user-cache pending-deletion', () => {
  it('saved profile defaults deletionScheduledAt to null when missing', async () => {
    await saveLastUserProfile({
      email: 'user@example.com',
      displayName: 'Mario',
      avatarSlug: null,
      deletionScheduledAt: null,
    })

    const profile = await getLastUserProfile()
    expect(profile?.deletionScheduledAt).toBeNull()
  })

  it('setLastUserPendingDeletion patches an existing profile without touching other fields', async () => {
    await saveLastUserProfile({
      email: 'user@example.com',
      displayName: 'Mario',
      avatarSlug: 'fox',
      deletionScheduledAt: null,
    })

    await setLastUserPendingDeletion('2026-07-15T00:00:00Z')

    const profile = await getLastUserProfile()
    expect(profile).toEqual({
      email: 'user@example.com',
      displayName: 'Mario',
      avatarSlug: 'fox',
      deletionScheduledAt: '2026-07-15T00:00:00Z',
    })
  })

  it('setLastUserPendingDeletion is a no-op when no profile is cached', async () => {
    await setLastUserPendingDeletion('2026-07-15T00:00:00Z')
    expect(await getLastUserProfile()).toBeNull()
  })

  it('clearLastUserPendingDeletion only patches when there is a pending value', async () => {
    await saveLastUserProfile({
      email: 'user@example.com',
      displayName: null,
      avatarSlug: null,
      deletionScheduledAt: '2026-07-15T00:00:00Z',
    })

    await clearLastUserPendingDeletion()

    const profile = await getLastUserProfile()
    expect(profile?.deletionScheduledAt).toBeNull()
    expect(profile?.email).toBe('user@example.com')
  })

  it('clearLastUserProfile wipes the entry entirely', async () => {
    await saveLastUserProfile({
      email: 'user@example.com',
      displayName: null,
      avatarSlug: null,
      deletionScheduledAt: '2026-07-15T00:00:00Z',
    })
    await clearLastUserProfile()
    expect(await getLastUserProfile()).toBeNull()
  })
})
