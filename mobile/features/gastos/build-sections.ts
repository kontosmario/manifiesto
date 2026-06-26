// Section builder del feed de Gastos. Toma los `groups` del controller +
// los `cycleIncomeEvents` filtrados y devuelve las `MovimientosSection[]`
// que la SectionList renderea. Extraído de `gastos-v2-screen.tsx` para
// quitar el useMemo gigante de la screen y poder testear la lógica de
// merge de día-con-solo-income, sort cronológico y bucketing por
// event_date sin renderer.
import type { IncomeEvent } from '@/features/income/use-income-events'
import type { GastosGroup } from './gastos-aggregates.model'
import {
  formatStandaloneIncomeDay,
  incomeHappenedAtMs,
  type MovementItem,
  type MovimientosSection,
} from './gastos-helpers'

interface BuildSectionsArgs {
  groups: GastosGroup[]
  cycleIncomeEvents: IncomeEvent[]
  selectedDay: number | null
}

// Epoch ms at startOf the local-day for the given ISO. Es la canonical
// bucketing key + sort key para que los month boundaries no bleedean
// (el viejo key era `day` 1–31 — mismo número para May 31 y "Jun 31
// no existe", y números más bajos en early June sorteaban POR DEBAJO
// de números altos en late May).
function dayMsFromIso(iso: string): number {
  const d = new Date(iso)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * Builds a section's `data` row list: incomes primero (sorted desc by
 * created_at — most recent at the top of the day), después expenses
 * (already sorted desc by the controller). Dentro de la SectionList
 * esto pone income como el "first thing that happened" anchor del día,
 * inmediatamente bajo el date header, con los expenses below. Mantiene
 * la chronological feel sin el inline-mixing que el owner pidió evitar.
 */
function buildSectionData(
  expenseRows: MovementItem[],
  incomes: IncomeEvent[],
): MovementItem[] {
  const incomeRows: MovementItem[] = incomes.map((i) => ({
    kind: 'income',
    iso: i.created_at,
    income: i,
  }))
  incomeRows.sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0))
  return [...incomeRows, ...expenseRows]
}

/**
 * Map controller groups → SectionList sections (audit §2.3 — list
 * virtualizada). Cada day = 1 section, sin movimientos = empty section
 * que no renderea rows. Aquí mezclamos income events del cycle dentro
 * del mismo bucket por día (sorted por created_at desc). Si un día
 * tiene SOLO income (sin expenses), creamos sección nueva. El income
 * NO afecta `total` (que es total de gastos).
 */
export function buildGastosSections({
  groups,
  cycleIncomeEvents,
  selectedDay,
}: BuildSectionsArgs): MovimientosSection[] {
  if (selectedDay != null) {
    // Modo "día tappeado": el controller ya filtró expenses a un solo
    // día. Para el merge de income usamos el dateMs del primer expense
    // del grupo (groups[0].items[0]) como anchor — así el filter de
    // income matchea EL MISMO DÍA REAL (mes + año), no sólo el día-
    // del-mes.
    const base = groups.map<MovimientosSection>((g) => ({
      title: g.label,
      day: g.day,
      dateMs:
        g.items.length > 0
          ? dayMsFromIso(g.items[0]!.created_at)
          : 0,
      total: g.total,
      data: g.items.map<MovementItem>((e) => ({
        kind: 'expense',
        iso: e.created_at,
        expense: e,
      })),
      incomes: [],
    }))
    const selectedDateMs = base[0]?.dateMs ?? null
    const dayIncomes =
      selectedDateMs != null
        ? cycleIncomeEvents.filter(
            (i) => incomeHappenedAtMs(i) === selectedDateMs,
          )
        : []
    if (base.length > 0 && dayIncomes.length > 0) {
      base[0]!.incomes = dayIncomes
      base[0]!.data = buildSectionData(base[0]!.data, dayIncomes)
    }
    return base
  }

  // Vista normal del cycle: incomes van COMO ROWS dentro del array
  // `data`, en el tope del día (antes de los expenses). Misma chrome
  // que un expense row, diferenciada por color + pill (ver `IncomeRow`).
  // El campo `incomes` se mantiene en la section por si en el futuro
  // queremos un summary, pero el render del feed los pasa por `data`.
  const byDay = new Map<number, MovimientosSection>()
  for (const g of groups) {
    const dateMs =
      g.items.length > 0 ? dayMsFromIso(g.items[0]!.created_at) : 0
    byDay.set(dateMs, {
      title: g.label,
      day: g.day,
      dateMs,
      total: g.total,
      data: g.items.map<MovementItem>((e) => ({
        kind: 'expense',
        iso: e.created_at,
        expense: e,
      })),
      incomes: [],
    })
  }
  for (const income of cycleIncomeEvents) {
    // Bucket by event_date (qué día sucedió el income), NO created_at
    // (cuándo se registró el row). Backdated incomes filan bajo el
    // día correcto.
    const dateMs = incomeHappenedAtMs(income)
    const d = new Date(dateMs)
    const existing = byDay.get(dateMs)
    if (existing) {
      existing.incomes.push(income)
    } else {
      // Día sin gastos pero con ingreso → sección nueva.
      byDay.set(dateMs, {
        title: formatStandaloneIncomeDay(d),
        day: d.getDate(),
        dateMs,
        total: 0,
        data: [],
        incomes: [income],
      })
    }
  }
  // Sort expense rows dentro del día desc + sort sections por actual
  // date desc — NOT por day-of-month integer (que sangraba cross May
  // → June). Después rebuild `data` para que incomes queden encima
  // de los expenses en cada section.
  const merged = Array.from(byDay.values())
  for (const s of merged) {
    s.data.sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0))
    s.incomes.sort((a, b) =>
      a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
    )
    s.data = buildSectionData(s.data, s.incomes)
  }
  merged.sort((a, b) => b.dateMs - a.dateMs)
  return merged
}
