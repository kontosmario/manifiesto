import { describe, expect, it } from 'vitest'

import {
  ADD_INCOME_TOTAL_STEPS,
  INCOME_FIELD_STEP,
  INCOME_FORM_FIELDS,
  canContinueWith,
  flaggedFieldsForStep,
  missingIncomeFields,
  nextStep,
  previousStep,
  resolveEventDate,
  type AddIncomeDraft,
} from '@/features/income/use-add-income-form'
import { INCOME_KIND_VALUES } from '@/features/income/income-kinds'
import { formatLocalDateKey } from '@/utils/pay-cycle'

const EMPTY: AddIncomeDraft = {
  amount: 0,
  kind: null,
  description: '',
  dayOffset: 0,
}
const COMPLETE: AddIncomeDraft = {
  amount: 15_000,
  kind: 'transfer',
  description: 'Transferencia de Ana',
  dayOffset: 0,
}

describe('missingIncomeFields — gates campo por campo', () => {
  it('form vacío → faltan los tres, en orden de pantalla', () => {
    expect(missingIncomeFields(EMPTY)).toEqual(['amount', 'kind', 'description'])
    expect(canContinueWith(EMPTY)).toBe(false)
  })

  it('form completo → no falta nada', () => {
    expect(missingIncomeFields(COMPLETE)).toEqual([])
    expect(canContinueWith(COMPLETE)).toBe(true)
  })

  it('sólo el monto: 0, negativo y NaN cuentan como faltante', () => {
    for (const amount of [0, -1, -15_000, Number.NaN]) {
      expect(missingIncomeFields({ ...COMPLETE, amount })).toEqual(['amount'])
    }
    // 1 peso alcanza: el gate es > 0, no un mínimo de negocio.
    expect(missingIncomeFields({ ...COMPLETE, amount: 1 })).toEqual([])
  })

  it('sólo el kind: null falta, y cualquiera del catálogo sirve', () => {
    expect(missingIncomeFields({ ...COMPLETE, kind: null })).toEqual(['kind'])
    for (const kind of INCOME_KIND_VALUES) {
      expect(missingIncomeFields({ ...COMPLETE, kind })).toEqual([])
    }
  })

  it('sólo la descripción: vacía y sólo-espacios faltan', () => {
    expect(missingIncomeFields({ ...COMPLETE, description: '' })).toEqual(['description'])
    expect(missingIncomeFields({ ...COMPLETE, description: '   \n\t' })).toEqual([
      'description',
    ])
    expect(missingIncomeFields({ ...COMPLETE, description: ' x ' })).toEqual([])
  })

  it('el dayOffset NUNCA es un faltante (siempre tiene valor)', () => {
    for (const dayOffset of [0, 1, 2] as const) {
      expect(canContinueWith({ ...COMPLETE, dayOffset })).toBe(true)
    }
  })

  it('los campos son un ENUM, no copy localizada', () => {
    // Regresión de add-income-screen.tsx:138-140, donde el highlight se
    // resolvía comparando strings traducidos y se apagaba al cambiar copy.
    for (const field of missingIncomeFields(EMPTY)) {
      expect(INCOME_FORM_FIELDS).toContain(field)
      expect(field).toBe(field.toLowerCase())
      expect(field).not.toMatch(/\s/)
    }
  })
})

describe('pasos del wizard', () => {
  it('avanza 1 → 2 y no más allá; retrocede 2 → 1 y no más acá', () => {
    expect(ADD_INCOME_TOTAL_STEPS).toBe(2)
    expect(nextStep(1)).toBe(2)
    expect(nextStep(2)).toBeNull()
    expect(previousStep(2)).toBe(1)
    // Desde el paso 1 "atrás" es cerrar el alta: lo decide la screen.
    expect(previousStep(1)).toBeNull()
  })

  it('los tres campos se completan en el paso 1', () => {
    for (const field of INCOME_FORM_FIELDS) {
      expect(INCOME_FIELD_STEP[field]).toBe(1)
    }
  })
})

describe('flaggedFieldsForStep', () => {
  it('sin marcar el paso no pinta nada, aunque falte todo', () => {
    expect(flaggedFieldsForStep(EMPTY, 1, [])).toEqual([])
  })

  it('marcado el paso 1 pinta exactamente los faltantes de ese paso', () => {
    expect(flaggedFieldsForStep(EMPTY, 1, [1])).toEqual([
      'amount',
      'kind',
      'description',
    ])
    const soloDescripcion: AddIncomeDraft = { ...COMPLETE, description: '' }
    expect(flaggedFieldsForStep(soloDescripcion, 1, [1])).toEqual(['description'])
  })

  it('completar el campo apaga su highlight sin desmarcar el paso', () => {
    expect(flaggedFieldsForStep(COMPLETE, 1, [1])).toEqual([])
  })

  it('el paso 2 no hereda cues del paso 1', () => {
    // Lección de add-fijo: con un token global, marcar en un paso pintaba el
    // otro y el cue dejaba de significar "esto te falta ACÁ".
    expect(flaggedFieldsForStep(EMPTY, 2, [1])).toEqual([])
    expect(flaggedFieldsForStep(EMPTY, 2, [1, 2])).toEqual([])
  })

  it('volver del paso 2 al 1 NO pierde el highlight', () => {
    // El usuario marcó el paso 1, completó, avanzó, volvió y borró el monto:
    // el paso sigue marcado (`flaggedSteps` es acumulativo y no se limpia al
    // navegar), así que el campo se vuelve a pintar sin tocar el CTA de nuevo.
    const flaggedSteps = [1, 2] as const
    const sinMonto: AddIncomeDraft = { ...COMPLETE, amount: 0 }
    expect(flaggedFieldsForStep(sinMonto, 1, [...flaggedSteps])).toEqual(['amount'])
  })
})

describe('resolveEventDate', () => {
  const now = new Date(2026, 7, 4, 9, 30) // 2026-08-04 09:30 local

  it('0 = hoy, 1 = ayer, 2 = anteayer (clave de día local)', () => {
    expect(formatLocalDateKey(resolveEventDate(0, now))).toBe('2026-08-04')
    expect(formatLocalDateKey(resolveEventDate(1, now))).toBe('2026-08-03')
    expect(formatLocalDateKey(resolveEventDate(2, now))).toBe('2026-08-02')
  })

  it('cruza el borde de mes hacia atrás', () => {
    const primeroDeMes = new Date(2026, 7, 1, 0, 5)
    expect(formatLocalDateKey(resolveEventDate(2, primeroDeMes))).toBe('2026-07-30')
  })

  it('ancla al mediodía local (gotcha timestamptz)', () => {
    // A medianoche local, serializar a UTC en AR (UTC-3) devolvía el día
    // anterior. El mediodía deja 12h de margen para cualquier tz.
    expect(resolveEventDate(1, now).getHours()).toBe(12)
  })
})
