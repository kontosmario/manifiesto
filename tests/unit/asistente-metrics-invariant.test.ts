import { describe, expect, it } from 'vitest'

import { CONTROL_MOCK, computeControlView, type ControlMockData } from '@/features/insights/control-v2-mock'

/**
 * INVARIANTE de las MÉTRICAS del asistente (los números que el hero/Control
 * muestran, fuera de las señales): saldo, cupo diario, promedio, proyección de
 * cierre, días bajo cupo, ratios, %. `computeControlView` debe devolver SIEMPRE
 * números finitos, sin importar lo corrupta que venga la data cruda. Caminamos
 * recursivamente TODO el ControlView y exigimos finitud en cada number.
 */

const BAD = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 0]

function assertAllFinite(value: unknown, path: string, label: string): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${label} · ${path} = ${value}`).toBe(true)
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => assertAllFinite(v, `${path}[${i}]`, label))
  } else if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      assertAllFinite((value as Record<string, unknown>)[k], `${path}.${k}`, label)
    }
  }
}

function poison(overrides: Partial<ControlMockData>): ControlMockData {
  return { ...CONTROL_MOCK, ...overrides }
}

function poisonPast(overrides: Record<string, unknown>): ControlMockData {
  return { ...CONTROL_MOCK, mesPasado: { ...CONTROL_MOCK.mesPasado, ...overrides } as ControlMockData['mesPasado'] }
}

describe('asistente — métricas siempre finitas (ControlView)', () => {
  it('data válida → todo finito (sanity)', () => {
    assertAllFinite(computeControlView(CONTROL_MOCK), 'view', 'baseline')
  })

  it('campos escalares de presupuesto/ciclo envenenados', () => {
    const fields: (keyof ControlMockData)[] = [
      'ingresoMes', 'fijosMes', 'libreMes', 'cupoDiario',
      'diasMes', 'diaActual', 'horaActual', 'minActual', 'gastoHoy',
      'proximoSueldoEnDias', 'fijosCobertura', 'metaNoSpendSemana', 'logrosNoSpendSemana',
    ]
    for (const field of fields) {
      for (const bad of BAD) {
        assertAllFinite(computeControlView(poison({ [field]: bad } as Partial<ControlMockData>)), 'view', `${String(field)}=${bad}`)
      }
    }
  })

  it('diasMes=0 / diaActual=0 (división por cero del cupo y promedios)', () => {
    assertAllFinite(computeControlView(poison({ diasMes: 0 })), 'view', 'diasMes=0')
    assertAllFinite(computeControlView(poison({ diaActual: 0 })), 'view', 'diaActual=0')
    assertAllFinite(computeControlView(poison({ diasMes: 0, diaActual: 0, dias: [] })), 'view', 'cycle vacío')
  })

  it('arrays dias / dailyTotals con NaN/Infinity/negativos', () => {
    assertAllFinite(computeControlView(poison({ dias: [Number.NaN, -100, Number.POSITIVE_INFINITY, 5000], diasDow: [0, 1, 2, 3] })), 'view', 'dias corruptos')
    assertAllFinite(computeControlView(poisonPast({ dailyTotals: [Number.NaN, Number.POSITIVE_INFINITY, -5, 1000] })), 'view', 'dailyTotals corruptos')
    assertAllFinite(computeControlView(poisonPast({ promedioDiario: Number.NaN, gastoTotal: Number.POSITIVE_INFINITY, diasBajoCupo: Number.NaN })), 'view', 'mesPasado corrupto')
  })

  it('combinado: todo el input numérico envenenado', () => {
    assertAllFinite(
      computeControlView({
        ...CONTROL_MOCK,
        ingresoMes: Number.NaN,
        fijosMes: Number.POSITIVE_INFINITY,
        libreMes: Number.NaN,
        cupoDiario: Number.NaN,
        diasMes: 0,
        diaActual: 0,
        gastoHoy: Number.NaN,
        proximoSueldoEnDias: Number.NaN,
        dias: [Number.NaN, Number.POSITIVE_INFINITY],
        diasDow: [0, 1],
        mesPasado: {
          ...CONTROL_MOCK.mesPasado,
          gastoTotal: Number.NaN,
          promedioDiario: Number.NaN,
          dailyTotals: [Number.NaN, Number.NEGATIVE_INFINITY],
        },
      }),
      'view',
      'todo envenenado',
    )
  })
})
