import { describe, expect, it } from 'vitest'
import { matchesKnownProvider } from '@/features/subscriptions-zombie/known-providers'

describe('matchesKnownProvider', () => {
  it('matches well-known names case-insensitively', () => {
    expect(matchesKnownProvider('Netflix')).toBe(true)
    expect(matchesKnownProvider('netflix')).toBe(true)
    expect(matchesKnownProvider('NETFLIX')).toBe(true)
    expect(matchesKnownProvider('Disney+')).toBe(true)
    expect(matchesKnownProvider('Apple Music')).toBe(true)
    expect(matchesKnownProvider('Apple marito')).toBe(true)
    expect(matchesKnownProvider('chatgpt plus')).toBe(true)
  })

  it('does not match unknown providers', () => {
    expect(matchesKnownProvider('Multiplay Premium')).toBe(false)
    expect(matchesKnownProvider('Cuota colegio')).toBe(false)
    expect(matchesKnownProvider('Donación Cruz Roja')).toBe(false)
    expect(matchesKnownProvider('')).toBe(false)
  })
})
