import { describe, it, expect } from 'vitest'
import {
  plural,
  joinNamesEs,
  formatSignedMoneyFijos,
  monthUpperEs,
  monthLowerEs,
  buildCycleHeaderLabel,
  computeDaysIntoCycle,
  buildStatusChip,
  selectHeroVariant,
  selectAvisosVariant,
  DUE_SOON_DAYS,
  filterDueSoon,
  buildTickerItems,
  filterActiveHikes,
  buildHikeRows,
  buildReminder,
  buildHeroContent,
  buildAvisosContent,
  buildCategoriesContent,
  type HeroVariantInput,
  type AvisosVariantInput,
} from '@/features/fijos/neo-fijos-view-model'
import { summarizeFijos, type FijoItem, type FijoCategoryGroup } from '@/features/fijos/fijos-aggregates.model'
import { isHikeDismissed } from '@/features/fijos/use-hike-dismiss-store'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import type { FijoHikeAlert } from '@/features/fijos/fijos-aggregates.model'
import type { FijosHeroVariant } from '@/components/redesign/fijos/fijos-screen'
import { getCurrentPayCycle } from '@/utils/pay-cycle'
import { computeMonthlyAccountingWindow } from '@/utils/monthly-accounting'
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeFixed(over: Partial<FixedExpense> = {}): FixedExpense {
  return {
    id: 'fx-1',
    family_id: 'fam-1',
    name: 'Netflix',
    amount: 5000,
    kind: 'recurring',
    status: 'active',
    frequency: 'monthly',
    category_id: 'cat-entret',
    next_due_on: '2026-07-15',
    day_of_month: 15,
    ends_on: null,
    installments_total: null,
    installments_paid: 0,
    remaining_balance: null,
    lender_name: null,
    notes: null,
    notify_days_before: null,
    last_paid_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

/** Fixture directa de `FijoItem` (sin pasar por `summarizeFijos`) para los
 *  tests que solo necesitan los campos que leen `buildTickerItems`/
 *  `buildReminder` (id/name/amount/daysUntilDue/computedStatus). */
function makeFijoItem(over: Partial<FijoItem> = {}): FijoItem {
  const base = makeFixed()
  return {
    ...base,
    dayOfMonth: 15,
    computedStatus: 'pending',
    daysUntilDue: 3,
    isZombie: false,
    daysSinceLastPaid: null,
    priceHistory: [],
    trendDeltaPct: null,
    trendPrevAmount: null,
    arrearsOnLastPayment: false,
    paidPaymentId: null,
    cuotaMonth: null,
    annualCost: 0,
    pctOfIncome: null,
    paymentsLifetime: 0,
    totalPaidLifetime: 0,
    missedCuotas: 0,
    ...over,
  }
}

function makeHike(over: Partial<FijoHikeAlert> = {}): FijoHikeAlert {
  return {
    fixedExpenseId: 'fx-1',
    name: 'Netflix',
    previousPrice: 4000,
    currentPrice: 5000,
    deltaPct: 25,
    ...over,
  }
}

function makeCategoryGroup(over: Partial<FijoCategoryGroup> = {}): FijoCategoryGroup {
  return {
    categoryId: 'cat-1',
    label: 'Vivienda',
    rawLabel: 'Vivienda',
    color: '#8A8A8A',
    total: 1000,
    items: [],
    ...over,
  }
}

const TODAY_NOON = new Date(2026, 6, 19, 12, 0, 0) // 19 jul 2026, mediodía local
/** El anclaje que usa PRODUCCIÓN: `usePayCycle` hace
 *  `normalizeToStartOfDay(new Date())` → medianoche LOCAL
 *  (`hooks/use-pay-cycle.ts:54` → `use-fijos-controller.ts:101,157`). */
const TODAY_MIDNIGHT = new Date(2026, 6, 19)

/** Input completo de `buildHeroContent` con los números del fixture E2 del
 *  kit. A nivel de módulo porque también lo usan los tests de precedencia de
 *  `selectHeroVariant` (que verifican qué se pierde al elegir mal la
 *  variante, no solo cuál sale). */
const e2Input = {
  variant: 'E2' as const,
  isEmptyNoFijos: false,
  cycleLastDay: new Date(2026, 6, 19),
  cycleStart: new Date(2026, 5, 20),
  daysIntoCycle: 18,
  salaryPaymentDay: 19,
  paidCount: 13,
  pendingCount: 2,
  overdueCount: 1,
  cycleActiveCount: 16,
  paidAmount: 1_227_651,
  pendingAmount: 100_000, // pending+overdue debe sumar 122.831
  overdueAmount: 22_831,
  total: 1_350_482,
  paidPct: 91,
  hasIncome: true,
  monthlyIncome: 6_400_000,
  availableRaw: 5_049_518,
  pctOfIncome: 21,
  segmentToday: false,
}

// ---------------------------------------------------------------------------
// plural
// ---------------------------------------------------------------------------

describe('plural', () => {
  it('n===1 usa singular', () => {
    expect(plural(1, 'vencida', 'vencidas')).toBe('1 vencida')
  })
  it('n===0 usa plural', () => {
    expect(plural(0, 'vencida', 'vencidas')).toBe('0 vencidas')
  })
  it('n===2 usa plural', () => {
    expect(plural(2, 'vencida', 'vencidas')).toBe('2 vencidas')
  })
})

// ---------------------------------------------------------------------------
// joinNamesEs
// ---------------------------------------------------------------------------

describe('joinNamesEs', () => {
  it('[] → \'\'', () => {
    expect(joinNamesEs([])).toBe('')
  })
  it("['A'] → 'A'", () => {
    expect(joinNamesEs(['A'])).toBe('A')
  })
  it("['A','B'] → 'A y B'", () => {
    expect(joinNamesEs(['A', 'B'])).toBe('A y B')
  })
  it("['A','B','C'] → 'A, B y C' (sin coma de Oxford)", () => {
    expect(joinNamesEs(['A', 'B', 'C'])).toBe('A, B y C')
  })
  it("['A','B','C','D'] → 'A, B, C y D'", () => {
    expect(joinNamesEs(['A', 'B', 'C', 'D'])).toBe('A, B, C y D')
  })
  it('no escapa una coma propia del nombre (límite documentado)', () => {
    expect(joinNamesEs(['Luz, Gas'])).toBe('Luz, Gas')
  })
})

// ---------------------------------------------------------------------------
// formatSignedMoneyFijos
// ---------------------------------------------------------------------------

describe('formatSignedMoneyFijos', () => {
  it('positivo → sin signo', () => {
    expect(formatSignedMoneyFijos(1000)).toBe('$1.000')
  })
  it('negativo → antepone MINUS SIGN unicode (U+2212), no hyphen ASCII', () => {
    const result = formatSignedMoneyFijos(-48200)
    expect(result).toBe('−$48.200')
    expect(result.charCodeAt(0)).toBe(0x2212)
  })
  it('0 → sin signo', () => {
    expect(formatSignedMoneyFijos(0)).toBe('$0')
  })
  it('-0 → sin signo (no es < 0 en JS)', () => {
    expect(formatSignedMoneyFijos(-0)).toBe('$0')
  })
})

// ---------------------------------------------------------------------------
// monthUpperEs / monthLowerEs
// ---------------------------------------------------------------------------

describe('monthUpperEs', () => {
  it('julio → JULIO', () => {
    expect(monthUpperEs(new Date(2026, 6, 19))).toBe('JULIO')
  })
  it('mayo → MAYO', () => {
    expect(monthUpperEs(new Date(2026, 4, 1))).toBe('MAYO')
  })
})

describe('monthLowerEs', () => {
  it('julio → julio', () => {
    expect(monthLowerEs(new Date(2026, 6, 19))).toBe('julio')
  })
})

// ---------------------------------------------------------------------------
// buildCycleHeaderLabel
// ---------------------------------------------------------------------------

describe('buildCycleHeaderLabel', () => {
  it('agrega el sufijo de día', () => {
    expect(buildCycleHeaderLabel('20 jun → 19 jul', 18)).toBe('20 jun → 19 jul · día 18')
  })
  it('día 1', () => {
    expect(buildCycleHeaderLabel('20 jun → 19 jul', 1)).toBe('20 jun → 19 jul · día 1')
  })
})

// ---------------------------------------------------------------------------
// computeDaysIntoCycle — el día que alimenta el header, el chip y el paso 7
// ---------------------------------------------------------------------------

describe('computeDaysIntoCycle', () => {
  it('el día que arranca el ciclo es 1 (no 0)', () => {
    const cycleStart = new Date(2026, 6, 19)
    expect(computeDaysIntoCycle({ today: cycleStart, cycleStart })).toBe(1)
  })

  it('cuenta 1-indexado hacia adelante', () => {
    expect(
      computeDaysIntoCycle({ today: new Date(2026, 7, 5), cycleStart: new Date(2026, 6, 19) }),
    ).toBe(18)
  })

  it('clampea a 1 si today < cycleStart (nunca "día 0" ni negativo en la copy)', () => {
    expect(
      computeDaysIntoCycle({ today: new Date(2026, 6, 18), cycleStart: new Date(2026, 6, 19) }),
    ).toBe(1)
  })

  it('monthly: coincide EXACTO con monthlyAccounting.daysIntoMonth (cero regresión)', () => {
    const cfg: FinanceCycleConfig = { cycle_type: 'monthly', salary_payment_day: 19 }
    for (const today of [new Date(2026, 6, 19), new Date(2026, 6, 31), new Date(2026, 7, 4)]) {
      const cycle = getCurrentPayCycle(today, cfg)
      const window = computeMonthlyAccountingWindow(cfg, today, false, false)
      expect(computeDaysIntoCycle({ today, cycleStart: cycle.start })).toBe(window.daysIntoMonth)
    }
  })

  it('weekly con ingreso fijo: DIVERGE de monthlyAccounting.daysIntoMonth (el bug que este helper corrige)', () => {
    const cfg: FinanceCycleConfig = {
      cycle_type: 'weekly',
      cycle_anchor_date: '2026-07-06',
      cycle_length_days: 7,
    }
    const today = new Date(2026, 7, 1) // 1 de agosto: día 1 del MES, no del ciclo
    const cycle = getCurrentPayCycle(today, cfg)
    const window = computeMonthlyAccountingWindow(cfg, today, false, false)
    expect(window.daysIntoMonth).toBe(1)
    expect(computeDaysIntoCycle({ today, cycleStart: cycle.start })).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// mapCategoryToBucket
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// buildStatusChip
// ---------------------------------------------------------------------------

describe('buildStatusChip', () => {
  it('E2: overdue>0 y pending>0 → alert', () => {
    const chip = buildStatusChip({
      overdueCount: 1,
      pendingCount: 2,
      paidCount: 13,
      cycleActiveCount: 16,
      daysIntoCycle: 18,
    })
    expect(chip).toEqual({ label: '⚠ 3 fijos por pagar · 1 vencida', tone: 'alert' })
  })

  it('E7 (drift del handoff): overdue===0, pending===0 → success con conteos propios', () => {
    const chip = buildStatusChip({
      overdueCount: 0,
      pendingCount: 0,
      paidCount: 18,
      cycleActiveCount: 18,
      daysIntoCycle: 10,
    })
    expect(chip).toEqual({ label: '✓ Cerró completo · 18 de 18', tone: 'success' })
  })

  it('E3: overdue===0, pending>0, no es día 1 → neutral "por venir"', () => {
    const chip = buildStatusChip({
      overdueCount: 0,
      pendingCount: 2,
      paidCount: 14,
      cycleActiveCount: 16,
      daysIntoCycle: 12,
    })
    expect(chip).toEqual({ label: '2 por venir · nada vencido', tone: 'neutral' })
  })

  it('E4: overdue===0, pending>0, día 1 → neutral "recién cobraste"', () => {
    const chip = buildStatusChip({
      overdueCount: 0,
      pendingCount: 16,
      paidCount: 0,
      cycleActiveCount: 16,
      daysIntoCycle: 1,
    })
    expect(chip).toEqual({ label: '16 fijos este mes · recién cobraste', tone: 'neutral' })
  })

  it('overdue>0, pending===0 → alert sin "fijos por pagar"', () => {
    const chip = buildStatusChip({
      overdueCount: 2,
      pendingCount: 0,
      paidCount: 14,
      cycleActiveCount: 16,
      daysIntoCycle: 15,
    })
    expect(chip).toEqual({ label: '⚠ 2 vencidas', tone: 'alert' })
  })

  it('overdueCount:1 → plural singular ("1 vencida")', () => {
    const chip = buildStatusChip({
      overdueCount: 1,
      pendingCount: 0,
      paidCount: 15,
      cycleActiveCount: 16,
      daysIntoCycle: 15,
    })
    expect(chip.label).toBe('⚠ 1 vencida')
  })

  it('overdueCount:2 → plural ("2 vencidas")', () => {
    const chip = buildStatusChip({
      overdueCount: 2,
      pendingCount: 1,
      paidCount: 13,
      cycleActiveCount: 16,
      daysIntoCycle: 15,
    })
    expect(chip.label).toContain('2 vencidas')
  })
})

// ---------------------------------------------------------------------------
// selectHeroVariant — orden total, 9 pasos
// ---------------------------------------------------------------------------

function heroInput(over: Partial<HeroVariantInput> = {}): HeroVariantInput {
  return {
    activeFixedCount: 16,
    cycleActiveCount: 16,
    paidCount: 13,
    pendingCount: 2,
    overdueCount: 1,
    daysIntoCycle: 18,
    hasIncome: true,
    availableRaw: 5_049_518,
    isSalaryPendingConfirmation: false,
    viewingClosedEdition: false,
    ...over,
  }
}

describe('selectHeroVariant', () => {
  it('paso 1: viewingClosedEdition → E7, aunque el screen SIEMPRE pase false', () => {
    expect(selectHeroVariant(heroInput({ viewingClosedEdition: true })).variant).toBe('E7')
  })

  it('paso 2: sin fijos cargados → E6 ("sin fijos"), incluso con cobro sin confirmar (precedencia)', () => {
    // Input CONSISTENTE: sin fijos en la DB no puede haber fijos del ciclo
    // (`cycleActiveCount ≤ activeFixedCount`, mismo filtro `active|paused`).
    const r = selectHeroVariant(
      heroInput({
        activeFixedCount: 0,
        cycleActiveCount: 0,
        paidCount: 0,
        pendingCount: 0,
        overdueCount: 0,
        isSalaryPendingConfirmation: true,
      }),
    )
    expect(r.variant).toBe('E6')
    expect(r.reason).toMatch(/sin fijos/)
  })

  it('paso 2 (endurecido): activeFixedCount===0 con cycleActiveCount>0 (queries desincronizadas) NO da el empty-state', () => {
    // Los dos conteos vienen de queries distintas del outer. Para inputs
    // consistentes `cycleActiveCount ≤ activeFixedCount`, así que este input
    // no existe — pero si una query resuelve antes que la otra, el hero NO
    // debe decir "Todavía no cargaste fijos" arriba de una lista poblada.
    const r = selectHeroVariant(
      heroInput({ activeFixedCount: 0, cycleActiveCount: 5, overdueCount: 0, pendingCount: 2, paidCount: 3 }),
    )
    expect(r.variant).toBe('E3')
  })

  it("paso 4 (E6′): cycleActiveCount===0 con activeFixedCount>0 → E6 con reason de E6′ (barra vacía evitada)", () => {
    const r = selectHeroVariant(
      heroInput({ activeFixedCount: 3, cycleActiveCount: 0, paidCount: 0, pendingCount: 0, overdueCount: 0 }),
    )
    expect(r.variant).toBe('E6')
    expect(r.reason).toMatch(/E6′/)
  })

  it('paso 3: isSalaryPendingConfirmation → E8, incluso con overdue===0 y pending===0 (no E1)', () => {
    const r = selectHeroVariant(
      heroInput({ isSalaryPendingConfirmation: true, overdueCount: 0, pendingCount: 0 }),
    )
    expect(r.variant).toBe('E8')
  })

  it('PRECEDENCIA paso 3 > paso 4: cobro sin confirmar + ningún fijo de este ciclo → E8, no el empty-state de E6′', () => {
    // El único cuerpo del hero con el CTA "✓ Confirmar cobro" es
    // HeroOutOfCycleBody (E8). Con el ciclo congelado, un empty-state
    // esconde la única escritura que lo destraba.
    const r = selectHeroVariant(
      heroInput({
        activeFixedCount: 1,
        cycleActiveCount: 0,
        paidCount: 0,
        pendingCount: 0,
        overdueCount: 0,
        isSalaryPendingConfirmation: true,
      }),
    )
    expect(r.variant).toBe('E8')
  })

  it('PRECEDENCIA paso 3 > paso 5: cobro sin confirmar Y sueldo que no cubre los fijos → E8, no E5', () => {
    // El fixture default tiene availableRaw POSITIVO, así que sin forzarlo en
    // negativo este empate queda inalcanzable y los pasos 3 y 5 se pueden
    // intercambiar sin que falle nada.
    const r = selectHeroVariant(
      heroInput({ isSalaryPendingConfirmation: true, hasIncome: true, availableRaw: -1 }),
    )
    expect(r.variant).toBe('E8')
  })

  it('paso 5: hasIncome && availableRaw<0 con algo por pagar → E5', () => {
    const r = selectHeroVariant(heroInput({ availableRaw: -1, overdueCount: 0, pendingCount: 2 }))
    expect(r.variant).toBe('E5')
  })

  it('paso 5 NO dispara con TODO pagado: E1 lleva la advertencia adentro (availableWarning), E5 diría "Te falta pagar $0"', () => {
    const r = selectHeroVariant(
      heroInput({
        cycleActiveCount: 5,
        paidCount: 5,
        pendingCount: 0,
        overdueCount: 0,
        hasIncome: true,
        availableRaw: -50_000,
      }),
    )
    expect(r.variant).toBe('E1')
    // Y el riesgo NO se pierde: buildHeroContent lo comunica igual en E1.
    const c = buildHeroContent({
      ...e2Input,
      variant: r.variant,
      cycleActiveCount: 5,
      paidCount: 5,
      pendingCount: 0,
      overdueCount: 0,
      availableRaw: -50_000,
    })
    expect(c.availableWarning).toBe(true)
    expect(c.availableNote).toBe('⚠ te pasás este mes')
  })

  it('C6 — REGRESIÓN: hasIncome:false + availableRaw muy negativo → NO cae en E5 (modo dinámico)', () => {
    const r = selectHeroVariant(
      heroInput({ hasIncome: false, availableRaw: -500_000, overdueCount: 0, pendingCount: 2 }),
    )
    expect(r.variant).not.toBe('E5')
  })

  it('availableRaw===0 no dispara E5 (estrictamente < 0)', () => {
    const r = selectHeroVariant(heroInput({ availableRaw: 0, overdueCount: 0, pendingCount: 0 }))
    expect(r.variant).not.toBe('E5')
    expect(r.variant).toBe('E1')
  })

  it('paso 6: overdue===0 && pending===0 → E1', () => {
    expect(selectHeroVariant(heroInput({ overdueCount: 0, pendingCount: 0 })).variant).toBe('E1')
  })

  it('paso 7: daysIntoCycle===1 + overdueCount:1 → E2, no E4 (overdue gana)', () => {
    const r = selectHeroVariant(
      heroInput({ daysIntoCycle: 1, paidCount: 0, pendingCount: 16, overdueCount: 1 }),
    )
    expect(r.variant).toBe('E2')
  })

  it('paso 7: día 1, sin pagos, sin vencidos → E4', () => {
    const r = selectHeroVariant(
      heroInput({ daysIntoCycle: 1, paidCount: 0, pendingCount: 16, overdueCount: 0 }),
    )
    expect(r.variant).toBe('E4')
  })

  it('día 1 pero ya con algo pagado → no es E4 (cae a E3)', () => {
    const r = selectHeroVariant(
      heroInput({ daysIntoCycle: 1, paidCount: 1, pendingCount: 15, overdueCount: 0 }),
    )
    expect(r.variant).toBe('E3')
  })

  it('paso 8: overdue===0, pending>0, no día 1 → E3', () => {
    expect(
      selectHeroVariant(heroInput({ overdueCount: 0, pendingCount: 2, daysIntoCycle: 12 })).variant,
    ).toBe('E3')
  })

  it('paso 9 (else): mezcla pendientes y vencidos → E2', () => {
    expect(
      selectHeroVariant(heroInput({ overdueCount: 1, pendingCount: 2, daysIntoCycle: 18 })).variant,
    ).toBe('E2')
  })

  it('totalidad + orden total: histograma EXACTO de las 512 combinaciones de la grilla', () => {
    // El test viejo solo afirmaba `seen.size > 0`, así que una implementación
    // que devolviera siempre la misma variante pasaba. Este afirma cuántas
    // combinaciones caen en CADA variante: intercambiar dos pasos cualesquiera
    // de la cadena mueve al menos un contador y pone el test en rojo.
    const counts = new Map<FijosHeroVariant, number>()
    const reasons = new Set<string>()
    let total = 0
    for (const activeFixedCount of [0, 3]) {
      for (const cycleActiveCount of [0, 5]) {
        for (const paidCount of [0, 2]) {
          for (const pendingCount of [0, 2]) {
            for (const overdueCount of [0, 2]) {
              for (const daysIntoCycle of [1, 15]) {
                for (const hasIncome of [true, false]) {
                  for (const availableRaw of [-1, 1]) {
                    for (const isSalaryPendingConfirmation of [true, false]) {
                      const r = selectHeroVariant({
                        activeFixedCount,
                        cycleActiveCount,
                        paidCount,
                        pendingCount,
                        overdueCount,
                        daysIntoCycle,
                        hasIncome,
                        availableRaw,
                        isSalaryPendingConfirmation,
                        viewingClosedEdition: false,
                      })
                      total += 1
                      counts.set(r.variant, (counts.get(r.variant) ?? 0) + 1)
                      reasons.add(r.reason)
                      // Total: siempre resuelve a un string no vacío, nunca undefined.
                      expect(typeof r.variant).toBe('string')
                      expect(r.reason.length).toBeGreaterThan(0)
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    expect(total).toBe(512)
    // Las 7 variantes alcanzables con `viewingClosedEdition: false` — E7 NO
    // está (es su único disparador) y las 7 restantes sí, con estos conteos.
    expect(Object.fromEntries([...counts].sort())).toEqual({
      E1: 32,
      E2: 48,
      E3: 18,
      E4: 6,
      E5: 24,
      E6: 192,
      E8: 192,
    })
    // La suma de los conteos cubre la grilla entera: ninguna combinación cae
    // fuera de toda rama, ninguna se cuenta dos veces.
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(512)
    expect(counts.has('E7')).toBe(false)
    // 9 razones distintas para 7 variantes: E6 tiene dos ("sin fijos" y E6′) y
    // E2 tiene dos ("solo vencidos" y la mezcla real) — es lo que hace que el
    // banner de dev identifique el predicado y no solo la shape.
    expect([...reasons].sort()).toEqual([
      'E6′ — sin cuotas este ciclo',
      'día 1 del ciclo, sin pagos todavía',
      'mezcla pendientes y vencidos',
      'pendientes, sin vencidos',
      'sin fijos',
      'solo vencidos',
      'sueldo cobrado sin confirmar',
      'sueldo no cubre los fijos',
      'todo pagado',
    ])
  })

  it('reason del paso 9: distingue "solo vencidos" de la mezcla real (prosa del banner de dev)', () => {
    expect(selectHeroVariant(heroInput({ overdueCount: 2, pendingCount: 0 })).reason).toBe(
      'solo vencidos',
    )
    expect(selectHeroVariant(heroInput({ overdueCount: 2, pendingCount: 2 })).reason).toBe(
      'mezcla pendientes y vencidos',
    )
  })

  it('el drift de ventanas importa para la variante: día 1 del MES en un ciclo semanal no es E4', () => {
    // Familia weekly con ingreso fijo, 1 de agosto. `monthlyAccounting.
    // daysIntoMonth` es 1 (día del mes calendario) y el ciclo semanal va por
    // su día 6. Pasar el número equivocado dispara E4 + "recién cobraste" a
    // una familia que no cobró hoy.
    const cfg: FinanceCycleConfig = {
      cycle_type: 'weekly',
      cycle_anchor_date: '2026-07-06',
      cycle_length_days: 7,
    }
    const today = new Date(2026, 7, 1)
    const wrongDay = computeMonthlyAccountingWindow(cfg, today, false, false).daysIntoMonth
    const rightDay = computeDaysIntoCycle({
      today,
      cycleStart: getCurrentPayCycle(today, cfg).start,
    })
    const base = { paidCount: 0, pendingCount: 2, overdueCount: 0 }
    expect(selectHeroVariant(heroInput({ ...base, daysIntoCycle: wrongDay })).variant).toBe('E4')
    expect(selectHeroVariant(heroInput({ ...base, daysIntoCycle: rightDay })).variant).toBe('E3')
    expect(buildStatusChip({ ...base, cycleActiveCount: 4, daysIntoCycle: rightDay }).label).toBe(
      '2 por venir · nada vencido',
    )
  })
})

// ---------------------------------------------------------------------------
// selectAvisosVariant
// ---------------------------------------------------------------------------

function avisosInput(over: Partial<AvisosVariantInput> = {}): AvisosVariantInput {
  return {
    activeFixedCount: 16,
    cycleActiveCount: 16,
    overdueCount: 0,
    tickerCount: 5,
    hikeCount: 0,
    ...over,
  }
}

describe('selectAvisosVariant', () => {
  it('sin fijos cargados → A6', () => {
    const r = selectAvisosVariant(avisosInput({ activeFixedCount: 0, cycleActiveCount: 0 }))
    expect(r.variant).toBe('A6')
    expect(r.reason).toBe('sin fijos')
  })

  it("cycleActiveCount===0 con fijos activos → A6 (reason A6′)", () => {
    const r = selectAvisosVariant(avisosInput({ activeFixedCount: 3, cycleActiveCount: 0 }))
    expect(r.variant).toBe('A6')
    expect(r.reason).toMatch(/A6′/)
  })

  it('overdueCount>0 → A5, con hikeCount:0 y tickerCount:1', () => {
    expect(
      selectAvisosVariant(avisosInput({ overdueCount: 1, hikeCount: 0, tickerCount: 1 })).variant,
    ).toBe('A5')
  })

  it('tickerCount:0, hikeCount:0, con fijos activos → A4, no A6', () => {
    const r = selectAvisosVariant(avisosInput({ tickerCount: 0, hikeCount: 0, activeFixedCount: 5 }))
    expect(r.variant).toBe('A4')
  })

  it('tickerCount:0, hikeCount>0 → A3', () => {
    expect(selectAvisosVariant(avisosInput({ tickerCount: 0, hikeCount: 3 })).variant).toBe('A3')
  })

  it('tickerCount>0, hikeCount:0 → A2', () => {
    expect(selectAvisosVariant(avisosInput({ tickerCount: 5, hikeCount: 0 })).variant).toBe('A2')
  })

  it('tickerCount>0, hikeCount>0 → A1', () => {
    expect(selectAvisosVariant(avisosInput({ tickerCount: 5, hikeCount: 3 })).variant).toBe('A1')
  })

  it('sincronización E6/A6: para las mismas activeFixedCount/cycleActiveCount, hero→E6 ⟺ avisos→A6', () => {
    for (const activeFixedCount of [0, 1, 3]) {
      for (const cycleActiveCount of [0, 1, 5]) {
        const heroVariant = selectHeroVariant(heroInput({ activeFixedCount, cycleActiveCount })).variant
        const avisosVariant = selectAvisosVariant(avisosInput({ activeFixedCount, cycleActiveCount })).variant
        expect(heroVariant === 'E6').toBe(avisosVariant === 'A6')
      }
    }
  })

  it('divergencia DOCUMENTADA: con cobro sin confirmar el hero va a E8 y Avisos se queda en A6′ (el kit no tiene "fuera de ciclo" para Avisos)', () => {
    const shared = { activeFixedCount: 1, cycleActiveCount: 0 }
    const hero = selectHeroVariant(
      heroInput({
        ...shared,
        paidCount: 0,
        pendingCount: 0,
        overdueCount: 0,
        isSalaryPendingConfirmation: true,
      }),
    )
    const avisos = selectAvisosVariant(avisosInput({ ...shared, tickerCount: 0, hikeCount: 0 }))
    expect(hero.variant).toBe('E8')
    expect(avisos.variant).toBe('A6')
    expect(avisos.reason).toMatch(/A6′/)
  })

  it('paso 1 endurecido igual que el hero: activeFixedCount===0 con cycleActiveCount>0 no da A6', () => {
    const r = selectAvisosVariant(avisosInput({ activeFixedCount: 0, cycleActiveCount: 5 }))
    expect(r.variant).not.toBe('A6')
  })
})

// ---------------------------------------------------------------------------
// buildTickerItems
// ---------------------------------------------------------------------------

describe('filterDueSoon', () => {
  it('la ventana es <= DUE_SOON_DAYS: 7 entra, 8 no', () => {
    const items = [
      makeFijoItem({ id: 'd7', daysUntilDue: DUE_SOON_DAYS }),
      makeFijoItem({ id: 'd8', daysUntilDue: DUE_SOON_DAYS + 1 }),
      makeFijoItem({ id: 'd0', daysUntilDue: 0 }),
    ]
    expect(filterDueSoon(items).map((i) => i.id)).toEqual(['d7', 'd0'])
  })

  it('la copy de R-B interpola la MISMA constante que el filtro', () => {
    const r = buildReminder({
      overdue: [],
      dueSoon: [makeFijoItem({ id: 'd1', name: 'Spotify' })],
      hikes: [],
      dismissed: {},
    })
    expect(r.label).toContain(`en ${DUE_SOON_DAYS} días`)
  })

  it('ventana explícita distinta del default', () => {
    const items = [makeFijoItem({ id: 'd3', daysUntilDue: 3 }), makeFijoItem({ id: 'd6', daysUntilDue: 6 })]
    expect(filterDueSoon(items, 5).map((i) => i.id)).toEqual(['d3'])
  })
})

describe('buildTickerItems', () => {
  it('overdue primero, luego dueSoon ascendente por daysUntilDue', () => {
    const overdue = [makeFijoItem({ id: 'o1', name: 'Luz', computedStatus: 'overdue', daysUntilDue: 20 })]
    const dueSoon = [
      makeFijoItem({ id: 'd1', name: 'Spotify', daysUntilDue: 3 }),
      makeFijoItem({ id: 'd2', name: 'Gym', daysUntilDue: 0 }),
    ]
    const { items } = buildTickerItems({ overdue, dueSoon, cap: 8 })
    expect(items.map((i) => i.id)).toEqual(['o1', 'd2', 'd1'])
  })

  it('d===0 → tagLabel HOY, tone today', () => {
    const { items } = buildTickerItems({
      overdue: [],
      dueSoon: [makeFijoItem({ id: 'd1', daysUntilDue: 0 })],
      cap: 8,
    })
    expect(items[0]).toMatchObject({ tagLabel: 'HOY', tone: 'today' })
  })

  it('d===3 → "EN 3D" con D mayúscula', () => {
    const { items } = buildTickerItems({
      overdue: [],
      dueSoon: [makeFijoItem({ id: 'd1', daysUntilDue: 3 })],
      cap: 8,
    })
    expect(items[0]!.tagLabel).toBe('EN 3D')
    expect(items[0]!.tone).toBe('upcoming')
  })

  it('d===7 incluido (ventana de 7 días la aplica el caller, acá solo formatea)', () => {
    const { items } = buildTickerItems({
      overdue: [],
      dueSoon: [makeFijoItem({ id: 'd1', daysUntilDue: 7 })],
      cap: 8,
    })
    expect(items[0]!.tagLabel).toBe('EN 7D')
  })

  it('un overdue con daysUntilDue ENVUELTO (grande, ej. 27) sigue dando VENCIDO, no "EN 27D"', () => {
    // Trampa nº1 de fijos-aggregates.model.ts:223-226 — un item overdue
    // puede tener un daysUntilDue grande (wrap del ciclo). El tag nunca se
    // deriva de ese número.
    const overdue = [makeFijoItem({ id: 'o1', computedStatus: 'overdue', daysUntilDue: 27 })]
    const { items } = buildTickerItems({ overdue, dueSoon: [], cap: 8 })
    expect(items[0]).toMatchObject({ tagLabel: 'VENCIDO', tone: 'overdue' })
  })

  it('cap:8 con 12 entradas → items.length===8, dropped===4', () => {
    const overdue = Array.from({ length: 4 }, (_, i) => makeFijoItem({ id: `o${i}`, computedStatus: 'overdue' }))
    const dueSoon = Array.from({ length: 8 }, (_, i) => makeFijoItem({ id: `d${i}`, daysUntilDue: i }))
    const { items, dropped } = buildTickerItems({ overdue, dueSoon, cap: 8 })
    expect(items).toHaveLength(8)
    expect(dropped).toBe(4)
  })

  it('lista vacía → {items:[], dropped:0}', () => {
    expect(buildTickerItems({ overdue: [], dueSoon: [], cap: 8 })).toEqual({ items: [], dropped: 0 })
  })

  it('menos entradas que el cap → dropped:0 (no negativo)', () => {
    const { dropped } = buildTickerItems({
      overdue: [],
      dueSoon: [makeFijoItem({ id: 'd1' })],
      cap: 8,
    })
    expect(dropped).toBe(0)
  })

  it('integración con summarizeFijos — casos de timezone anclados a mediodía local', () => {
    // TODAY_NOON está anclado a mediodía LOCAL (convención anti off-by-one
    // del repo, feedback_timestamptz_off_by_one). Un fijo con next_due_on
    // === hoy debe salir 'pending' con daysUntilDue===0 → tag 'HOY'; uno
    // con next_due_on de ayer, sin pago, 'overdue' → tag 'VENCIDO' pase lo
    // que pase con su daysUntilDue.
    const dueToday = makeFixed({ id: 'today-1', name: 'Gym', next_due_on: '2026-07-19', day_of_month: 19 })
    const overdueYesterday = makeFixed({
      id: 'overdue-1',
      name: 'Luz',
      next_due_on: '2026-07-18',
      day_of_month: 18,
    })
    const dueIn3 = makeFixed({ id: 'soon-1', name: 'Spotify', next_due_on: '2026-07-22', day_of_month: 22 })

    const s = summarizeFijos({
      items: [dueToday, overdueYesterday, dueIn3],
      paymentsThisCycle: [],
      today: TODAY_NOON,
      monthlyStart: new Date(2026, 6, 1),
      monthlyEnd: new Date(2026, 7, 1),
      monthlyDays: 31,
    })

    expect(s.pendingItems.map((i) => i.id).sort()).toEqual(['soon-1', 'today-1'])
    expect(s.overdueItems.map((i) => i.id)).toEqual(['overdue-1'])

    const dueSoon = filterDueSoon(s.pendingItems)
    const { items } = buildTickerItems({ overdue: s.overdueItems, dueSoon, cap: 8 })

    const overdueRow = items.find((i) => i.id === 'overdue-1')
    const todayRow = items.find((i) => i.id === 'today-1')
    const soonRow = items.find((i) => i.id === 'soon-1')
    expect(overdueRow).toMatchObject({ tagLabel: 'VENCIDO', tone: 'overdue' })
    expect(todayRow).toMatchObject({ tagLabel: 'HOY', tone: 'today' })
    expect(soonRow).toMatchObject({ tagLabel: 'EN 3D', tone: 'upcoming' })
  })

  it('integración con el anclaje de PRODUCCIÓN (medianoche local) — pin del off-by-one por TZ de computeItemStatus', () => {
    // El test de arriba ancla `today` a MEDIODÍA, que es robusto para todo
    // |offset| < 12 y por eso no puede fallar en ninguna TZ realista. Pero
    // producción usa MEDIANOCHE local (`usePayCycle` →
    // `normalizeToStartOfDay`), y `computeItemStatus`
    // (`fijos-aggregates.model.ts:184-216`) lee ese `today` con `getUTC*`:
    // al este de UTC la medianoche local cae el día ANTERIOR en UTC, así que
    // el modelo "ve" ayer y un vencido de ayer sale `pending`.
    // Este test pinea las dos ramas — no arregla el modelo compartido (lo
    // usa también la pantalla viva), lo documenta ejecutándolo.
    const overdueYesterday = makeFixed({
      id: 'overdue-1',
      name: 'Luz',
      next_due_on: '2026-07-18',
      day_of_month: 18,
    })
    const s = summarizeFijos({
      items: [overdueYesterday],
      paymentsThisCycle: [],
      today: TODAY_MIDNIGHT,
      monthlyStart: new Date(2026, 6, 1),
      monthlyEnd: new Date(2026, 7, 1),
      monthlyDays: 31,
    })
    // `getTimezoneOffset()` es POSITIVO al oeste de UTC (AR = 180).
    const westOfUtcOrUtc = TODAY_MIDNIGHT.getTimezoneOffset() >= 0
    if (westOfUtcOrUtc) {
      expect(s.overdueItems.map((i) => i.id)).toEqual(['overdue-1'])
      expect(s.pendingItems).toHaveLength(0)
      // El ticker etiqueta VENCIDO por el BUCKET, no por daysUntilDue.
      const { items } = buildTickerItems({
        overdue: s.overdueItems,
        dueSoon: filterDueSoon(s.pendingItems),
        cap: 8,
      })
      expect(items[0]!.tagLabel).toBe('VENCIDO')
    } else {
      // Al este de UTC el vencido se clasifica pending: el off-by-one real.
      expect(s.pendingItems.map((i) => i.id)).toEqual(['overdue-1'])
      expect(s.overdueItems).toHaveLength(0)
    }
  })
})

// ---------------------------------------------------------------------------
// buildHikeRows
// ---------------------------------------------------------------------------

describe('buildHikeRows', () => {
  it('pctLabel:+37% para deltaPct:37 (NO formatDeltaPercent, que esperaría fracción)', () => {
    const rows = buildHikeRows({ hikes: [makeHike({ deltaPct: 37 })], dismissed: {} })
    expect(rows[0]!.pctLabel).toBe('+37%')
  })

  it('formatea fromAmount/toAmount con formatMoney', () => {
    const rows = buildHikeRows({
      hikes: [makeHike({ previousPrice: 8900, currentPrice: 12000 })],
      dismissed: {},
    })
    expect(rows[0]).toMatchObject({ fromAmount: '$8.900', toAmount: '$12.000' })
  })

  it('dismiss al MISMO precio (redondeado) filtra el hike', () => {
    const hike = makeHike({ fixedExpenseId: 'fx-9', currentPrice: 5000 })
    const rows = buildHikeRows({ hikes: [hike], dismissed: { 'fx-9': 5000 } })
    expect(rows).toHaveLength(0)
  })

  it('dismiss a OTRO precio no filtra (el aumento se re-surface)', () => {
    const hike = makeHike({ fixedExpenseId: 'fx-9', currentPrice: 6000 })
    const rows = buildHikeRows({ hikes: [hike], dismissed: { 'fx-9': 5000 } })
    expect(rows).toHaveLength(1)
  })

  it('PARIDAD con isHikeDismissed del store (Home): mismas decisiones para los mismos inputs', () => {
    // `filterActiveHikes` reimplementa la normalización del store en vez de
    // importarla (el store trae React/SecureStore). Este test es el guardián
    // de que las dos no se separen en silencio: si Home filtrara distinto que
    // Fijos, un aumento descartado reaparecería en una de las dos pantallas.
    const cases: Array<[number, Record<string, number>]> = [
      [5000, {}],
      [5000, { 'fx-9': 5000 }],
      [5000, { 'fx-9': 4999 }],
      [5000.4, { 'fx-9': 5000 }],
      [5000.6, { 'fx-9': 5000 }],
      [5000, { otro: 5000 }],
    ]
    for (const [currentPrice, dismissed] of cases) {
      const hike = makeHike({ fixedExpenseId: 'fx-9', currentPrice })
      const keptByVm = filterActiveHikes([hike], dismissed).length === 1
      const keptByStore = !isHikeDismissed('fx-9', currentPrice, dismissed)
      expect(keptByVm, `currentPrice=${currentPrice} dismissed=${JSON.stringify(dismissed)}`).toBe(
        keptByStore,
      )
    }
  })
})

// ---------------------------------------------------------------------------
// buildReminder
// ---------------------------------------------------------------------------

describe('buildReminder', () => {
  it('R-A: reproduce A5 — "3 fijos ya vencieron" + suffix', () => {
    const overdue = [
      makeFijoItem({ id: 'o1', name: 'Luz', amount: 8900 }),
      makeFijoItem({ id: 'o2', name: 'Ecogas', amount: 12300 }),
      makeFijoItem({ id: 'o3', name: 'Expensas', amount: 6500 }),
    ]
    const r = buildReminder({ overdue, dueSoon: [], hikes: [], dismissed: {} })
    expect(r.label).toBe('3 fijos ya vencieron')
    expect(r.rest).toBe('Luz, Ecogas y Expensas suman')
    expect(r.amount).toBe('$27.700')
    expect(r.suffix).toBe('— pagalos para no acumular')
    expect(r.rest).not.toBe('')
    expect(r.amount).not.toBe('')
  })

  it('R-A singular: 1 overdue → "1 fijo ya venció"', () => {
    const r = buildReminder({
      overdue: [makeFijoItem({ id: 'o1', name: 'Luz' })],
      dueSoon: [],
      hikes: [],
      dismissed: {},
    })
    expect(r.label).toBe('1 fijo ya venció')
  })

  it('R-B: reproduce A1/A3 — "3 pagos fijos vencen en 7 días", sin suffix', () => {
    const dueSoon = [
      makeFijoItem({ id: 'd1', name: 'Disney +', amount: 8900, daysUntilDue: 5 }),
      makeFijoItem({ id: 'd2', name: 'Ecogas', amount: 12300, daysUntilDue: 2 }),
      makeFijoItem({ id: 'd3', name: 'Fútbol Otti', amount: 6500, daysUntilDue: 6 }),
    ]
    const r = buildReminder({ overdue: [], dueSoon, hikes: [], dismissed: {} })
    expect(r.label).toBe('3 pagos fijos vencen en 7 días')
    expect(r.rest).toBe('Ecogas, Disney + y Fútbol Otti suman')
    expect(r.amount).toBe('$27.700')
    expect(r.suffix).toBe('')
  })

  it('R-B singular: 1 dueSoon → "1 pago fijo vence en 7 días"', () => {
    const r = buildReminder({
      overdue: [],
      dueSoon: [makeFijoItem({ id: 'd1', name: 'Spotify' })],
      hikes: [],
      dismissed: {},
    })
    expect(r.label).toBe('1 pago fijo vence en 7 días')
  })

  it('R-A gana sobre R-B cuando hay ambos', () => {
    const r = buildReminder({
      overdue: [makeFijoItem({ id: 'o1', name: 'Luz' })],
      dueSoon: [makeFijoItem({ id: 'd1', name: 'Spotify' })],
      hikes: [],
      dismissed: {},
    })
    expect(r.label).toContain('venci')
  })

  it('R-C: sin overdue ni dueSoon, con hikes → los aumentos son el sujeto, rest y amount no vacíos', () => {
    const hikes = [makeHike({ name: 'Netflix', currentPrice: 5000 }), makeHike({ name: 'Spotify', currentPrice: 3000 })]
    const r = buildReminder({ overdue: [], dueSoon: [], hikes, dismissed: {} })
    expect(r.rest).not.toBe('')
    expect(r.amount).not.toBe('')
    expect(r.label).toBe('2 aumentos este mes')
    expect(r.rest).toBe('Netflix y Spotify suman')
    expect(r.amount).toBe('$8.000')
    expect(r.suffix).toBe('')
  })

  it('amount suma SOLO los nombrados (>3 overdue, cap a 3) — no todos', () => {
    const overdue = [
      makeFijoItem({ id: 'o1', name: 'A', amount: 8900 }),
      makeFijoItem({ id: 'o2', name: 'B', amount: 12300 }),
      makeFijoItem({ id: 'o3', name: 'C', amount: 6500 }),
      makeFijoItem({ id: 'o4', name: 'D', amount: 1_000_000 }), // NO debe entrar en la suma
    ]
    const r = buildReminder({ overdue, dueSoon: [], hikes: [], dismissed: {} })
    expect(r.label).toBe('3 fijos ya vencieron') // n capeado a 3, no "4"
    expect(r.rest).toBe('A, B y C suman')
    expect(r.amount).toBe('$27.700')
  })

  it('dueSoon se ordena asc por daysUntilDue antes de nombrar (mismo criterio que el ticker)', () => {
    const dueSoon = [
      makeFijoItem({ id: 'd1', name: 'Lejos', daysUntilDue: 6 }),
      makeFijoItem({ id: 'd2', name: 'Cerca', daysUntilDue: 1 }),
    ]
    const r = buildReminder({ overdue: [], dueSoon, hikes: [], dismissed: {} })
    expect(r.rest).toBe('Cerca y Lejos suman')
  })

  it('R-C cuenta/nombra/suma SOLO los aumentos no descartados (paridad con las filas que se dibujan)', () => {
    const hikes = [
      makeHike({ fixedExpenseId: 'fx-1', name: 'Netflix', currentPrice: 5000 }),
      makeHike({ fixedExpenseId: 'fx-2', name: 'Spotify', currentPrice: 3000 }),
      makeHike({ fixedExpenseId: 'fx-3', name: 'Claude AI', currentPrice: 20_000 }),
    ]
    const dismissed = { 'fx-2': 3000, 'fx-3': 20_000 } // 2 descartados desde Home
    const rows = buildHikeRows({ hikes, dismissed })
    const r = buildReminder({ overdue: [], dueSoon: [], hikes, dismissed })
    expect(rows).toHaveLength(1)
    // El recordatorio describe exactamente esa única fila, no las 3.
    expect(r.label).toBe('1 aumento este mes')
    expect(r.rest).toBe('Netflix suman')
    expect(r.amount).toBe('$5.000')
    expect(r.rest).not.toContain('Spotify')
    expect(r.rest).not.toContain('Claude AI')
  })
})

// ---------------------------------------------------------------------------
// buildHeroContent
// ---------------------------------------------------------------------------

describe('buildHeroContent', () => {
  it('reproduce E2 exacto con los números del fixture', () => {
    const c = buildHeroContent(e2Input)
    expect(c.amount).toBe('$122.831')
    expect(c.paidOfLabel).toBe('13 de 16')
    expect(c.pctLabel).toBe('91%')
    expect(c.paidAmountLabel).toBe('$1.227.651 pagado')
    expect(c.totalAmountLabel).toBe('de $1.350.482 total')
    expect(c.availableAmount).toBe('$5.049.518')
    expect(c.availableOfLabel).toBe('de $6.400.000')
    expect(c.availableNote).toBe('21% va a fijos')
    expect(c.topChipLabel).toBe('HOY · DÍA 18')
    expect(c.eyebrow).toBe('FIJOS DE JULIO')
    expect(c.statusChipLabel).toBe('⚠ 3 fijos por pagar · 1 vencida')
    expect(c.statusChipTone).toBe('alert')
  })

  it('negativo → availableAmount empieza con U+2212, no hyphen ASCII', () => {
    const c = buildHeroContent({ ...e2Input, variant: 'E5', availableRaw: -48_200 })
    expect(c.availableAmount.charCodeAt(0)).toBe(0x2212)
    expect(c.availableWarning).toBe(true)
    expect(c.availableNote).toBe('⚠ te pasás este mes')
  })

  it('hasIncome:false → placeholder marcado, no el fixture (R-6/ABIERTA-8)', () => {
    const c = buildHeroContent({ ...e2Input, hasIncome: false, availableRaw: -999_999 })
    expect(c.availableAmount).toBe('—')
    expect(c.availableOfLabel).toBe('')
    expect(c.availableNote).toBe('sin sueldo fijo')
    expect(c.availableWarning).toBe(false)
  })

  it('cycleActiveCount:0 → segmentsTotal:1 (nunca 0, R-1)', () => {
    const c = buildHeroContent({
      ...e2Input,
      variant: 'E6',
      isEmptyNoFijos: false,
      cycleActiveCount: 0,
      paidCount: 0,
      pendingCount: 0,
      overdueCount: 0,
    })
    expect(c.segmentsTotal).toBe(1)
  })

  it('E6 (isEmptyNoFijos:true) vs E6′ (false) — copy distinta', () => {
    const e6 = buildHeroContent({ ...e2Input, variant: 'E6', isEmptyNoFijos: true, cycleActiveCount: 0 })
    const e6prime = buildHeroContent({ ...e2Input, variant: 'E6', isEmptyNoFijos: false, cycleActiveCount: 0 })
    expect(e6.topChipLabel).toBe('NUEVO')
    expect(e6.emptyTitle).toBe('Todavía no cargaste fijos')
    expect(e6prime.topChipLabel).toBe('SIN CUOTAS')
    expect(e6prime.emptyTitle).toBe('Nada que pagar este ciclo')
    expect(e6.emptyTitle).not.toBe(e6prime.emptyTitle)
    // El CTA es el botón que el usuario toca — la distinción no puede
    // quedar verificada solo por el título.
    expect(e6.emptyCtaLabel).toBe('+ Agregar tu primer fijo')
    expect(e6prime.emptyCtaLabel).toBe('+ Agregar otro fijo')
    expect(e6.emptySub).toContain('Suma alquiler')
    expect(e6prime.emptySub).toContain('ciclos posteriores')
  })

  it('E8: topChipLabel usa salaryPaymentDay, eyebrow especial', () => {
    const c = buildHeroContent({ ...e2Input, variant: 'E8', salaryPaymentDay: 19 })
    expect(c.topChipLabel).toBe('DÍA 19+')
    expect(c.eyebrow).toBe('FIJOS · CICLO TERMINADO')
    expect(c.outOfCycleTitle).toBe('Tu ciclo terminó el 19')
    expect(c.outOfCycleCtaLabel).toBe('✓ Confirmar cobro')
  })

  it('E8: outOfCycleSub nombra el mes del ciclo CERRADO, no el del ciclo vivo (payday 19)', () => {
    // Estado real de E8: payday 19, hoy 20-jul, cobro sin confirmar. El
    // controller pide el ciclo con freeze:false, así que el ciclo vivo ya es
    // [19 jul, 19 ago) → cycleLastDay = 18 ago. El ciclo que TERMINÓ es
    // julio: sale del día anterior a cycleStart (18 jul).
    const c = buildHeroContent({
      ...e2Input,
      variant: 'E8',
      cycleStart: new Date(2026, 6, 19),
      cycleLastDay: new Date(2026, 7, 18),
    })
    expect(c.outOfCycleSub).toBe('Confirma tu cobro para cerrar julio y abrir el próximo ciclo.')
    expect(c.outOfCycleSub).not.toContain('agosto')
  })

  it('E8: payday 1 → el mes cerrado es el anterior (cycleStart 1-jul → junio)', () => {
    const c = buildHeroContent({
      ...e2Input,
      variant: 'E8',
      cycleStart: new Date(2026, 6, 1),
      cycleLastDay: new Date(2026, 6, 31),
    })
    expect(c.outOfCycleSub).toBe('Confirma tu cobro para cerrar junio y abrir el próximo ciclo.')
  })

  it('E8: outOfCycleSummaryAmount formatea el monto vencido', () => {
    const c = buildHeroContent({ ...e2Input, variant: 'E8', overdueCount: 2, overdueAmount: 22_831 })
    expect(c.outOfCycleSummaryAmount).toBe('$22.831')
  })

  it('E8 con overdueCount:0 → "No quedó nada sin pagar"', () => {
    const c = buildHeroContent({ ...e2Input, variant: 'E8', overdueCount: 0 })
    expect(c.outOfCycleSummaryLabel).toBe('No quedó nada sin pagar')
  })

  it('E8 con overdueCount:3 → "Quedaron 3 sin pagar"', () => {
    const c = buildHeroContent({ ...e2Input, variant: 'E8', overdueCount: 3 })
    expect(c.outOfCycleSummaryLabel).toBe('Quedaron 3 sin pagar')
  })

  it('E1: topChipLabel AL DÍA, zeroBadgeLabel con los conteos', () => {
    const c = buildHeroContent({ ...e2Input, variant: 'E1', paidCount: 16, cycleActiveCount: 16, overdueCount: 0, pendingCount: 0 })
    expect(c.topChipLabel).toBe('✓ AL DÍA')
    expect(c.zeroBadgeLabel).toBe('✓ 16 DE 16 · SIN VENCIDOS')
    expect(c.zeroTitle).toBe('Cero pendientes')
  })

  it('E7: topChipLabel SOLO LECTURA', () => {
    const c = buildHeroContent({ ...e2Input, variant: 'E7' })
    expect(c.topChipLabel).toBe('📁 SOLO LECTURA')
  })

  it('E4: topChipLabel sin "HOY ·"', () => {
    const c = buildHeroContent({ ...e2Input, variant: 'E4' })
    expect(c.topChipLabel).toBe('DÍA 18')
  })

  it('segmentsPaid/segmentToday pasan directo', () => {
    const c = buildHeroContent({ ...e2Input, segmentToday: true })
    expect(c.segmentsPaid).toBe(13)
    expect(c.segmentToday).toBe(true)
  })

  it('D9 — totalidad: 28 claves, ninguna undefined (E2)', () => {
    const c = buildHeroContent(e2Input)
    expect(Object.keys(c)).toHaveLength(28)
    for (const [key, value] of Object.entries(c)) {
      expect(value, `campo ${key} no debe ser undefined`).not.toBeUndefined()
    }
  })

  it('D9 — totalidad también en E6/E8 (no solo la shape default)', () => {
    for (const variant of ['E1', 'E6', 'E8'] as const) {
      const c = buildHeroContent({ ...e2Input, variant })
      expect(Object.keys(c)).toHaveLength(28)
      for (const value of Object.values(c)) expect(value).not.toBeUndefined()
    }
  })
})

// ---------------------------------------------------------------------------
// buildAvisosContent
// ---------------------------------------------------------------------------

describe('buildAvisosContent', () => {
  const reminder = { label: '3 pagos fijos vencen en 7 días', rest: 'A, B y C suman', amount: '$1.000', suffix: '' }

  it('D9 — totalidad: 17 claves, ninguna undefined', () => {
    const c = buildAvisosContent({
      variant: 'A1',
      isEmptyNoFijos: false,
      overdueCount: 0,
      tickerItems: [],
      hikeRows: [],
      reminder,
    })
    expect(Object.keys(c)).toHaveLength(17)
    for (const value of Object.values(c)) expect(value).not.toBeUndefined()
  })

  it('badgeCount === tickerItems.length + hikeRows.length', () => {
    const c = buildAvisosContent({
      variant: 'A1',
      isEmptyNoFijos: false,
      overdueCount: 0,
      tickerItems: [
        { id: '1', name: 'a', amount: '$1', tagLabel: 'HOY', tone: 'today' },
        { id: '2', name: 'b', amount: '$1', tagLabel: 'EN 2D', tone: 'upcoming' },
      ],
      hikeRows: [{ id: '3', name: 'c', pctLabel: '+10%', fromAmount: '$1', toAmount: '$2' }],
      reminder,
    })
    expect(c.badgeCount).toBe(3)
  })

  it('reminderSuffix sin espacio inicial (el kit lo antepone)', () => {
    const c = buildAvisosContent({
      variant: 'A5',
      isEmptyNoFijos: false,
      overdueCount: 1,
      tickerItems: [],
      hikeRows: [],
      reminder: { ...reminder, suffix: '— pagalos para no acumular' },
    })
    expect(c.reminderSuffix.charAt(0)).not.toBe(' ')
  })

  it('las 4 ranuras del recordatorio y los 2 arrays son passthrough EXACTO (sin transponer, sin vaciar)', () => {
    // Sin estas aserciones, devolver `tickerItems: []` dejaba la suite verde y
    // el kit mostraba "✓ Nada vence en los próximos días" (`hasTicker` se
    // deriva de `.length > 0`) a una familia con vencidos — R-3, la falla
    // peligrosa porque es tranquilizadora. Y transponer rest/amount pasaba
    // igual con solo el test de `charAt(0)`.
    const tickerItems = [
      { id: 't1', name: 'Luz', amount: '$8.900', tagLabel: 'VENCIDO', tone: 'overdue' as const },
    ]
    const hikeRows = [
      { id: 'h1', name: 'Netflix', pctLabel: '+25%', fromAmount: '$4.000', toAmount: '$5.000' },
    ]
    const r = {
      label: '1 fijo ya venció',
      rest: 'Luz suman',
      amount: '$8.900',
      suffix: '— pagalos para no acumular',
    }
    const c = buildAvisosContent({
      variant: 'A5',
      isEmptyNoFijos: false,
      overdueCount: 1,
      tickerItems,
      hikeRows,
      reminder: r,
    })
    expect(c.tickerItems).toEqual(tickerItems)
    expect(c.hikeRows).toEqual(hikeRows)
    expect(c.reminderLabel).toBe(r.label)
    expect(c.reminderRest).toBe(r.rest)
    expect(c.reminderAmount).toBe(r.amount)
    expect(c.reminderSuffix).toBe(r.suffix)
    // El pozo estático solo se dibuja cuando NO hay ticker; con ticker no
    // debe poder ganarle a la lista.
    expect(c.tickerItems).toHaveLength(1)
    expect(c.staticMessage).toBe('✓ Nada vence en los próximos días')
  })

  it('badgeTone urgent cuando overdueCount>0', () => {
    const c = buildAvisosContent({
      variant: 'A5',
      isEmptyNoFijos: false,
      overdueCount: 1,
      tickerItems: [],
      hikeRows: [],
      reminder,
    })
    expect(c.badgeTone).toBe('urgent')
    expect(c.cardUrgent).toBe(true)
  })

  it('A6 vs A6′ — copy distinta según isEmptyNoFijos', () => {
    const a6 = buildAvisosContent({
      variant: 'A6',
      isEmptyNoFijos: true,
      overdueCount: 0,
      tickerItems: [],
      hikeRows: [],
      reminder,
    })
    const a6prime = buildAvisosContent({
      variant: 'A6',
      isEmptyNoFijos: false,
      overdueCount: 0,
      tickerItems: [],
      hikeRows: [],
      reminder,
    })
    expect(a6.emptyTitle).toBe('Todavía no cargaste fijos')
    expect(a6prime.emptyTitle).toBe('Nada que pagar este ciclo')
    expect(a6.emptyTitle).not.toBe(a6prime.emptyTitle)
    expect(a6.emptyCtaLabel).toBe('+ Agregar tu primer fijo')
    expect(a6prime.emptyCtaLabel).toBe('+ Agregar otro fijo')
    expect(a6.emptySub).not.toBe(a6prime.emptySub)
  })

  it('A4: calmTitle/calmSub presentes, ausentes en el resto', () => {
    const a4 = buildAvisosContent({
      variant: 'A4',
      isEmptyNoFijos: false,
      overdueCount: 0,
      tickerItems: [],
      hikeRows: [],
      reminder,
    })
    expect(a4.calmTitle).toBe('Todo tranquilo por acá')
    expect(a4.calmSub).toBe(
      'No hay vencimientos próximos ni cambios de precio esta semana. Te avisamos si algo cambia.',
    )
    const a2 = buildAvisosContent({
      variant: 'A2',
      isEmptyNoFijos: false,
      overdueCount: 0,
      tickerItems: [],
      hikeRows: [],
      reminder,
    })
    expect(a2.calmTitle).toBe('')
    expect(a2.calmSub).toBe('')
  })

  it('brotPose mapea 1:1 por variante', () => {
    const poseFor = (variant: 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6') =>
      buildAvisosContent({
        variant,
        isEmptyNoFijos: false,
        overdueCount: 0,
        tickerItems: [],
        hikeRows: [],
        reminder,
      }).brotPose
    expect(poseFor('A1')).toBe('worried')
    expect(poseFor('A2')).toBe('think')
    expect(poseFor('A3')).toBe('think')
    expect(poseFor('A4')).toBe('cheer')
    expect(poseFor('A5')).toBe('sad')
    expect(poseFor('A6')).toBe('wave')
  })
})

// ---------------------------------------------------------------------------
// buildCategoriesContent
// ---------------------------------------------------------------------------

describe('buildCategoriesContent', () => {
  it('5 claves, los 3 counts son string, groups es passthrough', () => {
    const groups = [
      {
        category: 'housing' as const,
        icon: '🏠',
        name: 'Vivienda',
        meta: '2 ítems · al día ✓',
        metaTone: 'ok' as const,
        amount: '$1.500',
      },
    ]
    const c = buildCategoriesContent({
      activeTab: 'vencidos',
      vencidosCount: 1,
      pendientesCount: 3,
      pagadosCount: 12,
      groups,
    })
    expect(c.groups).toEqual(groups)
    expect(Object.keys(c)).toHaveLength(5)
    expect(c.vencidosCount).toBe('1')
    expect(typeof c.vencidosCount).toBe('string')
    expect(c.pendientesCount).toBe('3')
    expect(c.pagadosCount).toBe('12')
    expect(c.activeTab).toBe('vencidos')
  })
})

// ---------------------------------------------------------------------------
// buildCategoryBuckets
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// 6.1 — El drift de cycleDays (D8): weekly/biweekly/custom divergen,
// monthly coincide. Test DIRECTO sobre las funciones puras, sin hooks.
// ---------------------------------------------------------------------------

describe('drift cycle.days (usePayCycle) vs monthlyAccounting.days (§6.1)', () => {
  it('weekly: cycle.days=7 pero monthlyAccounting.days = días del mes calendario (31 en julio)', () => {
    const cfg: FinanceCycleConfig = {
      cycle_type: 'weekly',
      cycle_anchor_date: '2026-07-06',
      cycle_length_days: 7,
    }
    const today = new Date(2026, 6, 22)
    const cycleDays = getCurrentPayCycle(today, cfg).days
    const monthlyDays = computeMonthlyAccountingWindow(cfg, today, false, false).days
    expect(cycleDays).toBe(7)
    expect(monthlyDays).toBe(31)
    expect(cycleDays).not.toBe(monthlyDays)
  })

  it('biweekly: también divergen', () => {
    const cfg: FinanceCycleConfig = {
      cycle_type: 'biweekly',
      cycle_anchor_date: '2026-07-01',
      cycle_length_days: 14,
    }
    const today = new Date(2026, 6, 22)
    const cycleDays = getCurrentPayCycle(today, cfg).days
    const monthlyDays = computeMonthlyAccountingWindow(cfg, today, false, false).days
    expect(cycleDays).toBe(14)
    expect(monthlyDays).toBe(31)
    expect(cycleDays).not.toBe(monthlyDays)
  })

  it('custom: también divergen', () => {
    const cfg: FinanceCycleConfig = {
      cycle_type: 'custom',
      cycle_anchor_date: '2026-07-01',
      cycle_length_days: 10,
    }
    const today = new Date(2026, 6, 22)
    const cycleDays = getCurrentPayCycle(today, cfg).days
    const monthlyDays = computeMonthlyAccountingWindow(cfg, today, false, false).days
    expect(cycleDays).toBe(10)
    expect(monthlyDays).toBe(31)
    expect(cycleDays).not.toBe(monthlyDays)
  })

  it('monthly: coinciden (por eso derivar el día del ciclo no es regresión para monthly)', () => {
    const cfg: FinanceCycleConfig = { cycle_type: 'monthly', salary_payment_day: 5 }
    const today = new Date(2026, 6, 22)
    const cycleDays = getCurrentPayCycle(today, cfg).days
    const monthlyDays = computeMonthlyAccountingWindow(cfg, today, false, false).days
    expect(cycleDays).toBe(monthlyDays)
  })
})
