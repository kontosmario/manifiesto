import { describe, expect, it } from 'vitest'
import { formatAnimatedAmount } from '@/components/ui/animated-amount-format'

describe('formatAnimatedAmount', () => {
  it('formats Argentine peso amounts with thousands separators', () => {
    expect(formatAnimatedAmount(12400, 'es-AR')).toBe('$12.400')
    expect(formatAnimatedAmount(0, 'es-AR')).toBe('$0')
    expect(formatAnimatedAmount(1500000, 'es-AR')).toBe('$1.500.000')
  })

  it('prefixes negative amounts with a minus', () => {
    expect(formatAnimatedAmount(-850, 'es-AR')).toBe('-$850')
  })

  it('rounds fractional values to the nearest integer', () => {
    expect(formatAnimatedAmount(12.7, 'es-AR')).toBe('$13')
    expect(formatAnimatedAmount(12.3, 'es-AR')).toBe('$12')
  })

  it('accepts an explicit prefix override', () => {
    expect(formatAnimatedAmount(800, 'es-AR', '+')).toBe('+$800')
    expect(formatAnimatedAmount(800, 'es-AR', null)).toBe('$800')
  })
})
