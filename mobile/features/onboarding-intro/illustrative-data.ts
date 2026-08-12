import type { GastoRowProps } from '@/components/gastos/gasto-row'
import type { IncomeRowProps } from '@/components/gastos/income-row'
import type { HomeHeroMetrics } from '@/features/home/use-home-metrics'
import type { WeekClose } from '@/features/garden/garden-model'

/**
 * Datos ILUSTRATIVOS (estáticos) para el intro pre-auth. NO son datos reales
 * del usuario (todavía no hay cuenta) — alimentan los componentes REALES de la
 * app en su forma compacta, para que el intro refleje el producto de verdad y
 * no mockups. Los montos espejan el handoff de diseño (Onboarding Manifiesto).
 *
 * Tipados contra los tipos reales (`satisfies` / props de los componentes) para
 * que cualquier cambio de shape en los componentes rompa acá en tsc.
 */

// Slide 2 — HomeHeroCard: $412.500 disponible, cupo $13.700/día, proyección sana.
export const INTRO_HERO_METRICS: HomeHeroMetrics = {
  availableToday: 412_500,
  cycleDay: 10,
  cycleTotalDays: 30,
  cycleMonth: '10 jun → 10 jul',
  dailyBudget: 13_700,
  // Hogar con sueldo fijo y sin override: el cupo es el objetivo plano bruto,
  // así que la apertura del día ES el cupo.
  cupoNetsSpend: false,
  spentToday: 4_100,
  openingDailyBudget: 13_700,
  // Rama bruta: nadie lee el crudo, pero el tipo lo pide.
  discretionaryRaw: 0,
  projectedClose: 86_000,
  cycleAdjusted: false,
  paydayPending: false,
  paydayDaysOverdue: 0,
  projectionReliable: true,
  incomeConfigured: true,
  incomeMode: 'fixed',
  hasCycleIncome: false,
  cycleIncomeHydrating: false,
  monthlyIncome: 1_200_000,
  acumulado: null,
  monthlyReserveAmount: 0,
  cycleBalanceDiff: 0,
  fixedPendingReserved: 0,
}

// Slide 3 — FijosHeroCard: 1 fijo pendiente (Alquiler $150.000), pesa 32% del sueldo.
// Spread directo en <FijosHeroCard {...} /> → tsc valida contra sus props.
export const INTRO_FIJOS_PROPS = {
  mes: 'jun → jul',
  totalFijos: 150_000,
  montoPagado: 0,
  cantidadPagados: 0,
  cantidadPendientes: 1,
  cantidadVencidos: 0,
  dineroLibre: 412_500,
  porcentajeSueldo: 32,
  cycleDayIndex: 10,
  cycleDays: 30,
}

// Slide 3 — GastoRow: gasto del día (Mercado), componente real de Gastos.
export const INTRO_GASTO_PROPS: GastoRowProps = {
  title: 'Mercado',
  categoryName: 'Mercado',
  categoryRawName: 'Mercado',
  categoryColor: '#2E7D5B',
  whoName: 'Vos',
  whoColor: '#329315',
  amount: -4_500, // gasto = negativo
  time: '14:30',
}

// Slide 3 — IncomeRow: ingreso a favor +$80.000.
export const INTRO_INCOME_PROPS: IncomeRowProps = {
  title: 'Ingreso extra',
  kind: 'transfer',
  amount: 80_000,
  time: 'ayer',
}

// Slide 4 — Cierre de semana (preview): semana FLORECIENTE 7/7 → los 7 brotes
// en estado 'fern' con luciérnagas orbitando cada uno (la "floración" del cierre).
// Alimenta el WeekCloseCelebrationPreview con el mismo shape WeekClose que usa la
// celebración real. label/title/sub son datos del tipo pero el preview no los
// renderiza (usa el eyebrow + count localizados + el título/subtítulo del slide).
export const INTRO_WEEK_CLOSE: WeekClose = {
  score: 7,
  // La semana 7/7 es la `perfecta` del cierre rediseñado; el preview sólo
  // renderiza el conteo y los 7 brotes, pero el tipo pide la variante.
  variant: 'perfecta',
  stage: 'fern',
  bloom: true,
  label: 'Semana floreciente',
  title: 'Tu jardín floreció', // @i18n-ignore: valor del tipo WeekClose que el preview NO renderiza (ver comentario arriba)
  sub: 'Mantén el ritmo y cada semana cierra en flor.',
  days: [
    { letter: 'L', registered: true, recovered: false, calma: false },
    { letter: 'M', registered: true, recovered: false, calma: false },
    { letter: 'M', registered: true, recovered: false, calma: false },
    { letter: 'J', registered: true, recovered: false, calma: false },
    { letter: 'V', registered: true, recovered: false, calma: false },
    { letter: 'S', registered: true, recovered: false, calma: false },
    { letter: 'D', registered: true, recovered: false, calma: false },
  ],
}
