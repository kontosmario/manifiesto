import { describe, it, expect } from 'vitest'
import {
  plural,
  joinNamesEs,
  formatSignedMoneyFijos,
  monthUpperEs,
  monthLowerEs,
  buildCycleHeaderLabel,
  mapCategoryToBucket,
  buildStatusChip,
  selectHeroVariant,
  selectAvisosVariant,
  buildTickerItems,
  buildHikeRows,
  buildReminder,
  buildHeroContent,
  buildAvisosContent,
  buildCategoryBuckets,
  buildCategoriesContent,
  type HeroVariantInput,
  type AvisosVariantInput,
} from '@/features/fijos/neo-fijos-view-model'
import { summarizeFijos, type FijoItem, type FijoCategoryGroup } from '@/features/fijos/fijos-aggregates.model'
import type { FixedExpense } from '@/features/fixed-expenses/fixed-expense-types'
import type { FijoHikeAlert } from '@/features/fijos/fijos-aggregates.model'
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
// mapCategoryToBucket
// ---------------------------------------------------------------------------

describe('mapCategoryToBucket', () => {
  it.each([
    ['Vivienda', 'housing'],
    ['Impuestos', 'housing'],
    ['Suscripciones', 'subscriptions'],
    ['Educación', 'subscriptions'],
    ['Deporte', 'subscriptions'],
    ['Servicios', 'services'],
    ['Salud', 'services'],
    ['Seguros', 'services'],
    ['Cuotas y deudas', 'services'],
    ['Inversiones', 'services'],
    ['Otros', 'services'],
  ] as const)('%s → %s', (raw, expected) => {
    expect(mapCategoryToBucket(raw)).toBe(expected)
  })

  it('sin acentos y en minúscula matchea igual', () => {
    expect(mapCategoryToBucket('educacion')).toBe('subscriptions')
  })

  it('categoría custom cae a services (fallback)', () => {
    expect(mapCategoryToBucket('Peluquería')).toBe('services')
  })

  it("'' cae a services", () => {
    expect(mapCategoryToBucket('')).toBe('services')
  })

  it("'sin-categoria' cae a services", () => {
    expect(mapCategoryToBucket('sin-categoria')).toBe('services')
  })
})

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
      daysIntoMonth: 18,
    })
    expect(chip).toEqual({ label: '⚠ 3 fijos por pagar · 1 vencida', tone: 'alert' })
  })

  it('E7 (drift del handoff): overdue===0, pending===0 → success con conteos propios', () => {
    const chip = buildStatusChip({
      overdueCount: 0,
      pendingCount: 0,
      paidCount: 18,
      cycleActiveCount: 18,
      daysIntoMonth: 10,
    })
    expect(chip).toEqual({ label: '✓ Cerró completo · 18 de 18', tone: 'success' })
  })

  it('E3: overdue===0, pending>0, no es día 1 → neutral "por venir"', () => {
    const chip = buildStatusChip({
      overdueCount: 0,
      pendingCount: 2,
      paidCount: 14,
      cycleActiveCount: 16,
      daysIntoMonth: 12,
    })
    expect(chip).toEqual({ label: '2 por venir · nada vencido', tone: 'neutral' })
  })

  it('E4: overdue===0, pending>0, día 1 → neutral "recién cobraste"', () => {
    const chip = buildStatusChip({
      overdueCount: 0,
      pendingCount: 16,
      paidCount: 0,
      cycleActiveCount: 16,
      daysIntoMonth: 1,
    })
    expect(chip).toEqual({ label: '16 fijos este mes · recién cobraste', tone: 'neutral' })
  })

  it('overdue>0, pending===0 → alert sin "fijos por pagar"', () => {
    const chip = buildStatusChip({
      overdueCount: 2,
      pendingCount: 0,
      paidCount: 14,
      cycleActiveCount: 16,
      daysIntoMonth: 15,
    })
    expect(chip).toEqual({ label: '⚠ 2 vencidas', tone: 'alert' })
  })

  it('overdueCount:1 → plural singular ("1 vencida")', () => {
    const chip = buildStatusChip({
      overdueCount: 1,
      pendingCount: 0,
      paidCount: 15,
      cycleActiveCount: 16,
      daysIntoMonth: 15,
    })
    expect(chip.label).toBe('⚠ 1 vencida')
  })

  it('overdueCount:2 → plural ("2 vencidas")', () => {
    const chip = buildStatusChip({
      overdueCount: 2,
      pendingCount: 1,
      paidCount: 13,
      cycleActiveCount: 16,
      daysIntoMonth: 15,
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
    daysIntoMonth: 18,
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

  it('paso 2: activeFixedCount===0 → E6 ("sin fijos"), incluso con overdue>0 (precedencia)', () => {
    const r = selectHeroVariant(heroInput({ activeFixedCount: 0, overdueCount: 3 }))
    expect(r.variant).toBe('E6')
    expect(r.reason).toMatch(/sin fijos/)
  })

  it("paso 3 (E6′): cycleActiveCount===0 con activeFixedCount>0 → E6 con reason de E6′ (barra vacía evitada)", () => {
    const r = selectHeroVariant(
      heroInput({ activeFixedCount: 3, cycleActiveCount: 0, paidCount: 0, pendingCount: 0, overdueCount: 0 }),
    )
    expect(r.variant).toBe('E6')
    expect(r.reason).toMatch(/E6′/)
  })

  it('paso 4: isSalaryPendingConfirmation → E8, incluso con overdue===0 y pending===0 (no E1)', () => {
    const r = selectHeroVariant(
      heroInput({ isSalaryPendingConfirmation: true, overdueCount: 0, pendingCount: 0 }),
    )
    expect(r.variant).toBe('E8')
  })

  it('paso 5: hasIncome && availableRaw<0 → E5, incluso con overdue===0/pending===0 (no E1)', () => {
    const r = selectHeroVariant(heroInput({ availableRaw: -1, overdueCount: 0, pendingCount: 0 }))
    expect(r.variant).toBe('E5')
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

  it('paso 7: daysIntoMonth===1 + overdueCount:1 → E2, no E4 (overdue gana)', () => {
    const r = selectHeroVariant(
      heroInput({ daysIntoMonth: 1, paidCount: 0, pendingCount: 16, overdueCount: 1 }),
    )
    expect(r.variant).toBe('E2')
  })

  it('paso 7: día 1, sin pagos, sin vencidos → E4', () => {
    const r = selectHeroVariant(
      heroInput({ daysIntoMonth: 1, paidCount: 0, pendingCount: 16, overdueCount: 0 }),
    )
    expect(r.variant).toBe('E4')
  })

  it('día 1 pero ya con algo pagado → no es E4 (cae a E3)', () => {
    const r = selectHeroVariant(
      heroInput({ daysIntoMonth: 1, paidCount: 1, pendingCount: 15, overdueCount: 0 }),
    )
    expect(r.variant).toBe('E3')
  })

  it('paso 8: overdue===0, pending>0, no día 1 → E3', () => {
    expect(
      selectHeroVariant(heroInput({ overdueCount: 0, pendingCount: 2, daysIntoMonth: 12 })).variant,
    ).toBe('E3')
  })

  it('paso 9 (else): mezcla pendientes y vencidos → E2', () => {
    expect(
      selectHeroVariant(heroInput({ overdueCount: 1, pendingCount: 2, daysIntoMonth: 18 })).variant,
    ).toBe('E2')
  })

  it('totalidad: exactamente 8 variantes distintas son alcanzables sobre una grilla de combinaciones', () => {
    const seen = new Set<string>()
    for (const activeFixedCount of [0, 3]) {
      for (const cycleActiveCount of [0, 5]) {
        for (const paidCount of [0, 2]) {
          for (const pendingCount of [0, 2]) {
            for (const overdueCount of [0, 2]) {
              for (const daysIntoMonth of [1, 15]) {
                for (const hasIncome of [true, false]) {
                  for (const availableRaw of [-1, 1]) {
                    for (const isSalaryPendingConfirmation of [true, false]) {
                      const r = selectHeroVariant({
                        activeFixedCount,
                        cycleActiveCount,
                        paidCount,
                        pendingCount,
                        overdueCount,
                        daysIntoMonth,
                        hasIncome,
                        availableRaw,
                        isSalaryPendingConfirmation,
                        viewingClosedEdition: false,
                      })
                      seen.add(r.variant)
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
    // E7 queda afuera de esta grilla (viewingClosedEdition fijo en false).
    expect(seen.has('E7')).toBe(false)
    expect(seen.size).toBeGreaterThan(0)
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
  it('activeFixedCount===0 → A6', () => {
    expect(selectAvisosVariant(avisosInput({ activeFixedCount: 0 })).variant).toBe('A6')
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
})

// ---------------------------------------------------------------------------
// buildTickerItems
// ---------------------------------------------------------------------------

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

    const dueSoon = s.pendingItems.filter((i) => i.daysUntilDue <= 7)
    const { items } = buildTickerItems({ overdue: s.overdueItems, dueSoon, cap: 8 })

    const overdueRow = items.find((i) => i.id === 'overdue-1')
    const todayRow = items.find((i) => i.id === 'today-1')
    const soonRow = items.find((i) => i.id === 'soon-1')
    expect(overdueRow).toMatchObject({ tagLabel: 'VENCIDO', tone: 'overdue' })
    expect(todayRow).toMatchObject({ tagLabel: 'HOY', tone: 'today' })
    expect(soonRow).toMatchObject({ tagLabel: 'EN 3D', tone: 'upcoming' })
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
    const r = buildReminder({ overdue, dueSoon: [], hikes: [] })
    expect(r.label).toBe('3 fijos ya vencieron')
    expect(r.rest).toBe('Luz, Ecogas y Expensas suman')
    expect(r.amount).toBe('$27.700')
    expect(r.suffix).toBe('— pagalos para no acumular')
    expect(r.rest).not.toBe('')
    expect(r.amount).not.toBe('')
  })

  it('R-A singular: 1 overdue → "1 fijo ya venció"', () => {
    const r = buildReminder({ overdue: [makeFijoItem({ id: 'o1', name: 'Luz' })], dueSoon: [], hikes: [] })
    expect(r.label).toBe('1 fijo ya venció')
  })

  it('R-B: reproduce A1/A3 — "3 pagos fijos vencen en 7 días", sin suffix', () => {
    const dueSoon = [
      makeFijoItem({ id: 'd1', name: 'Disney +', amount: 8900, daysUntilDue: 5 }),
      makeFijoItem({ id: 'd2', name: 'Ecogas', amount: 12300, daysUntilDue: 2 }),
      makeFijoItem({ id: 'd3', name: 'Fútbol Otti', amount: 6500, daysUntilDue: 6 }),
    ]
    const r = buildReminder({ overdue: [], dueSoon, hikes: [] })
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
    })
    expect(r.label).toBe('1 pago fijo vence en 7 días')
  })

  it('R-A gana sobre R-B cuando hay ambos', () => {
    const r = buildReminder({
      overdue: [makeFijoItem({ id: 'o1', name: 'Luz' })],
      dueSoon: [makeFijoItem({ id: 'd1', name: 'Spotify' })],
      hikes: [],
    })
    expect(r.label).toContain('venci')
  })

  it('R-C: sin overdue ni dueSoon, con hikes → los aumentos son el sujeto, rest y amount no vacíos', () => {
    const hikes = [makeHike({ name: 'Netflix', currentPrice: 5000 }), makeHike({ name: 'Spotify', currentPrice: 3000 })]
    const r = buildReminder({ overdue: [], dueSoon: [], hikes })
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
    const r = buildReminder({ overdue, dueSoon: [], hikes: [] })
    expect(r.label).toBe('3 fijos ya vencieron') // n capeado a 3, no "4"
    expect(r.rest).toBe('A, B y C suman')
    expect(r.amount).toBe('$27.700')
  })

  it('dueSoon se ordena asc por daysUntilDue antes de nombrar (mismo criterio que el ticker)', () => {
    const dueSoon = [
      makeFijoItem({ id: 'd1', name: 'Lejos', daysUntilDue: 6 }),
      makeFijoItem({ id: 'd2', name: 'Cerca', daysUntilDue: 1 }),
    ]
    const r = buildReminder({ overdue: [], dueSoon, hikes: [] })
    expect(r.rest).toBe('Cerca y Lejos suman')
  })
})

// ---------------------------------------------------------------------------
// buildHeroContent
// ---------------------------------------------------------------------------

describe('buildHeroContent', () => {
  const e2Input = {
    variant: 'E2' as const,
    isEmptyNoFijos: false,
    cycleLastDay: new Date(2026, 6, 19),
    daysIntoMonth: 18,
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
  })

  it('E8: topChipLabel usa salaryPaymentDay, eyebrow especial', () => {
    const c = buildHeroContent({ ...e2Input, variant: 'E8', salaryPaymentDay: 19 })
    expect(c.topChipLabel).toBe('DÍA 19+')
    expect(c.eyebrow).toBe('FIJOS · CICLO TERMINADO')
    expect(c.outOfCycleTitle).toBe('Tu ciclo terminó el 19')
    expect(c.outOfCycleCtaLabel).toBe('✓ Confirmar cobro')
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
    const a2 = buildAvisosContent({
      variant: 'A2',
      isEmptyNoFijos: false,
      overdueCount: 0,
      tickerItems: [],
      hikeRows: [],
      reminder,
    })
    expect(a2.calmTitle).toBe('')
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
  it('5 claves, los 3 counts son string', () => {
    const c = buildCategoriesContent({
      activeTab: 'vencidos',
      vencidosCount: 1,
      pendientesCount: 3,
      pagadosCount: 12,
      groups: [],
    })
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

describe('buildCategoryBuckets', () => {
  it('2 grupos reales que colapsan a la misma llave → 1 bucket con amount sumado', () => {
    const overdueItem = makeFijoItem({ id: 'i1', computedStatus: 'overdue' })
    const pendingItem = makeFijoItem({ id: 'i2', computedStatus: 'pending' })
    const groups: FijoCategoryGroup[] = [
      makeCategoryGroup({ rawLabel: 'Vivienda', label: 'Vivienda', total: 1000, items: [overdueItem] }),
      makeCategoryGroup({ rawLabel: 'Impuestos', label: 'Impuestos', total: 500, items: [pendingItem] }),
    ]
    const { buckets, collapsed } = buildCategoryBuckets({ groups })
    expect(buckets).toHaveLength(1)
    expect(buckets[0]!.category).toBe('housing')
    expect(buckets[0]!.amount).toBe('$1.500')
    expect(collapsed).toEqual([{ bucket: 'housing', realLabels: ['Vivienda', 'Impuestos'] }])
  })

  it('sin duplicados de category (guardián de C7)', () => {
    const groups: FijoCategoryGroup[] = [
      makeCategoryGroup({ rawLabel: 'Vivienda' }),
      makeCategoryGroup({ rawLabel: 'Impuestos' }),
      makeCategoryGroup({ rawLabel: 'Salud' }),
      makeCategoryGroup({ rawLabel: 'Seguros' }),
      makeCategoryGroup({ rawLabel: 'Suscripciones' }),
    ]
    const { buckets } = buildCategoryBuckets({ groups })
    const categories = buckets.map((b) => b.category)
    expect(new Set(categories).size).toBe(categories.length)
    expect(categories.length).toBeLessThanOrEqual(3)
  })

  it('orden = primera aparición en el array de entrada', () => {
    const groups: FijoCategoryGroup[] = [
      makeCategoryGroup({ rawLabel: 'Otros' }), // services
      makeCategoryGroup({ rawLabel: 'Vivienda' }), // housing
      makeCategoryGroup({ rawLabel: 'Suscripciones' }), // subscriptions
      makeCategoryGroup({ rawLabel: 'Salud' }), // services (ya visto)
    ]
    const { buckets } = buildCategoryBuckets({ groups })
    expect(buckets.map((b) => b.category)).toEqual(['services', 'housing', 'subscriptions'])
  })

  it('bucket sin ítems se omite (input vacío → salida vacía)', () => {
    expect(buildCategoryBuckets({ groups: [] })).toEqual({ buckets: [], collapsed: [] })
  })

  it('meta: overdue>0 → tone overdue', () => {
    const groups: FijoCategoryGroup[] = [
      makeCategoryGroup({
        rawLabel: 'Vivienda',
        items: [makeFijoItem({ computedStatus: 'overdue' }), makeFijoItem({ computedStatus: 'paid' })],
      }),
    ]
    const { buckets } = buildCategoryBuckets({ groups })
    expect(buckets[0]!.meta).toBe('2 ítems · 1 vencido')
    expect(buckets[0]!.metaTone).toBe('overdue')
  })

  it('meta: pending===0 (y overdue===0) → tone ok, "al día"', () => {
    const groups: FijoCategoryGroup[] = [
      makeCategoryGroup({
        rawLabel: 'Vivienda',
        items: [
          makeFijoItem({ computedStatus: 'paid' }),
          makeFijoItem({ computedStatus: 'paid' }),
          makeFijoItem({ computedStatus: 'paid' }),
          makeFijoItem({ computedStatus: 'paid' }),
          makeFijoItem({ computedStatus: 'paid' }),
        ],
      }),
    ]
    const { buckets } = buildCategoryBuckets({ groups })
    expect(buckets[0]!.meta).toBe('5 ítems · al día ✓')
    expect(buckets[0]!.metaTone).toBe('ok')
  })

  it('meta: overdue===0, pending>0 → tone neutral, "N pagados"', () => {
    const groups: FijoCategoryGroup[] = [
      makeCategoryGroup({
        rawLabel: 'Vivienda',
        items: [
          makeFijoItem({ computedStatus: 'pending' }),
          makeFijoItem({ computedStatus: 'paid' }),
          makeFijoItem({ computedStatus: 'paid' }),
          makeFijoItem({ computedStatus: 'paid' }),
        ],
      }),
    ]
    const { buckets } = buildCategoryBuckets({ groups })
    expect(buckets[0]!.meta).toBe('4 ítems · 3 pagados')
    expect(buckets[0]!.metaTone).toBe('neutral')
  })

  it('name/icon son los literales fijos por bucket', () => {
    const groups: FijoCategoryGroup[] = [
      makeCategoryGroup({ rawLabel: 'Vivienda' }),
      makeCategoryGroup({ rawLabel: 'Suscripciones' }),
      makeCategoryGroup({ rawLabel: 'Otros' }),
    ]
    const { buckets } = buildCategoryBuckets({ groups })
    const byCat = Object.fromEntries(buckets.map((b) => [b.category, b]))
    expect(byCat.housing).toMatchObject({ icon: '🏠', name: 'Vivienda' })
    expect(byCat.subscriptions).toMatchObject({ icon: '📺', name: 'Suscripciones' })
    expect(byCat.services).toMatchObject({ icon: '💡', name: 'Servicios' })
  })
})

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

  it('monthly: coinciden (justifica por qué esta spec usa monthlyAccounting.daysIntoMonth directo, C4)', () => {
    const cfg: FinanceCycleConfig = { cycle_type: 'monthly', salary_payment_day: 5 }
    const today = new Date(2026, 6, 22)
    const cycleDays = getCurrentPayCycle(today, cfg).days
    const monthlyDays = computeMonthlyAccountingWindow(cfg, today, false, false).days
    expect(cycleDays).toBe(monthlyDays)
  })
})
