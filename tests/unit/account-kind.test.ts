import { describe, expect, it } from 'vitest'
import { isSolo, normalizeAccountKind, type AccountKind } from '@/features/family/account-kind'

describe('account-kind', () => {
  it('isSolo true solo para "solo"', () => {
    expect(isSolo('solo')).toBe(true)
    expect(isSolo('shared')).toBe(false)
    expect(isSolo(null)).toBe(false)
    expect(isSolo(undefined)).toBe(false)
  })

  it('normalizeAccountKind clampa valores inválidos a "shared"', () => {
    expect(normalizeAccountKind('solo')).toBe('solo')
    expect(normalizeAccountKind('shared')).toBe('shared')
    expect(normalizeAccountKind('garbage' as AccountKind)).toBe('shared')
    expect(normalizeAccountKind(null)).toBe('shared')
  })
})
