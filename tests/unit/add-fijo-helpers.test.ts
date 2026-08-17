import { describe, it, expect } from 'vitest'
import {
  buildNextDueOn,
  findDuplicateFijoName,
  numpadBaseAmount,
  rebaseNextDueOn,
  selectDuplicateCandidates,
} from '@/features/fixed-expenses/add-fijo-helpers'

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

describe('numpadBaseAmount — el numpad entero no corrompe montos con decimales', () => {
  it('monto entero pasa tal cual (append de dígitos de siempre)', () => {
    expect(numpadBaseAmount(1500)).toBe(1500)
  })
  it('monto con decimales arranca de cero: tipear 3 da 3, no 15008', () => {
    const base = numpadBaseAmount(1500.5)
    expect(base).toBe(0)
    // Semántica de pushDigit del OnbNumpad: base*10 + dígito.
    expect(base * 10 + 3).toBe(3)
  })
  it('cero queda cero', () => {
    expect(numpadBaseAmount(0)).toBe(0)
  })
})

describe('findDuplicateFijoName — el alta no acepta nombres repetidos', () => {
  const existing = [
    { id: 'fx-1', name: 'Alquiler' },
    { id: 'fx-2', name: 'Teléfono' },
  ]
  it('detecta el duplicado exacto', () => {
    expect(findDuplicateFijoName('Alquiler', existing)?.id).toBe('fx-1')
  })
  it('ignora mayúsculas, espacios y tildes', () => {
    expect(findDuplicateFijoName('  alquiler ', existing)?.id).toBe('fx-1')
    expect(findDuplicateFijoName('ALQUILER', existing)?.id).toBe('fx-1')
    expect(findDuplicateFijoName('telefono', existing)?.id).toBe('fx-2')
  })
  it('editar el propio fijo no se bloquea a sí mismo', () => {
    expect(findDuplicateFijoName('Alquiler', existing, 'fx-1')).toBeNull()
  })
  it('al editar OTRO fijo, un nombre ajeno sigue bloqueando', () => {
    expect(findDuplicateFijoName('Alquiler', existing, 'fx-2')?.id).toBe('fx-1')
  })
  it('nombre nuevo pasa', () => {
    expect(findDuplicateFijoName('Internet', existing)).toBeNull()
  })
  it('vacío o solo espacios no reporta duplicado (eso lo cubre el gate de largo)', () => {
    expect(findDuplicateFijoName('', existing)).toBeNull()
    expect(findDuplicateFijoName('   ', existing)).toBeNull()
  })
})

describe('findDuplicateFijoName — la ñ es letra propia, no una n con tilde', () => {
  it('NO iguala ñ con n: Peña no duplica a Pena, Baño no duplica a Bano', () => {
    expect(findDuplicateFijoName('Peña', [{ id: 'fx-1', name: 'Pena' }])).toBeNull()
    expect(findDuplicateFijoName('Baño', [{ id: 'fx-1', name: 'Bano' }])).toBeNull()
  })
  it('ñ contra ñ sí duplica (con mayúsculas de por medio)', () => {
    expect(findDuplicateFijoName('peña', [{ id: 'fx-1', name: 'PEÑA' }])?.id).toBe('fx-1')
  })
  it('sigue plegando tildes y diéresis (agüero = Aguero)', () => {
    expect(findDuplicateFijoName('agüero', [{ id: 'fx-1', name: 'Aguero' }])?.id).toBe('fx-1')
  })
})

describe('selectDuplicateCandidates — solo fijos persistidos y visibles bloquean', () => {
  it('excluye filas optimistas temp- (el alta en vuelo no se matchea a sí misma)', () => {
    const list = [
      { id: 'temp-1783908129165-abc', name: 'Alquiler', status: 'active' },
      { id: '061ecf9d-3385-4c77-8662-d25e0527b6c0', name: 'Luz', status: 'active' },
    ]
    expect(selectDuplicateCandidates(list).map((f) => f.name)).toEqual(['Luz'])
  })
  it('excluye completed y archived: un fijo invisible en la UI no puede bloquear el alta', () => {
    const list = [
      { id: '061ecf9d-3385-4c77-8662-d25e0527b6c0', name: 'Cuota iPhone', status: 'completed' },
      { id: '161ecf9d-3385-4c77-8662-d25e0527b6c0', name: 'Viejo', status: 'archived' },
      { id: '261ecf9d-3385-4c77-8662-d25e0527b6c0', name: 'Alquiler', status: 'active' },
      { id: '361ecf9d-3385-4c77-8662-d25e0527b6c0', name: 'Gimnasio', status: 'paused' },
    ]
    expect(selectDuplicateCandidates(list).map((f) => f.name)).toEqual(['Alquiler', 'Gimnasio'])
  })
})
