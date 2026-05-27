import { describe, expect, it, vi } from 'vitest'

const profileQueryMock = vi.fn()
const sessionQueryMock = vi.fn()

vi.mock('@/features/auth/use-auth-session', () => ({
  useAuthSession: () => sessionQueryMock(),
}))
vi.mock('@/features/profile/use-profile', async () => ({
  useMyProfile: () => profileQueryMock(),
  profileQueryKey: (userId?: string) => ['profile', userId] as const,
}))

import { useToursSeen } from '@/features/tours/use-tours-seen'

function setup({
  userId = 'u1',
  profile,
  isLoading = false,
}: {
  userId?: string | null
  profile?: Partial<{
    home_tour_seen_at: string | null
    gastos_tour_seen_at: string | null
    fijos_tour_seen_at: string | null
    control_tour_seen_at: string | null
  }> | null
  isLoading?: boolean
}) {
  sessionQueryMock.mockReturnValue({ data: userId ? { user: { id: userId } } : null })
  profileQueryMock.mockReturnValue({ data: profile ?? null, isLoading })
}

describe('useToursSeen', () => {
  it('returns isLoading=true when profile is loading', () => {
    setup({ profile: null, isLoading: true })
    const result = useToursSeen()
    expect(result.isLoading).toBe(true)
  })

  it('defaults isSeen to true when profile is missing (conservative)', () => {
    setup({ profile: null })
    const result = useToursSeen()
    expect(result.isSeen('home')).toBe(true)
    expect(result.isSeen('gastos')).toBe(true)
    expect(result.isSeen('fijos')).toBe(true)
    expect(result.isSeen('control')).toBe(true)
  })

  it('returns isSeen=true for tours with a timestamp', () => {
    setup({
      profile: {
        home_tour_seen_at: '2026-05-27T00:00:00Z',
        gastos_tour_seen_at: null,
        fijos_tour_seen_at: null,
        control_tour_seen_at: null,
      },
    })
    const result = useToursSeen()
    expect(result.isSeen('home')).toBe(true)
    expect(result.isSeen('gastos')).toBe(false)
    expect(result.isSeen('fijos')).toBe(false)
    expect(result.isSeen('control')).toBe(false)
  })

  it('returns isSeen=false for all tours when all timestamps are null', () => {
    setup({
      profile: {
        home_tour_seen_at: null,
        gastos_tour_seen_at: null,
        fijos_tour_seen_at: null,
        control_tour_seen_at: null,
      },
    })
    const result = useToursSeen()
    expect(result.isSeen('home')).toBe(false)
    expect(result.isSeen('gastos')).toBe(false)
    expect(result.isSeen('fijos')).toBe(false)
    expect(result.isSeen('control')).toBe(false)
  })
})
