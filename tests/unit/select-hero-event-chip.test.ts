import { describe, expect, it } from 'vitest'

import {
  selectFixedChip,
  selectHeroEventChip,
  type SelectHeroEventChipInput,
} from '@/features/home/select-hero-event-chip'
import type { SavingsHeroChip } from '@/components/home/home-hero-savings-helpers'

const healthyChip: SavingsHeroChip = {
  kind: 'healthy',
  label: 'Ahorrando $500k',
  a11y: 'Estás apartando $500.000 de ahorro este mes.',
}

const partialChip: SavingsHeroChip = {
  kind: 'partial',
  label: '$320k de meta $500k',
  a11y: 'Llevas apartados $320.000 de los $500.000 previstos para este mes.',
}

const consumedChip: SavingsHeroChip = {
  kind: 'consumed',
  label: 'Sin ahorro este mes',
  a11y: 'Aviso: tus gastos consumieron los $500.000 de ahorro previstos para este mes.',
}

/** Estado sin ninguna señal — nada aplica. */
const emptyInput: SelectHeroEventChipInput = {
  acumulado: null,
  cycleAdjusted: false,
  cycleBalanceDiff: 0,
  savingsChip: null,
  incomeMode: 'fixed',
}

/** Estado con TODAS las señales prendidas — el ganador depende solo de la
 *  precedencia. */
const allSignals: SelectHeroEventChipInput = {
  acumulado: { amount: 837_000, periodLabel: 'Junio 2026' },
  cycleAdjusted: true,
  cycleBalanceDiff: 139_000,
  savingsChip: healthyChip,
  incomeMode: 'fixed',
}

describe('selectHeroEventChip — precedencia (uno por vez)', () => {
  it('acumulado gana sobre todo lo demás', () => {
    const chip = selectHeroEventChip(allSignals)
    expect(chip?.kind).toBe('acumulado')
    expect(chip?.tone).toBe('green')
  })

  it('sumado gana cuando no hay acumulado (override UP)', () => {
    const chip = selectHeroEventChip({ ...allSignals, acumulado: null })
    expect(chip?.kind).toBe('sumado')
    expect(chip?.tone).toBe('green')
    expect(chip?.label).toBe('📈 Sumaste $139k al mes')
  })

  it('ajustado gana cuando el override es DOWN (diff < 0)', () => {
    const chip = selectHeroEventChip({
      ...allSignals,
      acumulado: null,
      cycleBalanceDiff: -50_000,
    })
    expect(chip?.kind).toBe('ajustado')
    expect(chip?.tone).toBe('neutral')
    expect(chip?.label).toBe('✂️ Ajustado este mes')
  })

  it('ajustado gana también con diff == 0 (override al sueldo exacto)', () => {
    const chip = selectHeroEventChip({
      ...allSignals,
      acumulado: null,
      cycleBalanceDiff: 0,
    })
    expect(chip?.kind).toBe('ajustado')
  })

  it('ahorrando gana solo cuando no hay acumulado ni override', () => {
    const chip = selectHeroEventChip({
      ...emptyInput,
      savingsChip: healthyChip,
    })
    expect(chip?.kind).toBe('ahorrando')
    expect(chip?.tone).toBe('green')
    expect(chip?.label).toBe('💚 Ahorrando $500k')
  })

  it('null cuando nada aplica', () => {
    expect(selectHeroEventChip(emptyInput)).toBeNull()
  })

  it('cycleBalanceDiff > 0 SIN override activo no dispara sumado (espejo del stack viejo)', () => {
    const chip = selectHeroEventChip({
      ...emptyInput,
      cycleAdjusted: false,
      cycleBalanceDiff: 100_000,
    })
    expect(chip).toBeNull()
  })
})

describe('selectHeroEventChip — copy del acumulado (arrastre real, decisión owner)', () => {
  it('usa 💰 Sobrante + el período del stack viejo (lowercased)', () => {
    const chip = selectHeroEventChip(allSignals)
    expect(chip?.label).toBe('💰 Sobrante $837k de junio 2026')
  })

  it('sin periodLabel cae al patrón "del mes pasado"', () => {
    const chip = selectHeroEventChip({
      ...allSignals,
      acumulado: { amount: 837_000, periodLabel: '  ' },
    })
    expect(chip?.label).toBe('💰 Sobrante $837k del mes pasado')
  })

  it('acumulado con amount ≤ 0 o no finito no gana el slot (guarda defensiva)', () => {
    for (const amount of [0, -100, Number.NaN]) {
      const chip = selectHeroEventChip({
        ...allSignals,
        acumulado: { amount, periodLabel: 'Junio 2026' },
      })
      expect(chip?.kind).toBe('sumado')
    }
  })
})

describe('selectHeroEventChip — ahorrando (default documentado a validar por owner)', () => {
  it('partial → tone green con 💚 y el label del helper', () => {
    const chip = selectHeroEventChip({ ...emptyInput, savingsChip: partialChip })
    expect(chip?.kind).toBe('ahorrando')
    expect(chip?.tone).toBe('green')
    expect(chip?.label).toBe('💚 $320k de meta $500k')
  })

  it('consumed → tone neutral, label-aviso del helper sin 💚', () => {
    const chip = selectHeroEventChip({ ...emptyInput, savingsChip: consumedChip })
    expect(chip?.kind).toBe('ahorrando')
    expect(chip?.tone).toBe('neutral')
    expect(chip?.label).toBe('Sin ahorro este mes')
  })

  it('income dinámico apaga el chip de ahorro aunque llegue savingsChip', () => {
    const chip = selectHeroEventChip({
      ...emptyInput,
      savingsChip: healthyChip,
      incomeMode: 'dynamic',
    })
    expect(chip).toBeNull()
  })

  it('income dinámico no bloquea los otros kinds (solo el ahorrando)', () => {
    const chip = selectHeroEventChip({ ...allSignals, incomeMode: 'dynamic' })
    expect(chip?.kind).toBe('acumulado')
  })
})

describe('selectFixedChip — chip de fijos APARTE del selector', () => {
  it('formatea con el helper del stack viejo (formatMoneyShort)', () => {
    expect(selectFixedChip(123_000)).toBe('🗓️ $123k de fijos por pagar')
  })

  it('montos en millones usan el tramo M del formato corto', () => {
    // Test env fuerza 'es' → decimal con coma (es-AR).
    expect(selectFixedChip(1_500_000)).toBe('🗓️ $1,5M de fijos por pagar')
  })

  it('null cuando no hay fijos pendientes (0, negativo o no finito)', () => {
    expect(selectFixedChip(0)).toBeNull()
    expect(selectFixedChip(-10)).toBeNull()
    expect(selectFixedChip(Number.NaN)).toBeNull()
    expect(selectFixedChip(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('convive con el chip de evento (no compite por el slot)', () => {
    // El selector y el fixed chip son independientes: ambos presentes.
    expect(selectHeroEventChip(allSignals)?.kind).toBe('acumulado')
    expect(selectFixedChip(123_000)).not.toBeNull()
  })
})
