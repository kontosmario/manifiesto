import { describe, expect, it } from 'vitest'
import {
  fernSizeForAge,
  deriveGardenCells,
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
  it('día logged Y recuperado → gana el brote orgánico (logged-first), no coral', () => {
    // Back-dateás un gasto real sobre un día que un escudo recuperó antes: el día
    // es orgánico → stage por edad (germ), NO 'recovered'. Coherente con
    // deriveWeekStrip/deriveWeekClose (logged gana a recovered).
    const organic = new Set(['2026-06-21'])
    const recovered = new Set(['2026-06-21'])
    const cells = deriveGardenCells(organic, today, '2026-06-15', recovered)
    const cell = cells.find((c) => c.iso === '2026-06-21')!
    expect(cell.stage).toBe('germ') // age 3 → germinando, orgánico
    expect(cell.stage).not.toBe('recovered')
  })
})

describe('deriveWeekClose', () => {
  // Monday..Sunday of a reference week
  const weekDayIso = (i: number) =>
    new Date(Date.UTC(2026, 5, 16) + i * 86_400_000).toISOString().slice(0, 10)
  const NONE = new Set<string>()
  it('score 7 = perfect week, fern + bloom', () => {
    const all = new Set(Array.from({ length: 7 }, (_, i) => weekDayIso(i)))
    const wc = deriveWeekClose(all, NONE, weekDayIso)
    expect(wc.score).toBe(7)
    expect(wc.stage).toBe('fern')
    expect(wc.bloom).toBe(true)
    expect(wc.label).toBe('Semana perfecta')
  })
  it('score thresholds map to stages', () => {
    const mk = (n: number) => new Set(Array.from({ length: n }, (_, i) => weekDayIso(i)))
    expect(deriveWeekClose(mk(6), NONE, weekDayIso).stage).toBe('fern')
    expect(deriveWeekClose(mk(4), NONE, weekDayIso).stage).toBe('germ')
    expect(deriveWeekClose(mk(2), NONE, weekDayIso).stage).toBe('seed')
    expect(deriveWeekClose(mk(0), NONE, weekDayIso).stage).toBe('none')
  })
  it('día recuperado por escudo NO suma al score ni florece (6 orgánicos + 1 recuperado = 6/7)', () => {
    const organic = new Set(Array.from({ length: 6 }, (_, i) => weekDayIso(i))) // L..S
    const recovered = new Set([weekDayIso(6)]) // Dom recuperado por escudo
    const wc = deriveWeekClose(organic, recovered, weekDayIso)
    expect(wc.score).toBe(6) // el recuperado NO cuenta al score → "gran semana", no "perfecta"
    expect(wc.bloom).toBe(false) // un escudo nunca fabrica floración
    expect(wc.days[6].registered).toBe(false)
    expect(wc.days[6].recovered).toBe(true) // pero se marca recuperado (coral en la celebración)
    expect(wc.days[0].recovered).toBe(false)
  })
})

describe('deriveWeekClose · las 4 variantes del cierre (T10)', () => {
  const weekDayIso = (i: number) =>
    new Date(Date.UTC(2026, 5, 16) + i * 86_400_000).toISOString().slice(0, 10)
  const NONE = new Set<string>()
  /** Los primeros `n` días de la semana, plantados. */
  const mk = (n: number) => new Set(Array.from({ length: n }, (_, i) => weekDayIso(i)))
  const variantOf = (n: number, opts?: { streakAlive?: boolean }) =>
    deriveWeekClose(mk(n), NONE, weekDayIso, opts).variant

  it('7 → perfecta (la única que florece)', () => {
    const wc = deriveWeekClose(mk(7), NONE, weekDayIso)
    expect(wc.variant).toBe('perfecta')
    expect(wc.bloom).toBe(true)
  })

  it('6 y 5 → buena', () => {
    expect(variantOf(6)).toBe('buena')
    expect(variantOf(5)).toBe('buena')
    expect(deriveWeekClose(mk(6), NONE, weekDayIso).bloom).toBe(false)
  })

  it('4, 3 y 2 → floja', () => {
    expect(variantOf(4)).toBe('floja')
    expect(variantOf(3)).toBe('floja')
    expect(variantOf(2)).toBe('floja')
  })

  it('1 y 0 con la racha MUERTA → cortada', () => {
    expect(variantOf(1)).toBe('cortada')
    expect(variantOf(0)).toBe('cortada')
    expect(variantOf(1, { streakAlive: false })).toBe('cortada')
    expect(variantOf(0, { streakAlive: false })).toBe('cortada')
  })

  it('1 y 0 con la racha VIVA → floja: decir "se cortó" mentiría', () => {
    // Si la única actividad de la semana fue el domingo, la racha cruza viva
    // al lunes: la semana fue floja, pero NO se cortó nada.
    expect(variantOf(1, { streakAlive: true })).toBe('floja')
    expect(variantOf(0, { streakAlive: true })).toBe('floja')
  })

  it('la guarda de racha viva NO toca los tramos de arriba', () => {
    expect(variantOf(7, { streakAlive: true })).toBe('perfecta')
    expect(variantOf(5, { streakAlive: true })).toBe('buena')
    expect(variantOf(2, { streakAlive: true })).toBe('floja')
  })

  it('el copy sale del tramo: label/title/sub por variante', () => {
    expect(deriveWeekClose(mk(7), NONE, weekDayIso).label).toBe('Semana perfecta')
    expect(deriveWeekClose(mk(5), NONE, weekDayIso).label).toBe('Buena semana')
    expect(deriveWeekClose(mk(3), NONE, weekDayIso).label).toBe('Semana floja')
    expect(deriveWeekClose(mk(0), NONE, weekDayIso).title).toBe('Tu racha se cortó.')
    // La misma semana vacía con la racha viva NO puede decir que se cortó.
    expect(deriveWeekClose(mk(0), NONE, weekDayIso, { streakAlive: true }).title).not.toContain(
      'cortó',
    )
  })

  it('conserva stage/bloom (los consumen la celebración vieja y el preview de la intro)', () => {
    const wc = deriveWeekClose(mk(4), NONE, weekDayIso)
    expect(wc.stage).toBe('germ')
    expect(wc.bloom).toBe(false)
  })
})

describe('deriveWeekClose · día en calma', () => {
  const weekDayIso = (i: number) =>
    new Date(Date.UTC(2026, 5, 16) + i * 86_400_000).toISOString().slice(0, 10)
  const NONE = new Set<string>()

  it('sin markedDaysIso ningún día es calma (aunque estén plantados)', () => {
    const all = new Set(Array.from({ length: 7 }, (_, i) => weekDayIso(i)))
    const wc = deriveWeekClose(all, NONE, weekDayIso)
    expect(wc.days.every((d) => d.calma === false)).toBe(true)
  })

  it('marcado y SIN gastos discrecionales → calma (y sigue contando al score)', () => {
    const miercoles = weekDayIso(2)
    const wc = deriveWeekClose(new Set([miercoles]), NONE, weekDayIso, {
      markedDaysIso: [miercoles],
      discrecionalesPorDia: new Map(),
    })
    expect(wc.days[2].calma).toBe(true)
    expect(wc.days[2].registered).toBe(true)
    expect(wc.score).toBe(1)
    expect(wc.days[1].calma).toBe(false)
  })

  it('un día con pagos de FIJOS igual está en calma (la regla mira discrecionales)', () => {
    const jueves = weekDayIso(3)
    const wc = deriveWeekClose(new Set([jueves]), NONE, weekDayIso, {
      markedDaysIso: [jueves],
      // 2 pagos de fijos ese día: `todos` los cuenta, `discrecionales` no.
      discrecionalesPorDia: new Map([[jueves, 0]]),
    })
    expect(wc.days[3].calma).toBe(true)
  })

  it('marcado con force sobre un día CON compras → NO es calma', () => {
    const viernes = weekDayIso(4)
    const wc = deriveWeekClose(new Set([viernes]), NONE, weekDayIso, {
      markedDaysIso: [viernes],
      discrecionalesPorDia: new Map([[viernes, 3]]),
    })
    expect(wc.days[4].calma).toBe(false)
    expect(wc.days[4].registered).toBe(true)
  })

  it('acepta un Set de días marcados igual que un array', () => {
    const lunes = weekDayIso(0)
    const wc = deriveWeekClose(new Set([lunes]), NONE, weekDayIso, {
      markedDaysIso: new Set([lunes]),
    })
    expect(wc.days[0].calma).toBe(true)
  })
})

describe('deriveWeekStrip', () => {
  // Semana Lun 6/16 .. Dom 6/22; hoy = 6/19 (índice 3).
  const weekDayIso = (i: number) =>
    new Date(Date.UTC(2026, 5, 16) + i * 86_400_000).toISOString().slice(0, 10)
  const todayIso = '2026-06-19'
  const NONE = new Set<string>()

  it('clasifica logged / missed / pending / future', () => {
    const activity = new Set(['2026-06-16', '2026-06-17']) // Lun, Mar registrados
    const strip = deriveWeekStrip(activity, NONE, todayIso, weekDayIso)
    expect(strip[0].state).toBe('logged') // Lun
    expect(strip[1].state).toBe('logged') // Mar
    expect(strip[2].state).toBe('missed') // Mié (pasado, sin registrar)
    expect(strip[3].state).toBe('pending') // Jue = hoy, sin registrar
    expect(strip[3].isToday).toBe(true)
    expect(strip[4].state).toBe('future') // Vie
    expect(strip[6].state).toBe('future') // Dom
  })

  it('hoy registrado = logged (no pending)', () => {
    const strip = deriveWeekStrip(new Set(['2026-06-19']), NONE, todayIso, weekDayIso)
    expect(strip[3].state).toBe('logged')
  })

  it('día recuperado por escudo = recovered (coral, no missed)', () => {
    // 06-17 (pasado, sin gasto) recuperado por un escudo → 'recovered'; 06-18 sin
    // recuperar sigue 'missed'. El recuperado gana al missed en el orden de checks.
    const strip = deriveWeekStrip(new Set(), new Set(['2026-06-17']), todayIso, weekDayIso)
    expect(strip[1].state).toBe('recovered') // 06-17 recuperado
    expect(strip[2].state).toBe('missed') // 06-18 sin recuperar
  })

  it('días previos al inicio (startIso) = future tenue, no missed', () => {
    // inicio de cuenta 06-18 → Lun 06-16 y Mar 06-17 (antes) = future, no missed
    const strip = deriveWeekStrip(new Set(), NONE, todayIso, weekDayIso, '2026-06-18')
    expect(strip[0].state).toBe('future')
    expect(strip[1].state).toBe('future')
    expect(strip[3].state).toBe('pending') // hoy 06-19
  })
})
