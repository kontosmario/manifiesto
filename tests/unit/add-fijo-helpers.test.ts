import { describe, it, expect } from 'vitest'
import { buildNextDueOn, rebaseNextDueOn } from '@/features/fixed-expenses/add-fijo-helpers'

describe('rebaseNextDueOn — editar no rebobina', () => {
  it('mismo día → misma fecha (pagado este mes queda pagado)', () => {
    expect(rebaseNextDueOn('2026-07-05', 5)).toBe('2026-07-05')
  })
  it('cambia el día dentro del período vigente (jul-05 → jul-20)', () => {
    expect(rebaseNextDueOn('2026-07-05', 20)).toBe('2026-07-20')
  })
  it('clampa al mes del período (feb + día 31 → feb-28)', () => {
    expect(rebaseNextDueOn('2026-02-10', 31)).toBe('2026-02-28')
  })
  it('cursor en el pasado se queda en el pasado (no perdona deuda)', () => {
    expect(rebaseNextDueOn('2026-04-05', 12)).toBe('2026-04-12')
  })
  it('fecha inválida cae a buildNextDueOn', () => {
    expect(rebaseNextDueOn('garbage', 10)).toBe(buildNextDueOn(10))
  })
})
