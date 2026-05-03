import { describe, expect, it } from 'vitest'
import { formatProjectionWaitCopy } from '@/components/home/projection-wait-copy'

describe('formatProjectionWaitCopy', () => {
  it('returns plural copy when 2+ days remain to a reliable projection', () => {
    expect(formatProjectionWaitCopy(2)).toEqual({
      label: 'Aún calculando',
      detail: 'faltan 2 días',
    })
  })

  it('returns singular copy when only 1 day remains', () => {
    expect(formatProjectionWaitCopy(1)).toEqual({
      label: 'Aún calculando',
      detail: 'falta 1 día',
    })
  })

  it('clamps non-positive inputs to a 1-day fallback (never says "0 días")', () => {
    expect(formatProjectionWaitCopy(0)).toEqual({
      label: 'Aún calculando',
      detail: 'falta 1 día',
    })
    expect(formatProjectionWaitCopy(-3)).toEqual({
      label: 'Aún calculando',
      detail: 'falta 1 día',
    })
  })

  it('does not pretend to know more than it does — copy must explain the wait, not just count down', () => {
    const copy = formatProjectionWaitCopy(2)
    expect(copy.label.toLowerCase()).toMatch(/calculando|esperando/)
  })
})
