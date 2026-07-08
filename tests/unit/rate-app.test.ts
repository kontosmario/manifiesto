import { describe, expect, it, vi } from 'vitest'
import { requestAppRating } from '@/features/settings/rate-app'

describe('requestAppRating', () => {
  it('usa el modal nativo cuando está disponible', async () => {
    const io = {
      isAvailable: vi.fn(async () => true),
      requestReview: vi.fn(async () => {}),
      openReviewUrl: vi.fn(async () => {}),
    }

    const outcome = await requestAppRating(io)

    expect(outcome).toBe('native-prompt')
    expect(io.requestReview).toHaveBeenCalledTimes(1)
    expect(io.openReviewUrl).not.toHaveBeenCalled()
  })

  it('cae al deep link de App Store cuando la API nativa no está disponible', async () => {
    const io = {
      isAvailable: vi.fn(async () => false),
      requestReview: vi.fn(async () => {}),
      openReviewUrl: vi.fn(async () => {}),
    }

    const outcome = await requestAppRating(io)

    expect(outcome).toBe('store-page')
    expect(io.requestReview).not.toHaveBeenCalled()
    expect(io.openReviewUrl).toHaveBeenCalledTimes(1)
  })

  it('cae al deep link si el prompt nativo tira', async () => {
    const io = {
      isAvailable: vi.fn(async () => true),
      requestReview: vi.fn(async () => {
        throw new Error('StoreKit unavailable')
      }),
      openReviewUrl: vi.fn(async () => {}),
    }

    const outcome = await requestAppRating(io)

    expect(outcome).toBe('store-page')
    expect(io.openReviewUrl).toHaveBeenCalledTimes(1)
  })

  it('propaga el error si el deep link también falla (el caller alerta)', async () => {
    const io = {
      isAvailable: vi.fn(async () => false),
      requestReview: vi.fn(async () => {}),
      openReviewUrl: vi.fn(async () => {
        throw new Error('cannot open url')
      }),
    }

    await expect(requestAppRating(io)).rejects.toThrow('cannot open url')
  })
})
