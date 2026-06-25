import { describe, expect, it } from 'vitest'
import {
  fernSizeForAge,
  deriveGardenCells,
  deriveRecoverableGap,
  deriveWeekClose,
  deriveWeekStrip,
  gardenFirstActivity,
  weeksToShow,
} from '@/features/garden/garden-model'

describe('gardenFirstActivity (anclaje a tu inicio)', () => {
  it('sin actividad → null', () => {
    expect(gardenFirstActivity([], '2026-06-01')).toBeNull()
  })
  it('sin fecha de cuenta → el registro más viejo (fallback)', () => {
    expect(gardenFirstActivity(['2026-05-01', '2026-06-10'], null)).toBe('2026-05-01')
  })
  it('clampea a la cuenta: ignora back-date anterior a tu inicio', () => {
    expect(
      gardenFirstActivity(['2026-05-01', '2026-06-10', '2026-06-15'], '2026-06-01'),
    ).toBe('2026-06-10')
  })
  it('solo hay back-date pre-cuenta → null (no extiende el jardín)', () => {
    expect(gardenFirstActivity(['2026-05-01'], '2026-06-01')).toBeNull()
  })
})

describe('weeksToShow', () => {
  const today = '2026-06-24' // miércoles
  it('sin actividad → 1', () => {
    expect(weeksToShow(null, today)).toBe(1)
  })
  it('primer registro en la semana actual → 1', () => {
    expect(weeksToShow('2026-06-23', today)).toBe(1)
  })
  it('primer registro 2 semanas atrás → 3 (incluye la actual)', () => {
    expect(weeksToShow('2026-06-10', today)).toBe(3)
  })
  it('tope de 5', () => {
    expect(weeksToShow('2026-01-01', today)).toBe(5)
  })
})

describe('fernSizeForAge', () => {
  it('grows from 24 (age 7, recién arraigado) to 32 and caps', () => {
    expect(fernSizeForAge(7)).toBe(24)
    expect(fernSizeForAge(27)).toBe(32)
    expect(fernSizeForAge(60)).toBe(32)
  })
})

describe('deriveGardenCells (semanas calendario dinámicas)', () => {
  const today = '2026-06-24' // miércoles; lunes de la semana = 2026-06-22

  it('cuenta nueva (sin actividad) → 7 celdas (semana actual), hoy pending', () => {
    const cells = deriveGardenCells(new Set(), today, null)
    expect(cells).toHaveLength(7)
    expect(cells[0].iso).toBe('2026-06-22') // lunes
    const hoy = cells.find((c) => c.iso === today)!
    expect(hoy.stage).toBe('pending')
    expect(hoy.isToday).toBe(true)
    // días futuros de la semana en curso = 'pre' (tile tenue)
    expect(cells[6].iso).toBe('2026-06-28') // domingo
    expect(cells[6].stage).toBe('pre')
  })

  it('crece a N semanas; hoy=seed, hueco=missed, pre-inicio=pre', () => {
    const cells = deriveGardenCells(new Set(['2026-06-24']), today, '2026-06-10')
    expect(cells).toHaveLength(21) // 3 semanas (06-08, 06-15, 06-22)
    expect(cells[0].iso).toBe('2026-06-08')
    const hoy = cells.find((c) => c.iso === today)!
    expect(hoy.stage).toBe('seed')
    const hueco = cells.find((c) => c.iso === '2026-06-23')! // ayer, sin registrar
    expect(hueco.stage).toBe('missed')
    const preInicio = cells.find((c) => c.iso === '2026-06-09')! // antes del primer registro
    expect(preInicio.stage).toBe('pre')
  })

  it('curva por edad: semilla 0–1, creciendo 2–6, arraigado 7+', () => {
    // today = 2026-06-24. Días sueltos (sin semana completa → sin floración).
    const act = new Set([
      '2026-06-24', // edad 0 → semilla
      '2026-06-23', // edad 1 → semilla
      '2026-06-22', // edad 2 → creciendo
      '2026-06-18', // edad 6 → creciendo
      '2026-06-17', // edad 7 → arraigado
    ])
    const cells = deriveGardenCells(act, today, '2026-06-01')
    const stageOf = (iso: string) => cells.find((c) => c.iso === iso)!.stage
    expect(stageOf('2026-06-24')).toBe('seed')
    expect(stageOf('2026-06-23')).toBe('seed')
    expect(stageOf('2026-06-22')).toBe('germ')
    expect(stageOf('2026-06-18')).toBe('germ')
    expect(stageOf('2026-06-17')).toBe('fern')
  })

  it('semana PERFECTA (7/7) → todos los brotes florecen (bloom)', () => {
    const fullWeek = [
      '2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18',
      '2026-06-19', '2026-06-20', '2026-06-21',
    ]
    const cells = deriveGardenCells(new Set(fullWeek), today, '2026-06-15')
    for (const iso of fullWeek) {
      expect(cells.find((c) => c.iso === iso)!.stage).toBe('bloom')
    }
  })

  it('6/7 NO florece: arraigado + el hueco salteado', () => {
    const sixOfSeven = [
      '2026-06-15', '2026-06-16', '2026-06-17',
      '2026-06-18', '2026-06-19', '2026-06-20',
    ] // falta 06-21
    const cells = deriveGardenCells(new Set(sixOfSeven), today, '2026-06-15')
    expect(cells.find((c) => c.iso === '2026-06-15')!.stage).toBe('fern')
    expect(cells.find((c) => c.iso === '2026-06-21')!.stage).toBe('missed')
  })

  it('día recuperado → stage "recovered"; la semana NO florece', () => {
    const organic = new Set([
      '2026-06-15', '2026-06-16', '2026-06-17',
      '2026-06-18', '2026-06-19', '2026-06-20',
    ])
    const recovered = new Set(['2026-06-21']) // el hueco, plantado con ayuda
    const cells = deriveGardenCells(organic, today, '2026-06-15', recovered)
    expect(cells.find((c) => c.iso === '2026-06-21')!.stage).toBe('recovered')
    // los otros 6 arraigan por edad, pero NINGUNO florece (no es 7/7 orgánico)
    for (const iso of organic) {
      expect(cells.find((c) => c.iso === iso)!.stage).not.toBe('bloom')
    }
    expect(cells.find((c) => c.iso === '2026-06-15')!.stage).toBe('fern')
  })
})

describe('deriveRecoverableGap (espejo cliente del RPC)', () => {
  const today = '2026-06-24' // mié; semana cerrada = 2026-06-15..21 (L→D)
  const sixDays = [
    '2026-06-15', '2026-06-16', '2026-06-17',
    '2026-06-18', '2026-06-19', '2026-06-20',
  ]

  it('6/7 + escudo → devuelve el hueco', () => {
    expect(deriveRecoverableGap(new Set(sixDays), new Set(), today, '2026-06-01', 1)).toBe('2026-06-21')
  })
  it('7/7 → null (no hay hueco)', () => {
    expect(deriveRecoverableGap(new Set([...sixDays, '2026-06-21']), new Set(), today, '2026-06-01', 1)).toBeNull()
  })
  it('5/7 → null (más de un hueco)', () => {
    expect(deriveRecoverableGap(new Set(sixDays.slice(0, 5)), new Set(), today, '2026-06-01', 1)).toBeNull()
  })
  it('6/7 sin escudo → null', () => {
    expect(deriveRecoverableGap(new Set(sixDays), new Set(), today, '2026-06-01', 0)).toBeNull()
  })
  it('hueco ya recuperado → null (cuenta como lleno = 7/7)', () => {
    expect(deriveRecoverableGap(new Set(sixDays), new Set(['2026-06-21']), today, '2026-06-01', 1)).toBeNull()
  })
  it('hueco pre-cuenta → null (no es un salteado real)', () => {
    // 06-16..06-21 registrados (6), hueco = 06-15, pero la cuenta arrancó 06-16.
    const six = ['2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21']
    expect(deriveRecoverableGap(new Set(six), new Set(), today, '2026-06-16', 1)).toBeNull()
  })
})

describe('deriveWeekClose', () => {
  // Monday..Sunday of a reference week
  const weekDayIso = (i: number) =>
    new Date(Date.UTC(2026, 5, 16) + i * 86_400_000).toISOString().slice(0, 10)
  it('score 7 = perfect week, fern + bloom', () => {
    const all = new Set(Array.from({ length: 7 }, (_, i) => weekDayIso(i)))
    const wc = deriveWeekClose(all, weekDayIso)
    expect(wc.score).toBe(7)
    expect(wc.stage).toBe('fern')
    expect(wc.bloom).toBe(true)
    expect(wc.label).toBe('Semana perfecta')
  })
  it('score thresholds map to stages', () => {
    const mk = (n: number) => new Set(Array.from({ length: n }, (_, i) => weekDayIso(i)))
    expect(deriveWeekClose(mk(6), weekDayIso).stage).toBe('fern')
    expect(deriveWeekClose(mk(4), weekDayIso).stage).toBe('germ')
    expect(deriveWeekClose(mk(2), weekDayIso).stage).toBe('seed')
    expect(deriveWeekClose(mk(0), weekDayIso).stage).toBe('none')
  })
})

describe('deriveWeekStrip', () => {
  // Semana Lun 6/16 .. Dom 6/22; hoy = 6/19 (índice 3).
  const weekDayIso = (i: number) =>
    new Date(Date.UTC(2026, 5, 16) + i * 86_400_000).toISOString().slice(0, 10)
  const todayIso = '2026-06-19'

  it('clasifica logged / missed / pending / future', () => {
    const activity = new Set(['2026-06-16', '2026-06-17']) // Lun, Mar registrados
    const strip = deriveWeekStrip(activity, todayIso, weekDayIso)
    expect(strip[0].state).toBe('logged') // Lun
    expect(strip[1].state).toBe('logged') // Mar
    expect(strip[2].state).toBe('missed') // Mié (pasado, sin registrar)
    expect(strip[3].state).toBe('pending') // Jue = hoy, sin registrar
    expect(strip[3].isToday).toBe(true)
    expect(strip[4].state).toBe('future') // Vie
    expect(strip[6].state).toBe('future') // Dom
  })

  it('hoy registrado = logged (no pending)', () => {
    const strip = deriveWeekStrip(new Set(['2026-06-19']), todayIso, weekDayIso)
    expect(strip[3].state).toBe('logged')
  })

  it('días previos al inicio (startIso) = future tenue, no missed', () => {
    // inicio de cuenta 06-18 → Lun 06-16 y Mar 06-17 (antes) = future, no missed
    const strip = deriveWeekStrip(new Set(), todayIso, weekDayIso, '2026-06-18')
    expect(strip[0].state).toBe('future')
    expect(strip[1].state).toBe('future')
    expect(strip[3].state).toBe('pending') // hoy 06-19
  })
})
