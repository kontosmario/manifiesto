import { describe, expect, it } from 'vitest'
import { toInitials } from '@/features/billing/household-initials'

describe('toInitials', () => {
  it('toma iniciales de nombre y apellido', () => {
    expect(toInitials('Mario Kontos')).toBe('MK')
  })

  it('un solo nombre → una inicial', () => {
    expect(toInitials('Lucía')).toBe('L')
  })

  it('vacío o solo espacios → ?', () => {
    expect(toInitials('')).toBe('?')
    expect(toInitials('   ')).toBe('?')
  })

  it('ignora espacios extra y toma máximo 2 palabras', () => {
    expect(toInitials('  juan  carlos  perez ')).toBe('JC')
  })
})
