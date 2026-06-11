import { describe, expect, it } from 'vitest'
import {
  CONTROL_MOCK,
  computeControlView,
  type ControlMockData,
} from '@/features/insights/control-v2-mock'

// Regresión de la auditoría 2026-06-11 (cuenta real kontosmario):
// con $4.3M ya gastados en el ciclo y un promedio robusto bajo (los
// días pico quedan excluidos del ritmo), la card "hasta cuándo te
// alcanza" anunciaba "sobran $2.1M" cuando el presupuesto ya estaba
// prácticamente agotado. La proyección honesta es:
//   cierre = gastado real + ritmo típico × días que faltan.

function escenarioCuentaReal(): ControlMockData {
  // 22 días cerrados: mayoría tranquilos (~50k) + 5 picos grandes que
  // el promedio robusto excluye (>3× mediana). Día 23 de 31.
  const dias = [
    50_000, 40_000, 60_000, 45_000, 55_000, 350_000, 48_000, 52_000,
    42_000, 340_000, 58_000, 44_000, 220_000, 51_000, 46_000, 200_000,
    49_000, 53_000, 160_000, 47_000, 43_000, 56_000,
  ]
  return {
    ...CONTROL_MOCK,
    dias,
    diasDow: dias.map((_, i) => i % 7),
    diasMes: 31,
    diaActual: 23,
    gastoHoy: 0,
    // cupoDiario alto: presupuesto libre total = 174k × 31 ≈ 5.4M
    cupoDiario: 174_000,
    ingresoMes: 6_400_000,
    fijosMes: 1_355_000,
  }
}

describe('proyección de cierre honesta (auditoría 2026-06-11)', () => {
  it('el gasto proyectado incluye lo YA gastado, no solo el ritmo', () => {
    const d = escenarioCuentaReal()
    const view = computeControlView(d)
    const gastado = d.dias.reduce((s, x) => s + x, 0) // ≈ 2.31M
    // El cierre proyectado jamás puede ser menor a lo ya gastado.
    expect(view.proyectadoMes).toBeGreaterThanOrEqual(gastado)
  })

  it('el sobrante no es fantasioso: libreTotal − (gastado + ritmo × días futuros)', () => {
    const d = escenarioCuentaReal()
    const view = computeControlView(d)
    const gastado = d.dias.reduce((s, x) => s + x, 0)
    const libreTotal = d.cupoDiario * d.diasMes
    // Cota superior dura: sobrante ≤ libreTotal − gastado (lo que
    // realmente queda). La versión rota devolvía MÁS que esto.
    expect(view.sobrantePresupuestadoMes).toBeLessThanOrEqual(
      libreTotal - gastado,
    )
  })

  it('caso límite: todo gastado el primer día → sobrante negativo o cero', () => {
    const d: ControlMockData = {
      ...escenarioCuentaReal(),
      dias: [5_500_000, 0, 0, 0, 0, 0, 0, 10_000],
      diasDow: [0, 1, 2, 3, 4, 5, 6, 0],
      diaActual: 9,
    }
    const view = computeControlView(d)
    // Con 5.5M gastados sobre un presupuesto de 5.39M, el "sobrante"
    // jamás puede ser positivo.
    expect(view.sobrantePresupuestadoMes).toBeLessThanOrEqual(0)
  })

  it('score: el componente de fijos no puede inflar el total por encima de 100', () => {
    const d: ControlMockData = {
      ...escenarioCuentaReal(),
      // fijosRatio ≈ 0 → sin clamp, sFijos valía 20/10 puntos.
      fijosMes: 0,
      dias: [10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000],
      diasDow: [0, 1, 2, 3, 4, 5, 6],
      diaActual: 8,
    }
    const view = computeControlView(d)
    expect(view.score).toBeLessThanOrEqual(100)
  })
})
