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

// ─── Primera cuota (spec 2026-08-23-fijos-primera-cuota-design.md) ────────

import {
  buildFirstCuotaOptions,
  classifyFirstCuotaPlacement,
  defaultFirstCuotaChoice,
  diffDaysFromToday,
  resolveFirstDueOn,
} from '@/features/fixed-expenses/add-fijo-helpers'

/** `now` fijo para tests: 23 de agosto de 2026, mediodía UTC. */
const NOW = new Date('2026-08-23T12:00:00Z')

describe('buildNextDueOn — con `now` inyectable', () => {
  it('sin `now` conserva el comportamiento histórico (mes actual real)', () => {
    const today = new Date()
    const expected = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`
    expect(buildNextDueOn(15).startsWith(expected)).toBe(true)
  })
  it('devuelve la ocurrencia del mes de `now`, aunque ya haya pasado', () => {
    expect(buildNextDueOn(5, NOW)).toBe('2026-08-05')
  })
  it('clampa al último día real del mes (feb + 31 → 28)', () => {
    expect(buildNextDueOn(31, new Date('2026-02-10T12:00:00Z'))).toBe('2026-02-28')
  })
})

describe('buildFirstCuotaOptions — las dos fechas del selector', () => {
  it('monthly: este mes y el que viene, re-anclado al día', () => {
    expect(buildFirstCuotaOptions(5, 'monthly', NOW)).toEqual({
      current: '2026-08-05',
      next: '2026-09-05',
    })
  })
  it('monthly con día 31: la siguiente re-clampa al mes destino (ago-31 → sep-30)', () => {
    expect(buildFirstCuotaOptions(31, 'monthly', NOW)).toEqual({
      current: '2026-08-31',
      next: '2026-09-30',
    })
  })
  it('cruce de año: dic → ene', () => {
    expect(buildFirstCuotaOptions(20, 'monthly', new Date('2026-12-28T12:00:00Z'))).toEqual({
      current: '2026-12-20',
      next: '2027-01-20',
    })
  })
  it('weekly: la siguiente es +7 días, no "el mes que viene"', () => {
    expect(buildFirstCuotaOptions(5, 'weekly', NOW)).toEqual({
      current: '2026-08-05',
      next: '2026-08-12',
    })
  })
  it('annual: la siguiente es +12 meses', () => {
    expect(buildFirstCuotaOptions(5, 'annual', NOW)).toEqual({
      current: '2026-08-05',
      next: '2027-08-05',
    })
  })
})

describe('defaultFirstCuotaChoice — nacer vencido es una elección, no un accidente', () => {
  it('día que aún no pasó → current (comportamiento histórico)', () => {
    expect(defaultFirstCuotaChoice(25, NOW)).toBe('current')
  })
  it('día de HOY → current (es "HOY", no vencido: comparación estricta del clasificador)', () => {
    expect(defaultFirstCuotaChoice(23, NOW)).toBe('current')
  })
  it('día que ya pasó → next', () => {
    expect(defaultFirstCuotaChoice(5, NOW)).toBe('next')
  })
})

describe('resolveFirstDueOn — lo que viaja en el INSERT', () => {
  it('current = buildNextDueOn', () => {
    expect(resolveFirstDueOn('current', 5, 'monthly', NOW)).toBe('2026-08-05')
  })
  it('next = la ocurrencia siguiente según frecuencia', () => {
    expect(resolveFirstDueOn('next', 5, 'monthly', NOW)).toBe('2026-09-05')
    expect(resolveFirstDueOn('next', 5, 'biweekly', NOW)).toBe('2026-08-19')
  })
})

describe('diffDaysFromToday — el sufijo honesto del chip', () => {
  it('hoy → 0', () => {
    expect(diffDaysFromToday('2026-08-23', NOW)).toBe(0)
  })
  it('futuro → positivo (en N días)', () => {
    expect(diffDaysFromToday('2026-08-25', NOW)).toBe(2)
  })
  it('pasado → negativo (venció hace N días)', () => {
    expect(diffDaysFromToday('2026-08-05', NOW)).toBe(-18)
  })
})

describe('classifyFirstCuotaPlacement — la línea de ciclo', () => {
  const cycle = {
    end: new Date('2026-09-20T00:00:00'),
    nominalEnd: new Date('2026-09-20T00:00:00'),
  }
  it('fecha dentro de la ventana [hoy, fin) → this-cycle', () => {
    expect(classifyFirstCuotaPlacement('2026-09-05', cycle)).toBe('this-cycle')
  })
  it('fecha en el fin EXCLUSIVO o después → next-cycle', () => {
    expect(classifyFirstCuotaPlacement('2026-09-20', cycle)).toBe('next-cycle')
    expect(classifyFirstCuotaPlacement('2026-10-05', cycle)).toBe('next-cycle')
  })
  it('ciclo extendido (nominalEnd < end) → null: el hint se suprime', () => {
    const extended = {
      end: new Date('2026-08-24T00:00:00'),
      nominalEnd: new Date('2026-08-20T00:00:00'),
    }
    expect(classifyFirstCuotaPlacement('2026-09-05', extended)).toBe(null)
  })
  it('fecha ilegible → null (sin hint, sin crash)', () => {
    expect(classifyFirstCuotaPlacement('garbage', cycle)).toBe(null)
  })
})
