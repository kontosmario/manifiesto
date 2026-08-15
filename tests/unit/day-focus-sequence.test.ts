import { describe, it, expect } from 'vitest'
import {
  buildDayFocusTargets,
  dayFocusNavBounds,
  findDayFocusIndex,
  localIsoKey,
  type DayFocusTarget,
} from '@/features/gastos/day-focus-sequence'

/** Días [start, end] normalizados a medianoche local, como los arma la pantalla. */
function datesBetween(start: Date, endInclusive: Date): Date[] {
  const out: Date[] = []
  for (
    let d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    d.getTime() <= endInclusive.getTime();
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    out.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()))
  }
  return out
}

const midnight = (y: number, m: number, d: number) => new Date(y, m, d).getTime()

/**
 * Caso REAL del QA del owner (2026-08-14, cuenta ciclo.extendido):
 * payday 5, cobro sin confirmar → la ventana arranca el 5-jul y se estira
 * hasta el 15-ago (hoy+1, exclusivo). Dura 41 días, así que los números
 * 5..14 existen en julio Y en agosto.
 */
describe('secuencia de foco — ventana EXTENDIDA', () => {
  const HOY = midnight(2026, 7, 14) // 14-ago-2026
  // cycleDates llega hasta el último día de la ventana estirada: 15-ago.
  const cycleDates = datesBetween(new Date(2026, 6, 5), new Date(2026, 7, 15))

  const targets = buildDayFocusTargets({
    cycleDates,
    todayStartMs: HOY,
    outDays: [],
    isOverdue: false,
  })

  it('el último destino navegable es HOY, no el fin de la ventana estirada', () => {
    const last = targets[targets.length - 1]
    expect(last?.iso).toBe('2026-08-14')
    // 15-ago está en la ventana pero es FUTURO: no puede ser destino.
    expect(targets.some((t) => t.iso === '2026-08-15')).toBe(false)
  })

  it('parado en HOY la flecha › queda DESHABILITADA', () => {
    const i = findDayFocusIndex(targets, {
      selectedDayIso: '2026-08-14',
      selectedOutIso: null,
    })
    expect(i).toBe(targets.length - 1)
    expect(dayFocusNavBounds(i, targets.length)).toEqual({
      canGoPrev: true,
      canGoNext: false,
    })
  })

  it('el día-de-mes se repite: buscarlo por número apuntaba al mes equivocado', () => {
    // El bug original: findIndex(t => t.day === 14) devolvía JULIO.
    const porNumero = targets.findIndex((t) => t.kind === 'cycle' && t.day === 14)
    expect(targets[porNumero]?.iso).toBe('2026-07-14')

    // Por ISO cae donde corresponde.
    const porIso = findDayFocusIndex(targets, {
      selectedDayIso: '2026-08-14',
      selectedOutIso: null,
    })
    expect(porIso).toBeGreaterThan(porNumero)
    expect(targets[porIso]?.iso).toBe('2026-08-14')
  })

  it('› desde el 14 de agosto NO avanza (era el síntoma: seguía avanzando)', () => {
    const i = findDayFocusIndex(targets, {
      selectedDayIso: '2026-08-14',
      selectedOutIso: null,
    })
    const { canGoNext } = dayFocusNavBounds(i, targets.length)
    expect(canGoNext).toBe(false)

    // Con la identificación por NÚMERO (el código viejo) sí avanzaba, y al
    // día equivocado: el 15 de JULIO.
    const iViejo = targets.findIndex((t) => t.kind === 'cycle' && t.day === 14)
    expect(dayFocusNavBounds(iViejo, targets.length).canGoNext).toBe(true)
    expect(targets[iViejo + 1]?.iso).toBe('2026-07-15')
  })

  it('› desde un día de julio avanza al SIGUIENTE de julio, no salta de mes', () => {
    const i = findDayFocusIndex(targets, {
      selectedDayIso: '2026-07-14',
      selectedOutIso: null,
    })
    expect(targets[i + 1]?.iso).toBe('2026-07-15')
  })

  it('‹ desde el primer día del ciclo queda deshabilitada', () => {
    const i = findDayFocusIndex(targets, {
      selectedDayIso: '2026-07-05',
      selectedOutIso: null,
    })
    expect(i).toBe(0)
    expect(dayFocusNavBounds(i, targets.length)).toEqual({
      canGoPrev: false,
      canGoNext: true,
    })
  })
})

describe('secuencia de foco — modelo NOMINAL con días FUERA', () => {
  const HOY = midnight(2026, 7, 14)
  // Ciclo 5-jul → 5-ago (exclusivo), vencido: 5..14 de agosto quedan fuera.
  const cycleDates = datesBetween(new Date(2026, 6, 5), new Date(2026, 7, 4))
  const outDays = datesBetween(new Date(2026, 7, 5), new Date(2026, 7, 14)).map((d) => ({
    iso: localIsoKey(d),
  }))

  const targets = buildDayFocusTargets({
    cycleDates,
    todayStartMs: HOY,
    outDays,
    isOverdue: true,
  })

  it('los dos tramos quedan contiguos y en orden', () => {
    const isos = targets.map((t) => t.iso)
    expect(isos[0]).toBe('2026-07-05')
    expect(isos[isos.length - 1]).toBe('2026-08-14')
    for (let i = 1; i < isos.length; i++) {
      expect(isos[i] > isos[i - 1]).toBe(true)
    }
  })

  it('› cruza del último día del ciclo al primer día FUERA', () => {
    const i = findDayFocusIndex(targets, {
      selectedDayIso: '2026-08-04',
      selectedOutIso: null,
    })
    const next = targets[i + 1]
    expect(next?.kind).toBe('out')
    expect(next?.iso).toBe('2026-08-05')
  })

  it('parado en el último día FUERA (hoy) › queda deshabilitada', () => {
    const i = findDayFocusIndex(targets, {
      selectedDayIso: null,
      selectedOutIso: '2026-08-14',
    })
    expect(i).toBe(targets.length - 1)
    expect(dayFocusNavBounds(i, targets.length).canGoNext).toBe(false)
  })

  it('sin ciclo vencido el tramo FUERA no se agrega', () => {
    const soloCiclo = buildDayFocusTargets({
      cycleDates,
      todayStartMs: HOY,
      outDays,
      isOverdue: false,
    })
    expect(soloCiclo.every((t) => t.kind === 'cycle')).toBe(true)
  })
})

describe('secuencia de foco — invariantes generales', () => {
  it('sin día en foco no hay navegación', () => {
    const targets: DayFocusTarget[] = [
      { kind: 'cycle', iso: '2026-08-01', day: 1 },
      { kind: 'cycle', iso: '2026-08-02', day: 2 },
    ]
    const i = findDayFocusIndex(targets, { selectedDayIso: null, selectedOutIso: null })
    expect(i).toBe(-1)
    expect(dayFocusNavBounds(i, targets.length)).toEqual({
      canGoPrev: false,
      canGoNext: false,
    })
  })

  it('un ISO que no está en la secuencia no habilita flechas', () => {
    const targets: DayFocusTarget[] = [{ kind: 'cycle', iso: '2026-08-01', day: 1 }]
    const i = findDayFocusIndex(targets, {
      selectedDayIso: '2026-12-25',
      selectedOutIso: null,
    })
    expect(i).toBe(-1)
    expect(dayFocusNavBounds(i, targets.length).canGoNext).toBe(false)
  })

  it('ningún destino cae después de HOY, cualquiera sea la ventana', () => {
    const HOY = midnight(2026, 7, 14)
    for (const extra of [0, 1, 5, 30]) {
      const cycleDates = datesBetween(
        new Date(2026, 6, 5),
        new Date(2026, 7, 14 + extra),
      )
      const targets = buildDayFocusTargets({
        cycleDates,
        todayStartMs: HOY,
        outDays: [],
        isOverdue: false,
      })
      for (const t of targets) expect(t.iso <= '2026-08-14').toBe(true)
    }
  })

  it('localIsoKey usa la fecha LOCAL (no corre el día como toISOString)', () => {
    // 1-ene a medianoche local: en tz negativas toISOString devolvería 31-dic.
    expect(localIsoKey(new Date(2026, 0, 1))).toBe('2026-01-01')
    expect(localIsoKey(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})
