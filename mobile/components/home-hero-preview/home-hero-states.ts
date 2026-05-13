/**
 * Estados representativos para alimentar las 6 variantes del nuevo
 * Home hero card. Cada estado modela un "momento del ciclo" que el
 * usuario va a encontrar al abrir la app.
 *
 *   inicio_ciclo         día 2/30 · proyección aún no confiable
 *   al_dia               día 14/30 · saldo positivo, en línea
 *   adelantado_ahorro    día 14/30 · va a cerrar +$ con savings chip
 *   cerrando_apenas      día 25/30 · cierre casi en 0
 *   en_apuros            día 18/30 · proyección negativa
 *   payday_overdue       cobró hace 3d, no confirmó
 *   cycle_adjusted       saldo overrideado este ciclo
 *   setup                sin ingreso configurado · CTA setup
 */

export type HomeHeroDaypart = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night'

export interface HomeHeroSavingsChip {
  kind: 'healthy' | 'partial' | 'consumed'
  /** "Apartando $X de $Y" o estado equivalente */
  label: string
  /** SR-friendly */
  a11y: string
  /** Aporte del ciclo actual */
  contribution: number
  target: number
}

export interface HomeHeroState {
  id: string
  label: string
  description: string

  // Saldo + ciclo
  availableToday: number
  monthlyIncome: number
  cycleDay: number
  cycleTotalDays: number
  cycleMonth: string
  /** Día de mes en que arranca el ciclo (ej. "5 May") */
  cycleStartLabel: string
  /** Día de mes en que cierra el ciclo (ej. "4 Jun") */
  cycleEndLabel: string

  // Money flow
  dailyBudget: number
  projectedClose: number
  /** Δ% vs ciclo anterior · -0.08 = -8% (cierra mejor) */
  projectedCloseTrend: number | null
  /** Δ% gasto variable vs mes pasado · 0.12 = +12% (gasta más) */
  variableTrend: number | null
  variableTotal: number
  fixedPaid: number
  fixedCount: number

  // Daypart context · una variante (B Reloj de Sol) lo usa para color
  daypart: HomeHeroDaypart
  horaActual: number
  diaLabel: string

  // States flags
  cycleAdjusted: boolean
  paydayPending: boolean
  paydayDaysOverdue: number
  projectionReliable: boolean
  incomeConfigured: boolean

  // Engagement
  /** Racha de días bajo cupo terminada ayer. */
  racha: number
  /** Cuántos días del ciclo ya cerraron bajo cupo. */
  closedWinningDays: number
  closedDays: number

  // Optional · alimenta chips de algunas variantes
  savingsChip?: HomeHeroSavingsChip | null
  /** Ingresos extra del ciclo (no salary) — eg ventas, freelance. */
  extraIncome?: number
}

const fmtRange = (start: string, end: string) => `${start} → ${end}`

export const HOME_HERO_STATES: HomeHeroState[] = [
  {
    id: 'al_dia',
    label: 'Al día (golden path)',
    description: 'Día 14/30 · saldo positivo · proyección confiable · sin alerts',
    availableToday: 418_350,
    monthlyIncome: 620_000,
    cycleDay: 14,
    cycleTotalDays: 30,
    cycleMonth: 'mayo 2026',
    cycleStartLabel: '5 May',
    cycleEndLabel: '4 Jun',
    dailyBudget: 13_900,
    projectedClose: 48_400,
    projectedCloseTrend: -0.08,
    variableTrend: -0.12,
    variableTotal: 178_650,
    fixedPaid: 5,
    fixedCount: 8,
    daypart: 'afternoon',
    horaActual: 16,
    diaLabel: 'MIÉRCOLES 19 MAY',
    cycleAdjusted: false,
    paydayPending: false,
    paydayDaysOverdue: 0,
    projectionReliable: true,
    incomeConfigured: true,
    racha: 3,
    closedWinningDays: 9,
    closedDays: 13,
    savingsChip: null,
    extraIncome: 0,
  },
  {
    id: 'inicio_ciclo',
    label: 'Inicio de ciclo',
    description: 'Día 2/30 · recién cobraste · proyección aún no confiable',
    availableToday: 612_000,
    monthlyIncome: 620_000,
    cycleDay: 2,
    cycleTotalDays: 30,
    cycleMonth: 'mayo 2026',
    cycleStartLabel: '5 May',
    cycleEndLabel: '4 Jun',
    dailyBudget: 20_400,
    projectedClose: 0,
    projectedCloseTrend: null,
    variableTrend: null,
    variableTotal: 8_000,
    fixedPaid: 0,
    fixedCount: 8,
    daypart: 'morning',
    horaActual: 10,
    diaLabel: 'JUEVES 7 MAY',
    cycleAdjusted: false,
    paydayPending: false,
    paydayDaysOverdue: 0,
    projectionReliable: false,
    incomeConfigured: true,
    racha: 1,
    closedWinningDays: 1,
    closedDays: 1,
    savingsChip: null,
    extraIncome: 0,
  },
  {
    id: 'adelantado_ahorro',
    label: 'Adelantado · ahorro on',
    description: 'Día 14/30 · va a cerrar +$ · savings chip healthy',
    availableToday: 502_100,
    monthlyIncome: 620_000,
    cycleDay: 14,
    cycleTotalDays: 30,
    cycleMonth: 'mayo 2026',
    cycleStartLabel: '5 May',
    cycleEndLabel: '4 Jun',
    dailyBudget: 18_400,
    projectedClose: 96_200,
    projectedCloseTrend: -0.18,
    variableTrend: -0.22,
    variableTotal: 108_900,
    fixedPaid: 5,
    fixedCount: 8,
    daypart: 'evening',
    horaActual: 20,
    diaLabel: 'MIÉRCOLES 19 MAY',
    cycleAdjusted: false,
    paydayPending: false,
    paydayDaysOverdue: 0,
    projectionReliable: true,
    incomeConfigured: true,
    racha: 5,
    closedWinningDays: 11,
    closedDays: 13,
    savingsChip: {
      kind: 'healthy',
      label: 'Apartando $80k de $80k',
      a11y: 'Apartando 80 mil de 80 mil este ciclo',
      contribution: 80_000,
      target: 80_000,
    },
    extraIncome: 0,
  },
  {
    id: 'cerrando_apenas',
    label: 'Cerrando apenas',
    description: 'Día 25/30 · cierre casi en 0 · alerta sutil',
    availableToday: 84_500,
    monthlyIncome: 620_000,
    cycleDay: 25,
    cycleTotalDays: 30,
    cycleMonth: 'mayo 2026',
    cycleStartLabel: '5 May',
    cycleEndLabel: '4 Jun',
    dailyBudget: 16_900,
    projectedClose: 4_200,
    projectedCloseTrend: 0.04,
    variableTrend: 0.06,
    variableTotal: 412_300,
    fixedPaid: 8,
    fixedCount: 8,
    daypart: 'afternoon',
    horaActual: 15,
    diaLabel: 'DOMINGO 30 MAY',
    cycleAdjusted: false,
    paydayPending: false,
    paydayDaysOverdue: 0,
    projectionReliable: true,
    incomeConfigured: true,
    racha: 1,
    closedWinningDays: 16,
    closedDays: 24,
    savingsChip: {
      kind: 'partial',
      label: 'Apartando $42k de $80k',
      a11y: 'Apartando 42 mil de 80 mil este ciclo',
      contribution: 42_000,
      target: 80_000,
    },
    extraIncome: 0,
  },
  {
    id: 'en_apuros',
    label: 'En apuros',
    description: 'Día 18/30 · proyección NEGATIVA · va a faltar plata',
    availableToday: 142_800,
    monthlyIncome: 620_000,
    cycleDay: 18,
    cycleTotalDays: 30,
    cycleMonth: 'mayo 2026',
    cycleStartLabel: '5 May',
    cycleEndLabel: '4 Jun',
    dailyBudget: 11_900,
    projectedClose: -58_400,
    projectedCloseTrend: 0.24,
    variableTrend: 0.31,
    variableTotal: 398_000,
    fixedPaid: 6,
    fixedCount: 8,
    daypart: 'night',
    horaActual: 22,
    diaLabel: 'DOMINGO 23 MAY',
    cycleAdjusted: false,
    paydayPending: false,
    paydayDaysOverdue: 0,
    projectionReliable: true,
    incomeConfigured: true,
    racha: 0,
    closedWinningDays: 6,
    closedDays: 17,
    savingsChip: {
      kind: 'consumed',
      label: 'Ahorro consumido · $0 de $80k',
      a11y: 'Ahorro consumido. Cero de 80 mil este ciclo',
      contribution: 0,
      target: 80_000,
    },
    extraIncome: 0,
  },
  {
    id: 'payday_overdue',
    label: 'Payday overdue',
    description: 'Cobró hace 3 días pero no confirmó · pulse warning',
    availableToday: 32_400,
    monthlyIncome: 620_000,
    cycleDay: 33,
    cycleTotalDays: 30,
    cycleMonth: 'mayo 2026',
    cycleStartLabel: '5 May',
    cycleEndLabel: '4 Jun',
    dailyBudget: 0,
    projectedClose: 32_400,
    projectedCloseTrend: null,
    variableTrend: 0.02,
    variableTotal: 422_700,
    fixedPaid: 8,
    fixedCount: 8,
    daypart: 'noon',
    horaActual: 12,
    diaLabel: 'LUNES 7 JUN',
    cycleAdjusted: false,
    paydayPending: true,
    paydayDaysOverdue: 3,
    projectionReliable: true,
    incomeConfigured: true,
    racha: 0,
    closedWinningDays: 18,
    closedDays: 30,
    savingsChip: null,
    extraIncome: 0,
  },
  {
    id: 'cycle_adjusted',
    label: 'Cycle adjusted',
    description: 'Saldo override este ciclo · cycleAdjusted = true',
    availableToday: 365_000,
    monthlyIncome: 620_000,
    cycleDay: 12,
    cycleTotalDays: 30,
    cycleMonth: 'mayo 2026',
    cycleStartLabel: '5 May',
    cycleEndLabel: '4 Jun',
    dailyBudget: 12_100,
    projectedClose: 8_400,
    projectedCloseTrend: 0.12,
    variableTrend: 0.14,
    variableTotal: 162_000,
    fixedPaid: 4,
    fixedCount: 8,
    daypart: 'morning',
    horaActual: 9,
    diaLabel: 'LUNES 17 MAY',
    cycleAdjusted: true,
    paydayPending: false,
    paydayDaysOverdue: 0,
    projectionReliable: true,
    incomeConfigured: true,
    racha: 2,
    closedWinningDays: 6,
    closedDays: 11,
    savingsChip: null,
    extraIncome: 45_000,
  },
  {
    id: 'setup',
    label: 'Setup (sin ingreso)',
    description: 'incomeConfigured = false · CTA setup en lugar del saldo',
    availableToday: 0,
    monthlyIncome: 0,
    cycleDay: 1,
    cycleTotalDays: 30,
    cycleMonth: 'mayo 2026',
    cycleStartLabel: '5 May',
    cycleEndLabel: '4 Jun',
    dailyBudget: 0,
    projectedClose: 0,
    projectedCloseTrend: null,
    variableTrend: null,
    variableTotal: 0,
    fixedPaid: 0,
    fixedCount: 0,
    daypart: 'morning',
    horaActual: 11,
    diaLabel: 'MARTES 5 MAY',
    cycleAdjusted: false,
    paydayPending: false,
    paydayDaysOverdue: 0,
    projectionReliable: false,
    incomeConfigured: false,
    racha: 0,
    closedWinningDays: 0,
    closedDays: 0,
    savingsChip: null,
    extraIncome: 0,
  },
]

void fmtRange
