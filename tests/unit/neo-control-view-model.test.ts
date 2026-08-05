import { describe, expect, it } from 'vitest'
import {
  CONTROL_MOCK,
  computeControlView,
  type ControlMockData,
} from '@/features/insights/control-v2-mock'
import {
  buildAlcanciaContent,
  buildComparativaContent,
  buildHeroContent,
  buildPatronRows,
  buildRepartoContent,
  buildTendenciaBars,
  headerBrotPose,
  selectAlcanciaVariant,
  selectComparativaVariant,
  selectHeroVariant,
  selectPatronVariant,
  selectRepartoVariant,
  selectTendenciaVariant,
} from '@/features/insights/neo-control-view-model'
import type { SavingsGoal } from '@/features/savings-goals/savings-goal.model'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeData(over: Partial<ControlMockData> = {}): ControlMockData {
  return { ...CONTROL_MOCK, ...over }
}

function makeGoal(over: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: 'goal-1',
    familyId: 'fam-1',
    title: 'Vacaciones',
    emoji: 'airplane',
    goalAmount: 1_600_000,
    currentAmount: 1_000_000,
    targetMonths: 4,
    isActive: true,
    createdAt: '2026-06-01T12:00:00Z',
    updatedAt: '2026-07-01T12:00:00Z',
    ...over,
  }
}

// ---------------------------------------------------------------------------
// ② Hero — selección de variante
// ---------------------------------------------------------------------------

describe('selectHeroVariant', () => {
  it('sin proyección confiable → primerCiclo, gane o pierda', () => {
    expect(
      selectHeroVariant({
        hasReliableProjection: false,
        alreadyExhausted: false,
        sobrante: 1_000_000,
        cupoDiario: 100_000,
      }),
    ).toBe('primerCiclo')
  })

  it('sobrante negativo o presupuesto reventado → corto', () => {
    expect(
      selectHeroVariant({
        hasReliableProjection: true,
        alreadyExhausted: false,
        sobrante: -320_000,
        cupoDiario: 135_000,
      }),
    ).toBe('corto')
    expect(
      selectHeroVariant({
        hasReliableProjection: true,
        alreadyExhausted: true,
        sobrante: 50_000,
        cupoDiario: 135_000,
      }),
    ).toBe('corto')
  })

  it('margen menor a 1.5 cupos → ajustado; mayor → holgado (HC-B del handoff: +$180k con cupo $135k)', () => {
    expect(
      selectHeroVariant({
        hasReliableProjection: true,
        alreadyExhausted: false,
        sobrante: 180_000,
        cupoDiario: 135_000,
      }),
    ).toBe('ajustado')
    expect(
      selectHeroVariant({
        hasReliableProjection: true,
        alreadyExhausted: false,
        sobrante: 1_400_000,
        cupoDiario: 135_000,
      }),
    ).toBe('holgado')
  })
})

describe('buildHeroContent', () => {
  it('corto muestra el faltante en positivo (sin doble signo)', () => {
    const data = makeData()
    const view = computeControlView(data)
    const c = buildHeroContent({
      variant: 'corto',
      view: { ...view, sobrantePresupuestadoMes: -320_000 },
      data,
    })
    expect(c.amount).not.toMatch(/-/)
    expect(c.amount).toMatch(/^\$/)
  })

  it('el progreso del timeline es día actual / días del ciclo', () => {
    const data = makeData({ diaActual: 18, diasMes: 30 })
    const view = computeControlView(data)
    const c = buildHeroContent({ variant: 'holgado', view, data })
    expect(c.progressPct).toBe(60)
  })
})

// ---------------------------------------------------------------------------
// ③ Comparativa
// ---------------------------------------------------------------------------

describe('selectComparativaVariant', () => {
  it('sin mes anterior → primerMes', () => {
    expect(
      selectComparativaVariant({
        hasPreviousMonth: false,
        mpTotal: 0,
        vsMesAhorro: 0,
        hasReliableProjection: true,
      }),
    ).toBe('primerMes')
    // Arranque de ciclo con historia: proyección aún no confiable →
    // misma shape (copy "juntando datos" en el builder).
    expect(
      selectComparativaVariant({
        hasPreviousMonth: true,
        mpTotal: 6_600_000,
        vsMesAhorro: 6_600_000,
        hasReliableProjection: false,
      }),
    ).toBe('primerMes')
  })

  it('delta dentro del 5% del total previo → igual', () => {
    expect(
      selectComparativaVariant({
        hasPreviousMonth: true,
        mpTotal: 6_600_000,
        vsMesAhorro: 100_000,
        hasReliableProjection: true,
      }),
    ).toBe('igual')
  })

  it('ahorro positivo → menos; negativo → mas', () => {
    expect(
      selectComparativaVariant({
        hasPreviousMonth: true,
        mpTotal: 6_600_000,
        vsMesAhorro: 2_700_000,
        hasReliableProjection: true,
      }),
    ).toBe('menos')
    expect(
      selectComparativaVariant({
        hasPreviousMonth: true,
        mpTotal: 6_600_000,
        vsMesAhorro: -1_300_000,
        hasReliableProjection: true,
      }),
    ).toBe('mas')
  })
})

describe('buildComparativaContent', () => {
  it("'mas' no filtra el signo ASCII del delta al copy (el monto va en absoluto)", () => {
    const data = makeData()
    const view = computeControlView(data)
    const c = buildComparativaContent({
      variant: 'mas',
      view: { ...view, vsMesAhorro: -1_300_000, mpTotal: 6_600_000 },
      data,
      hasWrapped: false,
    })
    expect(c.anchorRight).not.toMatch(/-\$/)
    expect(c.stampAmount?.startsWith('+')).toBe(true)
    expect(c.mirrorPct).toBe(100)
    expect(c.ctaLabel).toBeUndefined()
  })

  it('los días atípicos excluidos se muestran solo cuando existen', () => {
    const data = makeData()
    const view = computeControlView(data)
    const sin = buildComparativaContent({
      variant: 'menos',
      view: { ...view, outlierDaysExcluded: 0, outlierDaysTotal: 0 },
      data,
      hasWrapped: true,
    })
    expect(sin.outliers).toBeUndefined()
    const con = buildComparativaContent({
      variant: 'menos',
      view: { ...view, outlierDaysExcluded: 2, outlierDaysTotal: 1_400_000 },
      data,
      hasWrapped: true,
    })
    expect(con.outliers?.count).toBe('2')
    expect(con.ctaLabel).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// ④ Tendencia
// ---------------------------------------------------------------------------

describe('tendencia', () => {
  it('las barras alinean cada día de last7 con su mismo día de la semana previa (dia − 7) y siempre son 7 columnas', () => {
    const data = makeData()
    const view = computeControlView(data)
    const bars = buildTendenciaBars({ view, cupoDiario: data.cupoDiario, todayDow: 2 })
    expect(bars).toHaveLength(7)
    // El padding va al INICIO: las últimas view.last7.length barras son
    // los días reales, alineados con su sombra de la semana previa.
    const real = bars.slice(bars.length - view.last7.length)
    const byDia = new Map(view.detalleDias.map((x) => [x.dia, x]))
    view.last7.forEach((d, i) => {
      const prev = byDia.get(d.dia - 7)
      if (!prev || prev.gasto === 0) {
        expect(real[i].prevH).toBe(0)
      } else {
        expect(real[i].prevH).toBeGreaterThan(0)
      }
    })
  })

  it('hoy (inProgress) queda marcado esHoy y usa el DOW real (no el dow:0 hardcodeado de computeControlView)', () => {
    const data = makeData()
    const view = computeControlView(data)
    const bars = buildTendenciaBars({ view, cupoDiario: data.cupoDiario, todayDow: 2 })
    const hoy = bars.find((b) => b.esHoy)
    expect(hoy).toBeDefined()
    // dow 2 (0=Lun) = miércoles → inicial "X" en es.
    expect(hoy?.label).toBe('X')
  })

  it('pocos días cerrados → arranca', () => {
    const dias = [40_000, 30_000]
    const data = makeData({ dias, diasDow: [0, 1], diaActual: 3 })
    const view = computeControlView(data)
    expect(selectTendenciaVariant({ view, cupoDiario: data.cupoDiario })).toBe('arranca')
  })

  it('semana sin gastos → sinGastos', () => {
    const dias = Array.from({ length: 20 }, () => 0)
    const data = makeData({ dias, diasDow: dias.map((_, i) => i % 7), diaActual: 21, gastoHoy: 0 })
    const view = computeControlView(data)
    expect(selectTendenciaVariant({ view, cupoDiario: data.cupoDiario })).toBe('sinGastos')
  })
})

// ---------------------------------------------------------------------------
// ⑤ Patrón
// ---------------------------------------------------------------------------

describe('patrón', () => {
  it('rows: con datos van ordenadas de mayor a menor, peor primera y mejor última', () => {
    const data = makeData()
    const view = computeControlView(data)
    const rows = buildPatronRows({ view })
    const conBarra = rows.filter((r) => !r.dim)
    for (let i = 1; i < conBarra.length; i++) {
      expect(conBarra[i - 1].widthPct).toBeGreaterThanOrEqual(conBarra[i].widthPct)
    }
    if (conBarra.length > 1) {
      expect(conBarra[0].tag === 'peor' || conBarra[0].tag === undefined).toBe(true)
      expect(conBarra[conBarra.length - 1].tag).toBe('mejor')
    }
  })

  it('pocos días con gasto → pocosDatos', () => {
    const dias = [50_000, 60_000, 0, 0]
    const data = makeData({ dias, diasDow: [0, 1, 2, 3], diaActual: 5 })
    const view = computeControlView(data)
    expect(selectPatronVariant({ view })).toBe('pocosDatos')
  })
})

// ---------------------------------------------------------------------------
// ⑥ Reparto
// ---------------------------------------------------------------------------

describe('reparto', () => {
  it('selección de variante: sinFijos > variable > fijosAltos > ahorroActivo > sinAhorro', () => {
    expect(
      selectRepartoVariant({ fijosMes: 0, ahorroMes: 0, ingresoMes: 6_500_000, incomeMode: 'fixed' }),
    ).toBe('sinFijos')
    expect(
      selectRepartoVariant({
        fijosMes: 1_200_000,
        ahorroMes: 0,
        ingresoMes: 6_500_000,
        incomeMode: 'dynamic',
      }),
    ).toBe('ingresoVariable')
    expect(
      selectRepartoVariant({
        fijosMes: 2_800_000,
        ahorroMes: 0,
        ingresoMes: 6_500_000,
        incomeMode: 'fixed',
      }),
    ).toBe('fijosAltos')
    expect(
      selectRepartoVariant({
        fijosMes: 1_200_000,
        ahorroMes: 1_000_000,
        ingresoMes: 6_500_000,
        incomeMode: 'fixed',
      }),
    ).toBe('ahorroActivo')
    expect(
      selectRepartoVariant({
        fijosMes: 1_200_000,
        ahorroMes: 0,
        ingresoMes: 6_500_000,
        incomeMode: 'fixed',
      }),
    ).toBe('sinAhorro')
  })

  it('ahorroActivo: la marca de la escala cae al FINAL del tramo teal (SD-A: día 11 de 30 = 36.7%)', () => {
    const data = makeData({ ingresoMes: 6_500_000, fijosMes: 1_300_000, diasMes: 30, diaActual: 18 })
    const view = computeControlView(data)
    // fijosDias = coberturaFijos (deriva del view); forzamos un caso limpio:
    const c = buildRepartoContent({
      variant: 'ahorroActivo',
      view: { ...view, coberturaFijos: 6 },
      data,
      ahorroMes: 1_083_333, // ≈ 5 días de 30
    })
    expect(c.scale?.mid?.pos).toBeCloseTo(36.7, 0)
  })
})

// ---------------------------------------------------------------------------
// ⑦ Alcancía
// ---------------------------------------------------------------------------

describe('alcancía', () => {
  it('meta activa incompleta → enMarcha; completa → cumplida', () => {
    expect(
      selectAlcanciaVariant({ goal: makeGoal(), vault: 100_000, diaActual: 18, diasConGasto: 10, closedDays: 17 }),
    ).toBe('enMarcha')
    expect(
      selectAlcanciaVariant({
        goal: makeGoal({ currentAmount: 1_600_000 }),
        vault: 0,
        diaActual: 18,
        diasConGasto: 10,
        closedDays: 17,
      }),
    ).toBe('cumplida')
  })

  it('sin meta: vacía / arrancando / sinAporte / inactiva según los pisos de la card vieja', () => {
    expect(
      selectAlcanciaVariant({ goal: null, vault: 0, diaActual: 2, diasConGasto: 0, closedDays: 1 }),
    ).toBe('vacia')
    expect(
      selectAlcanciaVariant({ goal: null, vault: 50_000, diaActual: 3, diasConGasto: 2, closedDays: 2 }),
    ).toBe('arrancando')
    expect(
      selectAlcanciaVariant({ goal: null, vault: 0, diaActual: 15, diasConGasto: 10, closedDays: 14 }),
    ).toBe('sinAporte')
    expect(
      selectAlcanciaVariant({ goal: null, vault: 400_000, diaActual: 15, diasConGasto: 10, closedDays: 14 }),
    ).toBe('inactiva')
  })

  it('enMarcha llena el frasco con el % real de la meta y estima ciclos con el vault', () => {
    const c = buildAlcanciaContent({
      variant: 'enMarcha',
      goal: makeGoal(),
      vault: 200_000,
      monthlyIncome: 2_000_000,
      diaActual: 18,
      diasMes: 30,
    })
    expect(c.jar?.fillPct).toBe(63) // 1.0M / 1.6M
    expect(c.jar?.pctLabel).toBe('63%')
    // faltan 600k / vault 200k → 3 ciclos
    expect(c.goalChip?.rest).toContain('3')
  })
})

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

describe('headerBrotPose', () => {
  it('mapea el score a la pose (cool ≥80 como el 94 del handoff)', () => {
    expect(headerBrotPose(94, true)).toBe('cool')
    expect(headerBrotPose(70, true)).toBe('cheer')
    expect(headerBrotPose(55, true)).toBe('think')
    expect(headerBrotPose(40, true)).toBe('worried')
    expect(headerBrotPose(10, true)).toBe('sad')
    expect(headerBrotPose(94, false)).toBe('wave')
  })
})
