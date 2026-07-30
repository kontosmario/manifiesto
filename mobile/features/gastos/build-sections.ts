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
  /**
   * `true` cuando la paginación todavía tiene días MÁS VIEJOS sin cargar.
   * Con eso, los ingresos de días fuera de la ventana cargada NO abren una
   * sección propia (ver la nota en el cuerpo). Default `false` = feed
   * completo, se muestran todos (comportamiento histórico).
   */
  hasNextPage?: boolean
}

// Epoch ms at startOf the local-day para un instante cualquiera. Es la
// canonical bucketing key + sort key para que los month boundaries no bleedean
// (el viejo key era `day` 1–31 — mismo número para May 31 y "Jun 31
// no existe", y números más bajos en early June sorteaban POR DEBAJO
// de números altos en late May).
//
// TODA clave del `byDay` tiene que pasar por acá — gastos E ingresos. Es la
// invariante que rompía el bug de las secciones duplicadas: los gastos
// bucketeaban por MEDIANOCHE local y los ingresos por el valor crudo de
// `incomeHappenedAtMs`, que devuelve MEDIODÍA local (el truco anti off-by-one
// para fechas 'YYYY-MM-DD', ver gastos-helpers). Las dos claves difieren
// SIEMPRE en 43.200.000 ms exactos, así que `byDay.get()` no acertaba nunca:
// cada ingreso abría su propia sección aunque ese día tuviera gastos (y, al
// sortear desc, quedaba ARRIBA de la sección real del mismo día), y en modo
// "día tappeado" el filtro por igualdad daba vacío → el ingreso desaparecía.
//
// El fix vive acá y NO en `incomeHappenedAtMs`: ese helper también acota el
// ciclo (`neo-gastos-screen`, filtro de `cycleIncomeEvents`) y ahí el mediodía
// es lo correcto — aguanta los bordes del ciclo sin depender de la hora.
function dayMsFromMs(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Igual que `dayMsFromMs` pero desde un timestamp ISO completo (created_at). */
function dayMsFromIso(iso: string): number {
  return dayMsFromMs(new Date(iso).getTime())
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
  hasNextPage = false,
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
            // Normalizado al día local en AMBOS lados (ver `dayMsFromMs`): sin
            // esto la igualdad era imposible y el día tappeado nunca mostraba
            // sus ingresos.
            (i) => dayMsFromMs(incomeHappenedAtMs(i)) === selectedDateMs,
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
  // PISO DE LA VENTANA CARGADA — día más viejo que trajo la paginación.
  //
  // `cycleIncomeEvents` viene filtrado por CICLO, no por las páginas cargadas:
  // sin este piso, un ingreso de un día viejo (típico: el sueldo del día 1)
  // abría su propia sección y, como el sort final es por fecha desc, aterrizaba
  // al FONDO del feed — o sea "28 jul, 27 jul, 1 jul": un hueco de 25 días
  // dentro de lo que el usuario lee como una ventana continua. Con 7 días por
  // página el salto quedaba mayormente tapado; con 2 es casi seguro.
  //
  // Solo aplica a las secciones que el ingreso CREARÍA. Un ingreso que cae en
  // un día ya cargado se mergea siempre (está dentro de la ventana). Y cuando
  // ya no quedan páginas (`hasNextPage` false) el feed ES el ciclo entero:
  // ahí no hay piso y todos los ingresos se muestran.
  let windowFloorMs: number | null = null
  if (hasNextPage) {
    for (const ms of byDay.keys()) {
      if (ms > 0 && (windowFloorMs == null || ms < windowFloorMs)) windowFloorMs = ms
    }
  }
  for (const income of cycleIncomeEvents) {
    // Bucket by event_date (qué día sucedió el income), NO created_at
    // (cuándo se registró el row). Backdated incomes filan bajo el
    // día correcto. Normalizado a medianoche local — MISMA clave que los
    // gastos, que es lo que permite el merge (ver `dayMsFromMs`).
    const dateMs = dayMsFromMs(incomeHappenedAtMs(income))
    const d = new Date(dateMs)
    const existing = byDay.get(dateMs)
    if (existing) {
      existing.incomes.push(income)
    } else {
      // Día sin gastos pero con ingreso, MÁS VIEJO que la ventana cargada →
      // se omite hasta que la paginación llegue a ese día.
      if (windowFloorMs != null && dateMs < windowFloorMs) continue
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
