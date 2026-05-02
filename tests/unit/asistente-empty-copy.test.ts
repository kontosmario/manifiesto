import { describe, expect, it } from 'vitest'
import { selectAsistenteEmptyCopy } from '@/features/insights/asistente-empty-copy'

describe('selectAsistenteEmptyCopy', () => {
  it('returns first-time copy for brand-new users (usingMock=true)', () => {
    const copy = selectAsistenteEmptyCopy({ usingMock: true })
    expect(copy.title).toMatch(/empezando|registr|primero|listos/i)
    expect(copy.body).toMatch(/cargá|gasto|configur|ingres/i)
    expect(copy.title.toLowerCase()).not.toContain('revisaste')
  })

  it('returns the "all reviewed" copy for established users with no pending signals', () => {
    const copy = selectAsistenteEmptyCopy({ usingMock: false })
    expect(copy.title).toContain('Revisaste')
    expect(copy.body).toMatch(/asistente|patrones|sugerencias/i)
  })
})
