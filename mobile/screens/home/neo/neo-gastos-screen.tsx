// mobile/screens/home/neo/neo-gastos-screen.tsx
//
// GASTOS neo del rediseño — CABLEADO a datos reales. FASES:
//   · F0 scaffold + F1 ciclo actual read-only (hero + calendario con días de
//     exceso + filtro + barras 7 días).
//   · F2 MOVIMIENTOS: lista real virtualizada (SectionList) con paginación,
//     ingresos intercalados y swipe-para-borrar — reemplaza el ScrollView
//     estático de 2 grupos del kit.
//   · F3 DETALLE DE DÍA + MUTACIONES: tocar un día del calendario re-escopa
//     la lista + abre el GastosDayDetail (gastado/movimientos del día, nav
//     ‹ › clampeada al ciclo, badge de exceso). CTAs cableados a los mismos
//     hooks de la vieja: marcar/revertir día sin-gastos (useMark/Unmark-
//     NoExpenseDay) y registrar gasto olvidado (add-expense back-dateado).
//     El HERO se mantiene a nivel ciclo (cycle* del controller).
//
// Presenta el kit de rediseño (`components/redesign/gastos/gastos-screen.tsx`,
// gate 'gastos':'pendiente') componiendo sus sub-componentes exportados con
// VMs derivadas del mismo `useGastosController` que alimenta la pantalla
// vigente (`screens/home/gastos-v2-screen.tsx`, que sigue LIVE hasta el swap
// de F6).
//
// GATE DE APROBACIÓN: 'gastos' está PENDIENTE (redesign-approval-status). Todo
// va en PREVIEW por la ruta dev (app/(app)/settings/dev/neo-gastos.tsx). La
// ruta live NO se toca.
//
// ESTRUCTURA (espejo del par outer/inner de neo-home + del gate de snapshot
// de gastos-v2-screen):
//   · `NeoGastosScreen` (outer) = shell. Sostiene <Screen scrollable={false}>
//     + el gate de MONTAJE `error → !snapshot.data → null → <Content/>`.
//     Calcula usePayCycle/useFamilyDashboard + cupoDiario canónico (la MISMA
//     derivación que el snapshot/warm — si difiere hay cache-miss y drift de
//     mood) y dispara `useGastosSnapshot` (RPC bundleada que seedea las 6
//     caches).
//   · `NeoGastosContent` (inner) = TODOS los hooks de datos (montan recién con
//     snapshot.data): controller + streak + no-spend marks + income + members
//     + delete mutations. Deriva las VMs. La lista de movimientos es una
//     SectionList: header/hero/calendario/filtro viven en el
//     `ListHeaderComponent` (evita virtualización anidada), los grupos-día son
//     las `sections`, cada fila es un `GastosMovRow` envuelto en `SwipeRow`.
//
// PREVIEW (prop `preview`, la pasa la ruta dev): la Gastos vieja sigue montada
// en la tab (freezeOnBlur:false → efectos vivos). En F6 desactivará
// realtime/telemetría/tour; en F2 el único side-effect es el swipe-delete, que
// se GATEA a NO-OP (no queremos borrar datos reales desde el preview dev, ni
// colisionar con la pantalla vieja aún montada sobre el mismo cache).
//
// Chrome del kit RETIRADO: no se usan HomeStatusBar/HomeNavBar/homeIndicator
// del kit; el canvas plano `s.bg` va vía <Screen> + insets reales, y la nav
// sigue siendo la tab bar del navigator.
//
// DECISIÓN OWNER (F1 · días de exceso): dayMoods `amber|red → 'bad'`
// (exceso, gasto > cupo diario), `green → 'ok'` (con gasto dentro de
// presupuesto, pintado), `empty`/sin-dato (pasado SIN gasto) → 'empty' (celda
// NEUTRA sin color, distinta de un día con gasto ok).
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type SectionListData,
} from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useFocusEffect, useIsFocused, useNavigation, useScrollToTop } from '@react-navigation/native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useScreenLifecycleLog } from '@/lib/dev/anim-log'
import { Screen, TAB_SCREEN_BOTTOM_CLEARANCE } from '@/components/ui/screen'
import { SCROLL_EDGE_THRESHOLD } from '@/components/ui/screen-edge-effect'
import { NeoStateBlock } from '@/components/ui/neo-state-block'
import { SwipeRow, type SwipeAction } from '@/components/ui/swipe-row'
import {
  CycleDropdown,
  GastosCalendar,
  GastosClosedBar,
  GastosDayDetail,
  type GastosBadgeTone,
  GastosFilter,
  GastosHeader,
  GastosHero,
  GastosMovDayHeader,
  GastosMovRow,
  GastosMovRowNote,
  GastosMovSectionHead,
  GastosMovements,
  GastosMovementsEmptyWell,
  GastosOverdueBanner,
  GastosSeeMore,
  type CalendarA11yStrings,
  type DayCell,
  type DayKind,
  type DropdownItemVM,
  type HeroCategory,
  type MovRowVM,
} from '@/components/redesign/gastos/gastos-screen'
import {
  GASTOS_RADII,
  GASTOS_SPEC,
  type GastosMode,
  type GastosSpec,
} from '@/components/redesign/gastos/gastos-spec'
import { RiseViewGate } from '@/components/home/animated/rise-view'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useThemeMode } from '@/theme/theme-provider'
import { categorySwatch } from '@/components/gastos/category-pastel'
import { EditGastoSheet } from '@/components/gastos/edit-gasto-sheet'
import { useGastosController } from '@/features/gastos/use-gastos-controller'
import {
  buildDayFocusTargets,
  dayFocusNavBounds,
  findDayFocusIndex,
  type DayFocusTarget,
} from '@/features/gastos/day-focus-sequence'
import {
  GASTOS_DAYS_PER_PAGE,
  useGastosExpensesForDay,
  useGastosExpensesPaginated,
} from '@/features/gastos/use-gastos-endpoints'
import { useGastosSnapshot } from '@/features/gastos/use-gastos-snapshot'
import { useGastosRealtime } from '@/features/gastos/use-gastos-realtime'
import { useGastosTelemetry } from '@/features/gastos/use-gastos-telemetry'
import { logScreenEvent } from '@/features/telemetry/log-screen-event'
import type { ScreenTelemetryHandle } from '@/features/telemetry/use-screen-telemetry'
import {
  GASTOS_TOUR,
  GASTOS_TOUR_STEPS,
  TourTarget,
  useRegisterTourScrollView,
  useScreenTour,
  useTour,
  type HighlightStyle,
} from '@/features/tours'
import { computeCupoDiario, resolveCupoIncomeBase } from '@/features/gastos/cupo-diario'
import { buildGastosSections } from '@/features/gastos/build-sections'
import {
  composeRowA11yLabel,
  getMondayFirstOffset,
  incomeHappenedAtMs,
  startOfLocalDay,
  type MovementItem,
  type MovimientosSection,
} from '@/features/gastos/gastos-helpers'
import {
  buildMovRowVM,
  type MovementRowMemberLite,
} from '@/features/gastos/build-mov-row-vm'
import {
  groupGastosByDay,
  type CategoryLite,
  type GastosDayMood,
} from '@/features/gastos/gastos-aggregates.model'
import {
  useCycleIncomeEventsTotal,
  useDeleteIncomeEvent,
  useIncomeEvents,
} from '@/features/income/use-income-events'
import {
  useDeleteExpense,
  useRecentExpenses,
  useUpdateExpense,
  type Expense,
} from '@/features/expenses/use-expenses'
import { loadExpenses } from '@/features/expenses/expense-repository'
import { expenseQueryKeys } from '@/features/expenses/expense-query-keys'
import { useFamilyMembers } from '@/features/family/use-family-members'
import { useMyFamilyRole } from '@/features/family/use-my-family-role'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
import { isPaydayPending } from '@/features/home/home-dashboard-model'
import { useMonthlyEditions } from '@/features/wrapped/use-monthly-editions'
import { monthlyEditionsQueryKey } from '@/features/wrapped/monthly-editions-query-keys'
import {
  normaliseCategoryBreakdown,
  type MonthlySummaryHistory,
} from '@/features/insights/control-v2-adapter'
import { computeCycleSurplusSigned } from '@/features/month-close/sobrante'
import { localizeCategoryNameByName } from '@/features/categories/localize-category-name'
import {
  deriveStreak,
  useMarkNoExpenseDay,
  useStreak,
  useUnmarkNoExpenseDay,
} from '@/features/streaks/use-streak'
import {
  deriveHomeBrotPose,
  type HomeBrotAtRiskLevel,
} from '@/features/home/derive-brot-pose'
import { useCycleConfirmation } from '@/features/home/use-cycle-confirmation'
import { useMonthCloseOrchestration } from '@/features/home/use-month-close-orchestration'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useIsAuthOverlayVisible } from '@/features/auth-flow/use-auth-flow'
import { HomeDashboardSheets } from '@/components/home/home-dashboard-sheets'
import { useFamilyDashboard, type FamilyDashboard } from '@/hooks/use-family-dashboard'
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { formatWeekdayDayMonth } from '@/utils/date-format'
import { triggerHaptic } from '@/lib/haptics'
import { confetti } from '@/lib/confetti-bus'
import { toast } from '@/lib/toast-bus'
import { formatLocalDateKey } from '@/utils/pay-cycle'
import { formatMoney, formatMoneyShort } from '@/utils/money'
import { getErrorMessage } from '@/utils/error-message'
import { nunitoFamily } from '@/theme/typography'

// Signo menos del kit (U+2212, no el guión ASCII) — matchea los montos del
// handoff (`−$61.200`) y el total de día (`−$73.700`).
const MINUS = '−'

// Throttle del onScroll para las superficies SIN tour activo. Solo aplica a los
// ScrollView PLANOS (vacío / ciclo cerrado): el feed es una SectionList y
// VirtualizedList pisa el prop con `?? 0.0001` porque necesita la Y por frame.
// Tiene que ser >=17ms para que Android throttlee de verdad
// (ReactScrollViewHelper.emitScrollEvent) y >16.6ms para que iOS New Arch no lo
// colapse a "cada frame" (RCTScrollViewComponentView).
// ─── Helpers puros locales ───────────────────────────────────────────

/** `YYYY-MM-DD` LOCAL — nunca `toISOString`, que corre el día ±1 según tz. */
function isoOf(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

interface BuildCellsParams {
  cycleStart: Date
  cycleDays: number
  today: Date
  firstWeekdayOffset: number
  /** Indexado por ISO — el día-de-mes NO es único en ventanas extendidas. */
  dayMoodsByIso: Record<string, GastosDayMood>
  noSpendMarkedDates: Set<string>
  selectedDay: number | null
  /** ISO del día seleccionado (desambigua el día-de-mes repetido). */
  selectedDayIso: string | null
  /** Fin NOMINAL del ciclo (exclusivo). Los días ≥ este son EXTENDIDO.
   *  `null`/igual al fin real ⇒ no hay extensión que marcar. */
  nominalEnd: Date | null
  /** Etiqueta de la celda de extendido (i18n, la resuelve el caller). */
  extCellSub: string
  /** Cuenta nueva / ciclo sin datos: la grilla del mes queda NEUTRA (todos
   *  los días pasados como 'fut' muted, sin brotes), igual que el vacío del
   *  kit. */
  empty: boolean
  /** v2 · CAL-4/EV2 — el ciclo recién arrancó: los días que todavía no llegaron
   *  se dibujan como MOLDE PUNTEADO ('none') en lugar del pozo apagado ('fut').
   *  La copy del strip se apoya en eso ("los punteados son días que todavía no
   *  llegaron"), así que las dos cosas viajan juntas. */
  freshCycle: boolean
}

/**
 * Deriva las celdas del calendario del rediseño desde el ciclo REAL
 * (cycleStart + cycleDays + firstWeekdayOffset) + dayMoods del server —
 * reemplaza el hardcode día-20/offset-5 del kit. Mapeo de estado (decisión
 * owner F1): today (client) → 'now'; futuro (cellDate > today) → 'fut';
 * `amber|red` → 'bad' (exceso); `green` → 'ok' (con gasto, dentro de
 * presupuesto, pintado); `empty`/sin-dato pasado → 'empty' (SIN gasto, celda
 * neutra sin color). La hojita (sprout) sale de `noSpendMarkedDates` (marcas del hogar
 * en el ciclo), NO del hardcode `n === 28`. Fechas Y-M-D LOCAL (nunca
 * toISOString — corre el día ±1 según tz).
 */
function buildNeoCells({
  cycleStart,
  cycleDays,
  today,
  firstWeekdayOffset,
  dayMoodsByIso,
  noSpendMarkedDates,
  selectedDay,
  selectedDayIso,
  nominalEnd,
  extCellSub,
  empty,
  freshCycle,
}: BuildCellsParams): DayCell[] {
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const todayMs = todayNorm.getTime()
  const cells: DayCell[] = []
  // Blanks de arranque para alinear el primer día a su columna (lun-first).
  for (let i = 0; i < firstWeekdayOffset; i++) {
    cells.push({ key: `b${i}`, blank: true })
  }
  for (let i = 0; i < cycleDays; i++) {
    const d = new Date(
      cycleStart.getFullYear(),
      cycleStart.getMonth(),
      cycleStart.getDate() + i,
    )
    const dayNum = d.getDate()
    const cellMs = d.getTime()
    const isToday = cellMs === todayMs
    const isFuture = cellMs > todayMs

    let kind: DayKind
    if (isToday) {
      kind = 'now'
    } else if (isFuture || empty) {
      // Futuro, o cuenta nueva → celda muted (sin color de gasto). v2: con el
      // ciclo recién arrancado los futuros van en molde punteado ('none'), que
      // promete lo que se va a pintar en vez de mostrar 30 pozos apagados.
      kind = freshCycle ? 'none' : 'fut'
    } else {
      // Por ISO, NO por día-de-mes: en una ventana extendida el mismo
      // número existe en dos meses y el lookup por número devolvía el mood
      // del otro mes (QA del owner 2026-08-13).
      const mood = dayMoodsByIso[isoOf(d)]
      // Decisión owner (F1): amber (ya > cupo) y red → 'bad' (exceso). green
      // (con gasto DENTRO de presupuesto) → 'ok' (pintado). 'empty' del RPC
      // (total del día = 0) o ausente (sin dato) → 'empty': día pasado SIN
      // gastos, celda NEUTRA sin color (distinta de un día CON gasto ok).
      if (mood === 'amber' || mood === 'red') kind = 'bad'
      else if (mood === 'green') kind = 'ok'
      else kind = 'empty'
    }

    const iso = isoOf(d)
    const marked = !empty && noSpendMarkedDates.has(iso)
    // Día de EXTENDIDO: cayó después del fin nominal del ciclo porque el
    // cobro no se confirmó. `nominalEnd` es exclusivo.
    const isExt = nominalEnd != null && cellMs >= nominalEnd.getTime()

    cells.push({
      key: `d${i}`,
      n: dayNum,
      label: String(dayNum),
      kind,
      iso,
      ext: isExt,
      // Mismo mecanismo que las celdas FUERA-DE-CICLO (`outCellSub`): una
      // etiqueta bajo el número. El `kind` NO se toca — un día de extendido
      // sigue siendo ok/bad/empty/now y sigue restando del saldo; lo que
      // cambia es que se sepa que entró de más.
      sub: isExt ? extCellSub : undefined,
      // La selección compara por ISO cuando se conoce: con la ventana
      // estirada, `selectedDay === dayNum` marcaba DOS celdas.
      selected:
        selectedDayIso != null ? selectedDayIso === iso : selectedDay === dayNum,
      sprout: marked,
      // La hojita gana sobre el punto de HOY cuando el día está marcado.
      hoyDot: isToday && !marked,
    })
  }
  return cells
}

// ─── Helpers de ediciones CERRADAS (F4, solo lectura) ────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000
/** v2 · "no hay dato" (día futuro, movimientos de una edición cerrada). NO es
 *  un cero: un 0 afirma que no se gastó, y acá lo que pasa es que no sabemos. */
const EM_DASH = '—'

/** Base numérica de las celdas FUERA-DE-CICLO. La celda `fuera` #i lleva
 *  `n = OUT_N_BASE + i` → nunca choca con los day-of-month reales (1..31) del
 *  calendario, así el `onSelectDay(n)` del kit distingue sin ambigüedad un día
 *  fuera de uno del ciclo (el índice mapea a `outWindow.days`). */
const OUT_N_BASE = 1000

/** Un destino navegable del day-detail (FIX 2). La secuencia y su clamp viven
 *  en `features/gastos/day-focus-sequence` (módulo puro, con tests). */
type FocusTarget = DayFocusTarget

/** Parsea 'YYYY-MM-DD' → Date LOCAL a medianoche (nunca `new Date(iso)`, que
 *  interpreta UTC y corre el día ±1 según tz). Devuelve null si no matchea. */
function parseIsoLocalDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** Y-M-D LOCAL de un Date (para keyear los daily_totals por fecha completa). */
function localIsoKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** Días de una edición cerrada = `[period_start, period_end)` (end exclusivo,
 *  como el rollup). Floor a 1 en fechas corruptas. */
function editionDayCount(edition: MonthlySummaryHistory): number {
  const start = parseIsoLocalDate(edition.period_start)
  const end = parseIsoLocalDate(edition.period_end)
  if (!start || !end) return 30
  const days = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY)
  return Number.isFinite(days) && days > 0 ? days : 30
}

/** Total gastado por FECHA COMPLETA (Y-M-D) de una edición cerrada, SOLO desde
 *  la forma array `[{day, total}]` que escribe `close_monthly_cycle` (day =
 *  `date(created_at)::text` = ISO completo). La forma legacy `Record<>` no
 *  guarda la fecha de forma confiable → mapa vacío (degradación honesta: la
 *  grilla queda neutra en vez de inventar días).
 *
 *  tz de `daily_totals`: desde 20260722174332_rollup_daily_totals_local_tz_ar
 *  el rollup bucketea por fecha LOCAL (America/Argentina/Buenos_Aires, misma
 *  ancla que cycle_disponible) — antes usaba `date(created_at)` en UTC y corría
 *  los gastos nocturnos al día siguiente. Los cierres NUEVOS ya vienen bien.
 *  CAVEAT residual (menor): los monthly_summaries cerrados ANTES de ese fix
 *  quedaron con su intensidad en UTC (el resumen persiste solo la fecha
 *  agregada, no los timestamps → no se puede recalcular la fecha local en
 *  cliente); su calendario de intensidad puede correr ±1 día para gastos
 *  nocturnos. Total, categorías y chip son siempre correctos (agregan sin
 *  fecha), en ediciones viejas y nuevas. */
function parseDailyTotalsByIso(
  raw: MonthlySummaryHistory['daily_totals'],
): Map<string, number> {
  const out = new Map<string, number>()
  if (!Array.isArray(raw)) return out
  for (const entry of raw) {
    const iso = typeof entry.day === 'string' ? entry.day.slice(0, 10) : null
    if (!iso) continue
    const total = Number(entry.total ?? 0)
    if (Number.isFinite(total)) out.set(iso, (out.get(iso) ?? 0) + total)
  }
  return out
}

/**
 * Celdas del calendario de una edición CERRADA (solo lectura). Sin `mood` ni
 * cupo histórico persistido, la grilla NO puede pintar exceso fiel — degrada
 * honesto a "intensidad por presencia": día CON gasto → celda llena ('ok', el
 * pozo neutro del sistema, sin juicio de presupuesto); día SIN gasto → celda
 * muted ('fut'). Nada de today/futuro/fuera/exceso/brote (conceptos vivos que
 * no aplican a un ciclo cerrado). Si no hay datos por-día (forma legacy),
 * TODOS quedan muted → calendario neutro. Grilla derivada de la ventana real
 * `[period_start, period_end)`, fechas Y-M-D LOCAL.
 */
function buildClosedCells(edition: MonthlySummaryHistory): DayCell[] {
  const start = parseIsoLocalDate(edition.period_start)
  if (!start) return []
  const days = editionDayCount(edition)
  const offset = getMondayFirstOffset(start)
  const spendByIso = parseDailyTotalsByIso(edition.daily_totals)
  const cells: DayCell[] = []
  for (let i = 0; i < offset; i++) cells.push({ key: `b${i}`, blank: true })
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const total = spendByIso.get(localIsoKey(d)) ?? 0
    cells.push({
      key: `d${i}`,
      n: d.getDate(),
      iso: localIsoKey(d),
      label: String(d.getDate()),
      // 'empty', no 'fut': el mes YA cerró, así que un día en cero no es un
      // día "que todavía no llegó" — la grilla de una edición cerrada se
      // llenaba de pozos de futuro sobre días que ya pasaron.
      //
      // [OWNER-CAL3] El handoff pinta CAL-3 con DOS estados, bien y exceso.
      // El exceso no es derivable acá: `daily_totals` persiste el total del
      // día pero NO el cupo vigente de ese ciclo, así que no hay contra qué
      // compararlo. Se degrada a bien/vacío en vez de inventar un umbral.
      kind: total > 0 ? 'ok' : 'empty',
    })
  }
  return cells
}

/**
 * v2 · DS-6 — metadata por día de una edición cerrada, indexada por ISO.
 *
 * Estaba indexada por día-de-mes con el supuesto de que "dentro de un ciclo
 * (≤31 días) el día del mes NO se repite". Ese supuesto MURIÓ con el modelo
 * extendido: `close_monthly_cycle` archiva la ventana ESTIRADA tal cual
 * (`period_end` = la fecha de confirmación, no el payday), así que una
 * edición cerrada puede durar más de un mes y volver a tener dos días con el
 * mismo número. Con clave por número, el segundo pisaba al primero.
 *
 * Solo TOTAL: `daily_totals` persiste `[{day,total}]` y no guarda el conteo de
 * movimientos ni el detalle fila-por-fila, así que el detalle de un día cerrado
 * muestra `MOVIMIENTOS —`. Mismo criterio de degradación honesta que
 * `buildClosedCells` (que tampoco inventa exceso sin cupo histórico).
 */
function buildClosedDayMeta(
  edition: MonthlySummaryHistory,
): Map<string, { date: Date; total: number }> {
  const out = new Map<string, { date: Date; total: number }>()
  const start = parseIsoLocalDate(edition.period_start)
  if (!start) return out
  const days = editionDayCount(edition)
  const spendByIso = parseDailyTotalsByIso(edition.daily_totals)
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const iso = localIsoKey(d)
    out.set(iso, { date: d, total: spendByIso.get(iso) ?? 0 })
  }
  return out
}

/** Barras "ÚLTIMOS 7 DÍAS" de una edición cerrada = los 7 últimos días de la
 *  ventana, normalizados [0,1] por su propio pico (mismo contrato que
 *  `recentDailyBars` del hero vivo). Días sin gasto = 0. Sin datos por-día →
 *  7 ceros (barras planas al mínimo, sin inventar el fallback demo). */
function buildClosedRecentBars(edition: MonthlySummaryHistory): number[] {
  const start = parseIsoLocalDate(edition.period_start)
  if (!start) return [0, 0, 0, 0, 0, 0, 0]
  const days = editionDayCount(edition)
  const spendByIso = parseDailyTotalsByIso(edition.daily_totals)
  const totals: number[] = []
  for (let i = Math.max(0, days - 7); i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    totals.push(spendByIso.get(localIsoKey(d)) ?? 0)
  }
  while (totals.length < 7) totals.unshift(0)
  const max = Math.max(...totals)
  if (max <= 0) return totals.map(() => 0)
  return totals.map((v) => v / max)
}

// ─── Outer shell ─────────────────────────────────────────────────────

interface NeoGastosScreenProps {
  userId: string
  familyId: string
  /** `true` desde la ruta dev de preview (app/(app)/settings/dev/
   *  neo-gastos.tsx). Gatea el swipe-delete a NO-OP (F2) y, en F6,
   *  realtime/telemetría/tour que colisionan con la Gastos vieja live. */
  preview?: boolean
}

export function NeoGastosScreen({ userId, familyId, preview = false }: NeoGastosScreenProps) {
  useScreenLifecycleLog(preview ? 'Gastos·Neo·preview' : 'Gastos·Neo')
  const { t } = useTranslation()
  const mode = useThemeMode().resolvedMode as GastosMode
  const s = GASTOS_SPEC[mode]

  // Telemetría de sesión (opened/closed/dwell/left_without_tap/reopened),
  // MISMA que la Gastos vieja (useGastosTelemetry → useScreenTelemetry scope
  // 'gastos'). En preview NO emite (familyId undefined): no contamina métricas
  // desde la ruta dev ni colisiona con la vieja live montada en paralelo
  // (freezeOnBlur:false → ambas montadas sobre el mismo scope). Vive en el
  // OUTER para cubrir todo el dwell (incl. el skeleton, antes de snapshot.data).
  const telemetry = useGastosTelemetry(preview ? undefined : familyId)

  // usePayCycle/useFamilyDashboard no firen red: sus deps (family_finance,
  // fixed_expenses, expenses) ya están seeded por home_snapshot.
  // `isSalaryPendingConfirmation` = fuente ÚNICA del ciclo VENCIDO (misma que
  // usa la Home: el ciclo terminó pasando el payday y el cobro sigue sin
  // confirmar → freeze). NO una heurística nueva de Gastos.
  const { cycle, today, isSalaryPendingConfirmation } = usePayCycle(familyId)
  const dashboard = useFamilyDashboard(familyId)

  // Confirmación del ciclo — MISMO hook que la Home neo (mutación de upsert de
  // family_finance + estado de error + hápticos). NO se reimplementa el
  // confirm en Gastos. La orquestación del cierre (wrapped) vive en el inner.
  const { confirmCycleStartingBalance, salaryErrorMessage, isSavingSalary } =
    useCycleConfirmation({ dashboard, familyId, userId, t })

  // Cupo diario canónico — DEBE derivarse igual que el snapshot/warm o hay
  // cache-miss y drift de mood (misma derivación que gastos-v2-screen; el
  // cambio va en resolveCupoIncomeBase, no acá). Base dinámica = ingresos del
  // ciclo + override.
  const cupoIncomeQuery = useCycleIncomeEventsTotal(
    familyId,
    formatLocalDateKey(dashboard.monthlyAccounting.start),
    formatLocalDateKey(dashboard.monthlyAccounting.end),
  )
  const cupoDiario = useMemo(
    () =>
      computeCupoDiario({
        monthlyIncome: resolveCupoIncomeBase({
          incomeMode: dashboard.incomeMode,
          monthlyIncome: dashboard.monthlyIncome,
          cycleIncomeTotal: cupoIncomeQuery.data ?? 0,
          cycleStartingBalanceOverride: dashboard.cycleStartingBalanceOverride,
        }),
        fixedExpensesMonthlyTotal: dashboard.fixedExpensesMonthlyTotal,
        savingsGoal: dashboard.savingsGoal,
        cycleDays: cycle.days,
      }),
    [
      dashboard.incomeMode,
      dashboard.monthlyIncome,
      dashboard.cycleStartingBalanceOverride,
      cupoIncomeQuery.data,
      dashboard.fixedExpensesMonthlyTotal,
      dashboard.savingsGoal,
      cycle.days,
    ],
  )

  /**
   * En INGRESO DINÁMICO la base del cupo sale de una query aparte
   * (`cupoIncomeQuery`), y `cupoDiario` es parte de la queryKey del snapshot:
   * sin este gate el primer render armaba la key con base 0 y disparaba un
   * `gastos_snapshot` que nadie iba a leer, y al resolver la query cambiaba el
   * cupo → key nueva → segundo RPC. El warm-prefetch de Home tiene el gate
   * exacto desde el review del 2026-07-08 ("sin este gate el warm disparaba DOS
   * gastos_snapshot por cold start") y la pantalla se lo había perdido.
   *
   * En modo FIJO no se gatea: ahí `resolveCupoIncomeBase` ignora esta query, así
   * que esperarla sería sumarle su latencia al primer paint a cambio de nada.
   * Con la query deshabilitada `isLoading` es false en RQ v5, así que el gate
   * abre igual (mismo razonamiento que el gate de Fijos).
   */
  const cupoReady = dashboard.incomeMode !== 'dynamic' || !cupoIncomeQuery.isLoading

  const snapshot = useGastosSnapshot({
    familyId,
    userId,
    cycleStart: cycle.start,
    cycleEnd: cycle.end,
    today,
    cupoDiario,
    ready: cupoReady,
    // MISMO valor que el infinite query del controller y que el warm-prefetch
    // de Home: el queryKey del snapshot NO incluye daysPerPage, así que un
    // mismatch se cobra como cache-hit silencioso (ver GASTOS_DAYS_PER_PAGE).
    daysPerPage: GASTOS_DAYS_PER_PAGE,
  })

  // REDUCED-MOTION DE VERDAD PARA LOS RiseView (a11y + perf).
  //
  // `RiseView` gatea su Keyframe con `ReduceMotion.System`, o sea SOLO el toggle
  // del sistema operativo. El `useReducedMotion()` del proyecto es más ancho:
  // incluye el heurístico de hardware (`deviceYearClass < 2020` colapsa a
  // reduced, ver reduced-motion-provider). En el caso TÍPICO de gama baja —
  // Android viejo SIN el toggle del SO — toda la app apagaba sus animaciones y
  // los 6 RiseView de esta pantalla igual disparaban su Keyframe, justo en el
  // commit más caro (el montaje con hero + calendario + primeras filas).
  //
  // Se usa el `RiseViewGate` que ya existe para exactamente este caso (gate por
  // contexto, quirúrgico) en vez de tocar `RiseView` para toda la app: ese
  // cambio es correcto pero cambia el arranque de Home/Fijos/Auth y necesita su
  // propia validación. Envuelve TODAS las ramas (skeleton, feed, vacío, cerrado)
  // porque el provider no dibuja nada — es transparente al layout.
  const reduceMotion = useReducedMotion()
  // Scroll edge effect · el estado vive ACÁ (el shell) y el overlay lo
  // monta el <Screen>, así cubre TODAS las ramas de render del content
  // (feed, ciclo vacío, ciclo cerrado) — antes vivía dentro del árbol
  // del feed y las ramas vacías retornaban antes de montarlo.
  const [edgeActive, setEdgeActive] = useState(false)
  // El inferior arranca en true: la lista de movimientos desborda desde
  // el primer render y su `onScroll` no dispara en el montaje, así que
  // esperar al primer gesto dejaría la franja sin material justo en la
  // pantalla donde más se nota. Las ramas sin contenido lo apagan en su
  // primer layout.
  const [bottomEdgeActive, setBottomEdgeActive] = useState(true)

  return (
    <Screen
      backgroundColor={s.bg}
      bottomEdgeActive={bottomEdgeActive}
      contentContainerStyle={styles.screenBody}
      edgeActive={edgeActive}
      ownInsets
      scrollable={false}
    >
      <RiseViewGate skip={reduceMotion}>
      {snapshot.error && !snapshot.data ? (
        <View style={styles.errorWrap}>
          <NeoStateBlock
            icon="error-outline"
            description={getErrorMessage(snapshot.error, t('states:error.server'))}
            title={t('gastos:errors.loadTitle')}
            actionLabel={t('states:errorState.action')}
            tone="error"
            onAction={() => {
              void snapshot.refetch()
            }}
          />
        </View>
      ) : !snapshot.data ? (
        // Gate de MONTAJE (snapshot pending): los hooks de datos viven en el
        // inner, así que no montan hasta que gastos_snapshot pobló las caches.
        // Mientras tanto, un SKELETON neumórfico estable (mismo layout: hero +
        // calendario + filas) — NO `null`: el tab de Gastos NO renderea del
        // home_snapshot warm como el resto, así que sin skeleton el primer
        // frame era ~400ms de canvas en blanco (el "salto" que la vieja ya
        // resolvía con su GastosScreenSkeleton). La estructura matchea el
        // contenido real para que el swap no parpadee.
        <NeoGastosSkeleton mode={mode} label={t('states:loading.expenses')} />
      ) : (
        <NeoGastosContent
          onEdgeActiveChange={setEdgeActive}
          onBottomEdgeActiveChange={setBottomEdgeActive}
          userId={userId}
          familyId={familyId}
          mode={mode}
          preview={preview}
          dashboard={dashboard}
          isSalaryPendingConfirmation={isSalaryPendingConfirmation}
          confirmCycleStartingBalance={confirmCycleStartingBalance}
          salaryErrorMessage={salaryErrorMessage}
          isSavingSalary={isSavingSalary}
          telemetry={telemetry}
        />
      )}
      </RiseViewGate>
    </Screen>
  )
}

// ─── Skeleton neumórfico (snapshot pending) ──────────────────────────

/**
 * Placeholder mientras `gastos_snapshot` resuelve. Pozos/tarjetas neumórficos
 * con los MISMOS tokens del kit (bg / sombras raise·ins / radii) y el layout
 * del contenido real (header · hero · calendario · filtro · filas) para que el
 * swap skeleton→datos no genere layout-shift ni parpadeo. Sin texto: solo un
 * a11y label de "cargando" para lectores de pantalla.
 */
function NeoGastosSkeleton({ mode, label }: { mode: GastosMode; label: string }) {
  const s = GASTOS_SPEC[mode]
  return (
    <View
      style={styles.skeletonStack}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <View style={styles.skelHeaderRow}>
        {/* Columna izquierda = título (lineHeight 40) + trigger de ciclo
            (marginTop 6 + 18) del `GastosHeader` real: sin la placa del título
            el header medía 46 y el feed saltaba 18pt al resolver. */}
        <View>
          <View style={styles.skelTitleSlot}>
            <View style={[styles.skelTitle, { backgroundColor: s.bg, boxShadow: s.ins }]} />
          </View>
          <View style={[styles.skelCyclePill, { backgroundColor: s.bg, boxShadow: s.ins }]} />
        </View>
        <View
          style={[
            styles.skelBrot,
            { backgroundColor: s.brotBtnBackground, boxShadow: s.brotBtnShadow },
          ]}
        />
      </View>
      <View
        style={[styles.skelHero, { backgroundColor: s.cardBackground, boxShadow: s.raise }]}
      />
      <View
        style={[
          styles.skelCalendar,
          { backgroundColor: s.calBackground, boxShadow: s.calShadow },
        ]}
      />
      <View style={styles.skelFilterRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.skelChip, { backgroundColor: s.bg, boxShadow: s.ins }]} />
        ))}
      </View>
      <View style={styles.skelRows}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.skelRow,
              { backgroundColor: s.movRowBackground, boxShadow: s.movRowShadow },
            ]}
          />
        ))}
      </View>
    </View>
  )
}

// ─── Tour de Gastos (paridad con la vieja, gateado en preview) ───────

type TourScrollHandlers = {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  onContentSizeChange: (width: number, height: number) => void
}

/**
 * Registra la superficie de scroll (la SectionList) al GASTOS_TOUR para que el
 * host auto-scrollee cada paso a la vista. Componente aparte para poder
 * GATEARLO en preview (hook rules): en la ruta dev la Gastos vieja sigue
 * montada y comparte la key GASTOS_TOUR en el registro de scroll (module-level)
 * → registrar dos veces la clobbearía. Reporta los handlers vía ref (patrón de
 * neo-home `HomeTourScrollBinding`) para no re-renderear el content. El
 * `measureRef` (View flex:1 que envuelve la lista) es el nodo medible: la
 * SectionList no expone `measureInWindow` confiable entre versiones de RN.
 */
function GastosTourScrollBinding({
  scrollRef,
  measureRef,
  bindingRef,
}: {
  scrollRef: RefObject<SectionList<MovementItem, MovimientosSection> | null>
  measureRef: RefObject<View | null>
  bindingRef: MutableRefObject<TourScrollHandlers | null>
}) {
  const handlers = useRegisterTourScrollView(GASTOS_TOUR, scrollRef, { measureRef })
  bindingRef.current = handlers
  return null
}

/**
 * PERF · aísla la suscripción al contexto del tour.
 *
 * El `onScroll` del tour (ver `handleTourScroll`) solo tiene sentido MIENTRAS
 * el tour corre — el resto del tiempo despacharía un callback JS por frame de
 * TODO scroll para nada. Para gatearlo hace falta saber si `GASTOS_TOUR` está
 * activo, pero `useTour()` devuelve un value que cambia de identidad en cada
 * `registerStep`/`unregisterStep` (`measureToken`) y en cada paso
 * (`activeIndex`): consumirlo desde `NeoGastosContent` re-renderearía la
 * pantalla ENTERA en cada uno de esos eventos (montaje de los 5 TourTarget,
 * toggle calendario↔day-detail, cada "Siguiente" del tour).
 *
 * Este componente null-render es el ÚNICO suscripto: absorbe esos re-renders y
 * solo empuja al parent el BOOLEANO derivado, que cambia 2 veces por sesión
 * (arranca / termina el tour). Mismo criterio que `GastosTourScrollBinding`
 * (reportar por ref/callback en vez de renderear el content).
 */
function GastosTourActiveGate({
  onChange,
}: {
  onChange: (active: boolean) => void
}) {
  const { activeTour } = useTour()
  const active = activeTour === GASTOS_TOUR
  useEffect(() => {
    onChange(active)
  }, [active, onChange])
  return null
}

/**
 * TourTarget gateado: en preview rinde SOLO los children (sin registrar el
 * paso, que clobbearía los registros de la Gastos vieja live por (tour,order)
 * y los borraría al desmontar la ruta dev). En live envuelve el sub-componente
 * del kit en el TourTarget (el kit no expone refs por elemento, así que el
 * paso resalta el componente entero — mismo criterio que neo-home).
 */
function GastosTourStep({
  preview,
  order,
  text,
  highlight,
  children,
}: {
  preview: boolean
  order: number
  text: string
  highlight?: HighlightStyle
  children: ReactNode
}) {
  if (preview) return <>{children}</>
  return (
    <TourTarget tour={GASTOS_TOUR} order={order} text={text} highlight={highlight}>
      {children}
    </TourTarget>
  )
}

// ─── Inner content ───────────────────────────────────────────────────

interface NeoGastosContentProps {
  userId: string
  familyId: string
  mode: GastosMode
  preview: boolean
  /** Reporta al shell si hay contenido pasando por debajo del safe area
   *  superior (el shell se lo pasa al `Screen`, que monta el material). */
  onEdgeActiveChange: (active: boolean) => void
  /** Ídem para el safe area INFERIOR: true mientras quede recorrido de
   *  lista por debajo del viewport. */
  onBottomEdgeActiveChange: (active: boolean) => void
  /** Dashboard del hogar (mismo objeto que computa el outer) — lo consumen la
   *  orquestación del cierre y las sheets de confirmación (F5). */
  dashboard: FamilyDashboard
  /** Ciclo VENCIDO (cobro sin confirmar) — fuente única compartida con la Home
   *  (usePayCycle). Gatea el banner + las celdas fuera-de-ciclo. */
  isSalaryPendingConfirmation: boolean
  /** Confirmación del ciclo — MISMO hook que la Home (useCycleConfirmation). */
  confirmCycleStartingBalance: (startingBalance: number | null) => void
  salaryErrorMessage: string | null
  isSavingSalary: boolean
  /** Telemetría de sesión (creada en el outer, cubre el dwell completo). El
   *  content la consume para el trackTap de elementos. En preview el outer la
   *  crea con familyId undefined → sessionId presente pero sin emisión. */
  telemetry: ScreenTelemetryHandle
}

interface MovementRowProps {
  item: MovementItem
  mode: GastosMode
  s: GastosSpec
  categoriesById: Map<string, CategoryLite>
  memberById: Map<string, MovementRowMemberLite>
  t: ReturnType<typeof useTranslation>['t']
  /** Solo `true` para la fila cuyo borrado está en vuelo. Es el ÚNICO prop que
   *  cambia durante scroll normal → con React.memo solo re-renderiza esa fila,
   *  no las ~60-70 montadas (FIX 4). */
  isDeleting: boolean
  onDeleteExpense: (id: string) => void
  onDeleteIncome: (id: string) => void
  /** Edición del gasto EN el feed (long-press de la fila). Los ingresos no la
   *  reciben: su escritura vive en su propio alta. */
  onEditExpense: (expense: Expense) => void
  /** v2 · M-3 — nota bajo la fila cuando el movimiento quedó FUERA del ciclo.
   *  Sale de `t()` en la pantalla (el kit es `@i18n-ignore-file`) y solo la
   *  reciben las filas del feed con un día fuera en foco. */
  outNote?: string
}

/**
 * Fila del feed (FIX 4). `React.memo` con props ESTABLES (item viene de las
 * `sections` memoizadas; mode/s/mapas/t/handlers estables): cuando la pantalla
 * re-renderiza (paginación, cambio de foco, header) las filas montadas NO se
 * reconcilian salvo que su `item`/`isDeleting` cambie. Antes cada fila (SwipeRow
 * = GestureDetector RNGH + wrapper con boxShadow neumórfico caro en iOS Fabric)
 * se reconciliaba en cada render de la pantalla. El VM/a11y/actions se arman
 * ADENTRO para no pasar closures nuevos por prop (romperían la memo).
 */
const MovementRow = memo(function MovementRow({
  item,
  mode,
  s,
  categoriesById,
  memberById,
  t,
  isDeleting,
  onDeleteExpense,
  onDeleteIncome,
  onEditExpense,
  outNote,
}: MovementRowProps) {
  // FIX E (perf) · `onDelete` y `actions` ERAN literales nuevos en cada render.
  // Aunque la memo de la fila bailara out casi siempre, cuando NO lo hacía
  // (borrado en vuelo, cambio de `t`, día en foco) el array `rightActions`
  // cambiaba de identidad → `SwipeActionsPanel` se reconciliaba y su
  // `RectButton` volvía a cruzar a nativo. Estabilizados con hooks, la única
  // razón para reconciliar el panel es que cambie de verdad la acción.
  const isExpense = item.kind === 'expense'
  const rowId = isExpense ? item.expense.id : item.income.id
  const onDelete = useCallback(() => {
    if (isExpense) onDeleteExpense(rowId)
    else onDeleteIncome(rowId)
  }, [isExpense, rowId, onDeleteExpense, onDeleteIncome])

  const actions = useMemo<SwipeAction[]>(
    () => [
      {
        label: t('common:actions.delete'),
        tone: 'danger',
        icon: 'delete',
        onPress: onDelete,
      },
    ],
    [t, onDelete],
  )
  // El long-press abre la edición del gasto sin sacar al usuario del feed. No
  // compite con el swipe (el pan pide 10px de desplazamiento para activarse) ni
  // con el tap, que en esta fila no tiene acción.
  const onEdit = useCallback(() => {
    if (item.kind !== 'expense') return
    onEditExpense(item.expense)
  }, [item, onEditExpense])
  const a11yActions = useMemo(
    () =>
      isExpense
        ? [
            { name: 'edit', label: t('common:actions.edit') },
            { name: 'delete', label: t('common:actions.delete') },
          ]
        : [{ name: 'delete', label: t('common:actions.delete') }],
    [isExpense, t],
  )
  const handleA11yAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      if (event.nativeEvent.actionName === 'delete') onDelete()
      else if (event.nativeEvent.actionName === 'edit') onEdit()
    },
    [onDelete, onEdit],
  )

  // El armado del VM (emoji/tile/title/sub/amount/catName) vive en
  // `buildMovRowVM` (compartido con el feed de solo lectura de una edición
  // cerrada) — acá solo queda el a11yLabel, que es interactivo y no aplica
  // a esa vista de sólo lectura.
  const row: MovRowVM = buildMovRowVM({ item, categoriesById, memberById, t })
  let a11yLabel: string

  if (item.kind === 'expense') {
    const e = item.expense
    const cat = categoriesById.get(e.category_id)
    const who = memberById.get(e.created_by)
    const whoName = who?.name || t('gastos:movementRow.someone')
    const catLabel = cat?.name || t('gastos:movementRow.noCategory')
    a11yLabel = composeRowA11yLabel({
      title: e.description || cat?.name || t('common:terms.expense'),
      categoryName: catLabel,
      whoName,
      amount: Math.abs(Number(e.price ?? 0)),
      iso: e.created_at,
    })
  } else {
    a11yLabel = t('gastos:movementRow.incomeA11yLabel', { title: row.title })
  }

  // Wrapper (SIN overflow) que lleva la sombra neumórfica + la separación
  // vertical entre filas (marginTop): el SwipeRow tiene overflow:hidden y
  // cliparía la sombra. La fila va `flat` (sin sombra propia) — mismo patrón
  // que la actividad de la Home neo. FIX D: se eliminó el View `rowWrap`
  // externo (solo aportaba paddingTop:10) → un nodo nativo menos por fila.
  const card = (
    <View
      style={[
        styles.rowShadowWrap,
        { backgroundColor: s.movRowBackground, boxShadow: s.movRowShadow },
      ]}
    >
      <SwipeRow
        accessibilityLabel={a11yLabel}
        accessibilityHint={
          isExpense
            ? t('gastos:movementRow.editOrDeleteHint')
            : t('gastos:movementRow.swipeToDeleteHint')
        }
        accessibilityActions={a11yActions}
        onAccessibilityAction={handleA11yAction}
        rightActions={actions}
        isProcessing={isDeleting}
        borderRadius={GASTOS_RADII.row}
        skin="neo"
      >
        {/* `accessible={false}`: el nodo que lee el lector sigue siendo el
            SwipeRow (con su label compuesto y sus acciones); este Pressable
            sólo agrega el gesto. Sin gasto no se monta — un ingreso no se
            edita desde acá. */}
        {isExpense ? (
          <Pressable accessible={false} onLongPress={onEdit}>
            <GastosMovRow mode={mode} row={row} flat />
          </Pressable>
        ) : (
          <GastosMovRow mode={mode} row={row} flat />
        )}
      </SwipeRow>
    </View>
  )
  // La nota M-3 va FUERA de la tarjeta: adentro la clipa el overflow del
  // SwipeRow. Sin nota se devuelve la tarjeta pelada (un nodo menos por fila,
  // que es el caso común).
  if (!outNote) return card
  return (
    <View>
      {card}
      <GastosMovRowNote mode={mode} note={outNote} />
    </View>
  )
}, areMovementRowPropsEqual)

/**
 * Comparador EXPLÍCITO de `MovementRow` (FIX E, perf).
 *
 * La memo shallow por defecto comparaba `item` por IDENTIDAD, y esa identidad
 * NO sobrevive a un refetch: `useGastosController` mapea `rowToExpense` sobre
 * TODAS las páginas acumuladas en cada render con data nueva
 * (use-gastos-controller.ts), y `buildGastosSections` envuelve cada uno en un
 * `{kind, iso, expense}` fresco (build-sections.ts). O sea: cada invalidación
 * (mutación propia, eco de realtime del partner, pull-to-refresh) y cada página
 * nueva producían ~105 objetos nuevos → CERO bail-outs, y con ellos ~105
 * SwipeRow + boxShadow neumórficos reconciliados de golpe. Ese era el costo que
 * escalaba con `n` y el que hacía sentir cara la paginación.
 *
 * Comparamos por CONTENIDO los campos que la fila realmente dibuja. El resto de
 * los props ya son ref-estables por construcción (mapas memoizados, handlers por
 * ref, spec por modo), así que basta con `Object.is` sobre ellos.
 */
function areMovementRowPropsEqual(
  prev: MovementRowProps,
  next: MovementRowProps,
): boolean {
  if (
    prev.isDeleting !== next.isDeleting ||
    prev.mode !== next.mode ||
    prev.s !== next.s ||
    prev.t !== next.t ||
    prev.categoriesById !== next.categoriesById ||
    prev.memberById !== next.memberById ||
    prev.onDeleteExpense !== next.onDeleteExpense ||
    prev.onDeleteIncome !== next.onDeleteIncome ||
    prev.onEditExpense !== next.onEditExpense ||
    // v2 · M-3 — sin esto la nota "queda fuera del ciclo" quedaría pegada (o
    // ausente) al entrar/salir del foco de un día fuera: la memo compara por
    // contenido y `outNote` no aparecía en ningún lado.
    prev.outNote !== next.outNote
  ) {
    return false
  }
  const a = prev.item
  const b = next.item
  if (a === b) return true
  if (a.kind === 'expense' && b.kind === 'expense') {
    const x = a.expense
    const y = b.expense
    return (
      x.id === y.id &&
      x.price === y.price &&
      x.description === y.description &&
      x.category_id === y.category_id &&
      x.created_by === y.created_by &&
      x.created_at === y.created_at
    )
  }
  if (a.kind === 'income' && b.kind === 'income') {
    const x = a.income
    const y = b.income
    return (
      x.id === y.id &&
      x.amount === y.amount &&
      x.description === y.description &&
      x.kind === y.kind &&
      x.created_by === y.created_by &&
      x.event_date === y.event_date
    )
  }
  return false
}

/**
 * Monta el controller + los hooks de datos (recién con snapshot.data) y
 * deriva las VMs para el kit. La lista de movimientos es una SectionList
 * virtualizada.
 */
function NeoGastosContent({
  userId,
  familyId,
  mode,
  preview,
  onEdgeActiveChange,
  onBottomEdgeActiveChange,
  dashboard,
  isSalaryPendingConfirmation,
  confirmCycleStartingBalance,
  salaryErrorMessage,
  isSavingSalary,
  telemetry,
}: NeoGastosContentProps) {
  useScreenLifecycleLog('Gastos·Neo·Content')
  const router = useRouter()
  // Navegación del navigator de TABS (Gastos es un screen de `(tabs)`): su
  // `getState()` dice qué tab está ACTIVA. Lo usa el reset de paginación para
  // distinguir "cambié de tab" de "pushié una ruta encima" (ver A1 abajo).
  const navigation = useNavigation()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const s = GASTOS_SPEC[mode]
  // PERF: los tabs usan `freezeOnBlur:false`, así que este hero queda MONTADO
  // cuando estás en otra tab y sus 10 partículas seguirían corriendo un loop
  // continuo (10 worklets/frame) invisibles. Gateamos por foco: `paused` pausa
  // el driver de las partículas del hero cuando Gastos no está enfocada, y lo
  // reanuda al volver. En preview (ruta dev) suele ser true → corre normal.
  // El foco es el gate COMPLETO: estando EN Gastos las partículas corren aunque
  // scrollees (la pantalla vieja hace lo mismo y scrollea fluida — ver el
  // bloque de handlers de scroll, donde se revirtió la pausa por gesto).
  const isFocused = useIsFocused()
  // Deep-link del Asistente Financiero (`open-expenses-filtered` →
  // router.push a /(app)/(tabs)/expenses con params.categoryId): la vista
  // debe aterrizar YA filtrada por esa categoría. MISMO parseo/nombre de
  // param que la vieja (gastos-v2-screen). En preview no hay param (no rompe);
  // post-swap el filtro inicial se refleja en hero/calendario/lista al montar.
  const params = useLocalSearchParams<{ categoryId?: string }>()
  const initialCategoryId =
    typeof params.categoryId === 'string' && params.categoryId.length > 0
      ? params.categoryId
      : null
  const controller = useGastosController(familyId, {
    initialCategoryId,
    // El outer YA computó este dashboard (lo necesita para el cupo diario del
    // snapshot). Sin inyectarlo, el controller montaba su propio
    // `useFamilyDashboard`: RQ dedupea las queries, pero NO el useMemo de
    // `buildFamilyDashboardSnapshot` (un forEach sobre TODOS los gastos de la
    // familia) → esa agregación corría DOS veces por render de la pantalla.
    dashboard,
    // Esta pantalla NO dibuja spinners globales: el skeleton lo gatea el
    // snapshot del outer y el footer usa `isFetchingNextPage` (que se lee
    // aparte). Leer isFetching/isLoading suscribiría a cada transición de
    // fetching de las 5 queries del controller. Ver la nota del prop.
    trackFetchingState: false,
  })
  // FIX B (perf): `useGastosController` retorna un objeto literal NUEVO cada
  // render (use-gastos-controller.ts:446). Los callbacks que lo cierran
  // (handleSelectDay/goToFocus/handleSelectFilter) se recreaban en cada render y
  // DERROTABAN el useMemo del ListHeader (calendario 30+ celdas + hero + filtro
  // se reconstruían aun durante scroll/paginación). Lo leemos por ref (mismo
  // patrón que telemetryRef): sus MÉTODOS (clearDay/clearAll/setSelectedDay/…)
  // ya son estables adentro del controller, y el ref siempre lee `.current` en
  // cada invocación → sin stale closures.
  const controllerRef = useRef(controller)
  controllerRef.current = controller

  // Deep-link POST-mount: `initialCategoryId` sólo alimenta el useState del
  // mount, y las tabs se pre-montan al boot (`lazy:false` en app-tabs) — así
  // que cualquier `router.push` posterior con `params.categoryId` (el sheet
  // "Dónde ajustar" de Control, o `open-expenses-filtered` del Asistente)
  // actualizaba el param y NO filtraba nada. Este efecto aplica el filtro
  // cuando el param llega con la pantalla ya montada, y lo limpia para que
  // un segundo push con la MISMA categoría vuelva a disparar.
  useEffect(() => {
    const categoryId =
      typeof params.categoryId === 'string' && params.categoryId.length > 0
        ? params.categoryId
        : null
    if (!categoryId) return
    controllerRef.current.setSelectedCategoryId(categoryId)
    router.setParams({ categoryId: undefined })
  }, [params.categoryId, router])

  const streakQuery = useStreak(familyId, userId)
  const streakData = streakQuery.data

  // ── Realtime (gateado en preview) ───────────────────────────────────
  // MISMAS subscripciones que la Gastos vieja (useGastosRealtime →
  // useFamilyRealtime scope 'gastos'): partner edita/borra un gasto o renombra
  // una categoría → invalida expenses + los 5 endpoints de gastos + categories,
  // sin pull-to-refresh. En preview NO suscribe (familyId undefined): el canal
  // `family-realtime:{familyId}:gastos` lo comparte la vieja live y el
  // removeChannel del unmount de la ruta dev la dejaría sin realtime.
  useGastosRealtime(preview ? undefined : familyId)

  // ── Telemetría de elementos (gateada en preview) ────────────────────
  // trackTap central con los MISMOS nombres/props de evento que la vieja
  // (`gastos.element_tapped` + elementId/slot). En preview early-return (cero
  // telemetría desde la ruta dev). El handle de telemetría cambia de identidad
  // por render (markTapped es un closure nuevo); lo leemos por ref para que
  // trackTap quede ESTABLE (deps solo preview+familyId) y no rompa la
  // memoización del ListHeader/handlers.
  const telemetryRef = useRef(telemetry)
  telemetryRef.current = telemetry
  const trackTap = useCallback(
    (elementId: string, slot: string, destinationRoute?: string) => {
      if (preview) return
      telemetryRef.current.markTapped()
      void logScreenEvent({
        familyId,
        event: 'gastos.element_tapped',
        elementId,
        slot,
        context: {
          session_id: telemetryRef.current.sessionId,
          destination_route: destinationRoute ?? null,
        },
      })
    },
    [preview, familyId],
  )

  // ── Tour de Gastos (auto-start gateado en preview) ──────────────────
  // Auto-arranca en la primera visita (no-op una vez visto), MISMA key/orden
  // que la vieja. `enabled:!preview`: en la ruta dev la Gastos vieja live ya
  // registra/dispara el tour (registro module-level por (tour,order)) → correr
  // el nuestro en paralelo lo clobbearía. La superficie de scroll + los
  // TourTarget se montan solo en la rama del feed (SectionList); en vacío/
  // cerrado no hay pasos registrados → start() es no-op y re-intenta al
  // próximo focus con datos (patrón verificado en use-screen-tour).
  useScreenTour(GASTOS_TOUR, { enabled: !preview })
  const tourScrollRef = useRef<SectionList<MovementItem, MovimientosSection> | null>(null)
  /**
   * Tocar la tab ya activa vuelve al principio — ver la nota en
   * `neo-home-screen`. En la `SectionList` el hook baja por
   * `getScrollResponder()`, o sea que scrollea el ScrollView de adentro y NO
   * usa `scrollToLocation` (que con secciones de alto variable aterriza mal).
   * En las ramas de vacío y de ciclo cerrado el ref queda en null y el hook es
   * no-op: no hay nada que rebobinar.
   */
  useScrollToTop(tourScrollRef)
  const tourMeasureRef = useRef<View | null>(null)
  const tourBindingRef = useRef<TourScrollHandlers | null>(null)
  const handleTourScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      tourBindingRef.current?.onScroll(event)
    },
    [],
  )
  const handleTourContentSizeChange = useCallback((width: number, height: number) => {
    tourBindingRef.current?.onContentSizeChange(width, height)
  }, [])
  // Scroll edge effect · el material del safe area superior aparece con
  // contenido debajo. Este handler va SIEMPRE cableado (a diferencia del
  // del tour), pero es barato: un setState con bail-out que solo cambia
  // al cruzar el umbral, así que no re-renderea por frame. Delega al
  // tour cuando está activo para no montar dos onScroll en la lista
  // (prop nuevo = lista invalidada, ver nota de perf de abajo).
  const edgeActiveRef = useRef(false)
  const bottomEdgeActiveRef = useRef(false)
  const isTourActiveRef = useRef(false)
  const handleListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
      const y = contentOffset.y
      const next = y > SCROLL_EDGE_THRESHOLD
      if (edgeActiveRef.current !== next) {
        edgeActiveRef.current = next
        onEdgeActiveChange(next)
      }
      // Simétrico del de arriba: material mientras quede recorrido por
      // debajo. La lista trae sus propios insets (`ownInsets`), así que
      // el Screen no ve este scroll y el booleano se lo pasamos nosotros.
      const hiddenBelow = contentSize.height - layoutMeasurement.height - y
      const nextBottom = hiddenBelow > SCROLL_EDGE_THRESHOLD
      if (bottomEdgeActiveRef.current !== nextBottom) {
        bottomEdgeActiveRef.current = nextBottom
        onBottomEdgeActiveChange(nextBottom)
      }
      if (isTourActiveRef.current) tourBindingRef.current?.onScroll(event)
    },
    [onEdgeActiveChange, onBottomEdgeActiveChange],
  )
  // PERF (jank de scroll) · el `onScroll` del tour se CABLEA solo mientras el
  // tour corre. Antes iba siempre: un callback JS despachado por frame en TODO
  // scroll, de por vida, para mantener un ref que solo lee el TourHost. El
  // booleano lo empuja `GastosTourActiveGate` (único suscripto al contexto) →
  // cambia 2 veces por sesión, no re-renderea nada más.
  const handleTourActiveChange = useCallback((active: boolean) => {
    isTourActiveRef.current = active
  }, [])

  // Marcas "sin gastos" del ciclo actual — misma fuente que la vieja
  // (home_snapshot.no_spend_days_this_cycle), NO el placeholder del streak.
  const homeSnapshot = useHomeSnapshot(userId)
  const noSpendMarkedDates = useMemo(
    () => new Set<string>(homeSnapshot.data?.no_spend_days_this_cycle ?? []),
    [homeSnapshot.data?.no_spend_days_this_cycle],
  )

  // ── Ciclo en vista: actual (vivo) vs edición CERRADA (F4) ───────────
  // El dropdown lista [ciclo ACTUAL, ...ediciones cerradas]. Seleccionar una
  // edición pone `viewedCycleId` → la pantalla pasa a modo SOLO-LECTURA
  // (agregados de `useMonthlyEditions`; NO toca las RPCs del ciclo vivo —
  // forDay/movimientos no se disparan porque el feed/day-detail no se montan
  // en cerrado); "Volver al actual" lo resetea. Las ediciones vienen SEEDEADAS
  // del cache de home_snapshot (control-intelligence) → sin red extra en el
  // caso común, y sin cold-start (query directa a monthly_summaries).
  // PERF · GATEADA. `useMonthlyEditions` baja hasta 12 ciclos con
  // `category_breakdown` + `daily_totals` (JSON pesados) y su seed desde
  // control-intelligence NO es reactivo (`initialData` se evalúa una sola vez),
  // así que el fetch real salía seguido — para alimentar un dropdown que casi
  // nunca se abre. Ahora solo se pide cuando el usuario lo abre, o cuando ya hay
  // una edición en vista (que solo se puede haber elegido desde el dropdown).
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [viewedCycleId, setViewedCycleId] = useState<string | null>(null)
  const editionsResult = useMonthlyEditions(
    isDropdownOpen || viewedCycleId != null ? familyId : undefined,
  )
  const editions = editionsResult.editions
  const selectedEdition = useMemo(
    () =>
      viewedCycleId == null
        ? null
        : (editions.find((e) => e.id === viewedCycleId) ?? null),
    [viewedCycleId, editions],
  )
  // isCurrent gatea TODO lo interactivo (filtro, day-detail, mutaciones, feed
  // paginado): en cerrado no hay movimientos que traer ni mutar.
  const viewingClosed = selectedEdition != null

  const dropdownItems = useMemo<DropdownItemVM[]>(() => {
    const items: DropdownItemVM[] = [
      {
        name: controller.cycleLabel,
        tag: t('gastos:closed.currentTag'),
        tone: 'current',
        active: viewedCycleId == null,
      },
    ]
    for (const e of editions) {
      // Sobrante del ciclo CON signo (lo que quedó en la cuenta al cierre),
      // misma fórmula que Ediciones (Settings): margen (+) / excedido (−).
      const surplus = computeCycleSurplusSigned(e)
      const sign = surplus > 0 ? '+' : surplus < 0 ? MINUS : ''
      items.push({
        name: e.period_label,
        tag: `${sign}${formatMoney(Math.abs(Math.round(surplus)))}`,
        tone: 'closed',
        active: viewedCycleId === e.id,
      })
    }
    return items
  }, [controller.cycleLabel, editions, viewedCycleId, t])

  const handleToggleDropdown = useCallback(() => {
    void triggerHaptic('selection')
    trackTap('cycle_dropdown', 'header')
    setIsDropdownOpen((v) => !v)
  }, [trackTap])
  const clearAllRef = controller.clearAll
  const handleSelectCycle = useCallback(
    (i: number) => {
      void triggerHaptic('selection')
      trackTap('cycle_select', 'header')
      setIsDropdownOpen(false)
      // Reset del foco vivo (día/categoría) al cambiar de ciclo — deja el modo
      // cerrado prístino y el regreso al actual limpio (paridad con el reducer
      // del mock). clearAll solo vuelve a queryKeys ya cacheadas (categoryId
      // null, sin día) → NO refetchea el ciclo actual. `clearAll` es estable
      // (useCallback []), así que no re-invalida el ListHeader memoizado.
      clearAllRef()
      // FIX C: clearAll solo limpia el día IN-cycle. El día FUERA-DE-CICLO vive
      // en estado local aparte (selectedOutIso) → resetearlo también, o al
      // "Volver al actual" con el ciclo vencido reaparecería el day-detail del
      // día fuera en vez del calendario. (setSelectedOutIso es estable.)
      setSelectedOutIso(null)
      setViewedCycleId(i === 0 ? null : (editions[i - 1]?.id ?? null))
    },
    [clearAllRef, editions, trackTap],
  )
  const handleBackToCurrent = useCallback(() => {
    void triggerHaptic('selection')
    setIsDropdownOpen(false)
    // FIX C (robustez): resetear AMBOS focos al volver al ciclo actual, igual
    // que handleSelectCycle — el foco fuera-de-ciclo no debe sobrevivir al
    // cambio de vista.
    setSelectedOutIso(null)
    setViewedCycleId(null)
  }, [])

  // VMs de la edición cerrada (derivadas SIEMPRE; guardadas cuando no hay
  // selección para no romper el orden de hooks). Todo sale de
  // `MonthlySummaryHistory` (agregados persistidos): total_variable_spent,
  // category_breakdown, daily_totals — NUNCA movimientos individuales
  // (hard-delete a los 14 días).
  const closedCategories = useMemo<HeroCategory[]>(() => {
    if (!selectedEdition) return []
    return normaliseCategoryBreakdown(selectedEdition.category_breakdown)
      .slice(0, 3)
      .map((c) => ({
        color: categorySwatch(c.name ?? '', mode === 'dark'),
        name: c.name
          ? localizeCategoryNameByName(c.name, 'expense')
          : t('gastos:movementRow.noCategory'),
        // Mismo formato que la vieja / el hero vivo: "$X · N%".
        value: `${formatMoney(Math.round(c.total))} · ${Math.round(c.pct)}%`,
        pct: c.pct,
      }))
  }, [selectedEdition, mode, t])
  // v2 · DS-6 — el calendario de una edición cerrada pasa a ser TAPPABLE: el
  // total por día ya estaba persistido en `daily_totals` y hasta v1 la grilla
  // lo pintaba sin dejar leerlo. El día elegido se guarda por ISO y se limpia
  // al cambiar de edición.
  //
  // Se guardaba por NÚMERO de día, con el supuesto de que es único dentro de
  // un ciclo. Ese supuesto se cayó con el modelo extendido: la edición cerrada
  // hereda la ventana estirada tal cual (`close_monthly_cycle` archiva
  // `period_end` = la fecha de confirmación, no el payday), así que puede
  // durar más de un mes. Con el número como clave reaparecían los tres bugs
  // del ciclo vivo — dos celdas marcadas a la vez, ‹ › caminando el tramo
  // equivocado y el detalle mostrando el gemelo del otro mes.
  const [selectedClosedIso, setSelectedClosedIso] = useState<string | null>(null)
  useEffect(() => {
    setSelectedClosedIso(null)
  }, [viewedCycleId])
  const closedDayMeta = useMemo(
    () => (selectedEdition ? buildClosedDayMeta(selectedEdition) : new Map()),
    [selectedEdition],
  )
  const closedCells = useMemo(
    () =>
      (selectedEdition ? buildClosedCells(selectedEdition) : []).map((c) =>
        c.blank || c.iso == null ? c : { ...c, selected: c.iso === selectedClosedIso },
      ),
    [selectedEdition, selectedClosedIso],
  )
  const closedNavIsos = useMemo(
    () => closedCells.filter((c) => !c.blank && c.iso != null).map((c) => c.iso as string),
    [closedCells],
  )
  const handleSelectClosedDay = useCallback((_n: number, iso?: string) => {
    if (!iso) return
    setSelectedClosedIso((prev) => (prev === iso ? null : iso))
  }, [])
  const handleClearClosedDay = useCallback(() => setSelectedClosedIso(null), [])
  const closedNavIndex =
    selectedClosedIso == null ? -1 : closedNavIsos.indexOf(selectedClosedIso)
  const handlePrevClosedDay = useCallback(() => {
    setSelectedClosedIso((prev) => {
      if (prev == null) return prev
      const i = closedNavIsos.indexOf(prev)
      return i > 0 ? (closedNavIsos[i - 1] ?? prev) : prev
    })
  }, [closedNavIsos])
  const handleNextClosedDay = useCallback(() => {
    setSelectedClosedIso((prev) => {
      if (prev == null) return prev
      const i = closedNavIsos.indexOf(prev)
      return i >= 0 && i < closedNavIsos.length - 1 ? (closedNavIsos[i + 1] ?? prev) : prev
    })
  }, [closedNavIsos])
  /** Día-de-mes del día cerrado en foco — sólo para el header de la tarjeta. */
  const selectedClosedDayNum = useMemo(() => {
    const d = parseIsoLocalDate(selectedClosedIso)
    return d ? d.getDate() : null
  }, [selectedClosedIso])
  const closedBars = useMemo(
    () => (selectedEdition ? buildClosedRecentBars(selectedEdition) : undefined),
    [selectedEdition],
  )
  const closedProm = useMemo(() => {
    if (!selectedEdition) return ''
    return formatMoney(
      Math.round(
        (selectedEdition.total_variable_spent ?? 0) / editionDayCount(selectedEdition),
      ),
    )
  }, [selectedEdition])

  // ── Movimientos de la edición cerrada ──────────────────────────────
  // Reusa las RPCs del ciclo vivo (`gastos_expenses_paginated` /
  // `gastos_expenses_for_day`) con la ventana [period_start, period_end) de la
  // edición en vez de la del ciclo vivo: ninguna de las dos filtra por
  // `archived_at`, así que sirven tal cual para ventanas ya cerradas. La query
  // key incluye la ventana → cero colisión con el cache del ciclo vivo. Gate:
  // sólo fetchea mientras `viewingClosed` (mismo patrón que `useMonthlyEditions`
  // con `isDropdownOpen || viewedCycleId != null`).
  const closedWindow = useMemo(() => {
    if (!selectedEdition) return null
    // Mismo parseo que el resto de esta sección para `period_start`/`period_end`
    // (`parseIsoLocalDate`, arriba): nunca `new Date(iso)` a secas, que
    // interpreta UTC y corre el día ±1 según tz del device.
    const start = parseIsoLocalDate(selectedEdition.period_start)
    const end = parseIsoLocalDate(selectedEdition.period_end)
    if (!start || !end) return null
    return { start, end }
  }, [selectedEdition])
  const closedFeed = useGastosExpensesPaginated({
    familyId: viewingClosed ? familyId : undefined,
    cycleStart: closedWindow?.start ?? controller.cycleStart,
    cycleEnd: closedWindow?.end ?? controller.cycleEnd,
    today: controller.today,
    categoryId: null,
  })
  const closedRows = useMemo(
    () => closedFeed.data?.pages.flatMap((p) => p.expenses) ?? [],
    [closedFeed.data],
  )
  // Mismo puente que el controller del ciclo vivo (`rowToExpense` en
  // use-gastos-controller.ts): `groupGastosByDay` espera `Expense[]` y las
  // filas de las RPCs paginadas son `GastosExpenseRow[]`. La función del
  // controller es privada del módulo (no exportada) — se replica acá el mismo
  // mapeo campo a campo, sin inventar un adaptador nuevo.
  const closedExpenses = useMemo<Expense[]>(
    () =>
      closedRows.map((row) => ({
        id: row.id,
        family_id: row.family_id,
        category_id: row.category_id,
        commitment_id: row.commitment_id,
        description: row.description,
        notes: row.notes,
        price: row.price,
        created_at: row.created_at,
        created_by: row.created_by,
        creator_display_name: row.creator_display_name ?? t('gastos:misc.noName'),
        paid_in_arrears: row.paid_in_arrears === true,
      })),
    [closedRows, t],
  )
  const closedSections = useMemo<MovimientosSection[]>(() => {
    if (!viewingClosed) return []
    return buildGastosSections({
      groups: groupGastosByDay({ expenses: closedExpenses, today: controller.today }),
      cycleIncomeEvents: [],
      selectedDay: null,
      hasNextPage: closedFeed.hasNextPage,
    })
  }, [viewingClosed, closedExpenses, controller.today, closedFeed.hasNextPage])
  // Fetched y sin filas ⇒ o la edición no tiene gastos en su ventana, o ya
  // pasó el hard-delete de los 14 días (edición purgada pre-feature) — el
  // fallback "no se conservaron" cubre ambos casos por igual.
  const closedFeedEmpty = closedFeed.isFetched && closedRows.length === 0
  // Day-detail cerrado: movimientos reales del día tocado en la grilla
  // (`selectedClosedIso`, ya declarado arriba — no crear un segundo estado).
  const closedDayQuery = useGastosExpensesForDay({
    familyId: viewingClosed ? familyId : undefined,
    isoDate: viewingClosed ? selectedClosedIso : null,
    categoryId: null,
  })
  // Memoizado (mismo patrón que `closedRows` arriba): `?? []` sin envolver
  // crea un array NUEVO por render → desestabiliza el `useMemo` de abajo,
  // que depende de esta referencia.
  const closedDayRows = useMemo(() => closedDayQuery.data ?? [], [closedDayQuery.data])
  // Mismo puente `GastosExpenseRow` → `Expense` que `closedExpenses` arriba
  // (la fila de un día suelto viaja por el mismo `buildMovRowVM` que el feed).
  const closedDayExpenses = useMemo<Expense[]>(
    () =>
      closedDayRows.map((row) => ({
        id: row.id,
        family_id: row.family_id,
        category_id: row.category_id,
        commitment_id: row.commitment_id,
        description: row.description,
        notes: row.notes,
        price: row.price,
        created_at: row.created_at,
        created_by: row.created_by,
        creator_display_name: row.creator_display_name ?? t('gastos:misc.noName'),
        paid_in_arrears: row.paid_in_arrears === true,
      })),
    [closedDayRows, t],
  )

  // ── F5 · Ciclo VENCIDO + días FUERA-DE-CICLO ───────────────────────
  // Estado VENCIDO = MISMA señal que la Home (isSalaryPendingConfirmation): el
  // ciclo terminó pasando el payday y el cobro sigue sin confirmar → el ciclo
  // queda congelado (usePayCycle freeze) y los gastos posteriores al fin caen
  // FUERA. Solo aplica al ciclo ACTUAL (nunca a una edición cerrada).
  const isOverdue = isSalaryPendingConfirmation && !viewingClosed

  // Día FUERA del ciclo en foco (posterior al fin, ventana [cycleEnd, today]).
  // Estado LOCAL — el controller.selectedDay solo modela días DENTRO del ciclo
  // (su RPC day-detail consulta [cycleStart, cycleEnd)).
  const [selectedOutIso, setSelectedOutIso] = useState<string | null>(null)

  // Gastos posteriores al cierre — query GATEADA a `isOverdue` (no fetchea en
  // el caso común). Key bajo el prefijo `['expenses', familyId, …]` →
  // `syncAllAfterMutation({scopes:['expenses']})` la refresca al borrar/crear.
  //
  // ACOTADA A LA VENTANA. Antes pedía la tabla ENTERA de expenses de la familia
  // y el cliente descartaba todo lo anterior a `cycleEnd` unos renders después
  // (ver el filtro de `outWindow`). Como la key vive bajo el prefijo
  // `expenseQueryKeys.family`, cada mutación propia y cada eco de realtime la
  // re-descargaba completa — durante TODOS los días que dure el estado vencido.
  // `createdAtGte` empuja al server el mismo corte que ya hacía el cliente, así
  // que el resultado visible es idéntico.
  const outOfCycleGte = useMemo(
    () => startOfLocalDay(controller.cycleEnd).toISOString(),
    [controller.cycleEnd],
  )
  // ¿Existe siquiera una ventana fuera-de-ciclo? Sólo si el primer día fuera
  // (`cycleEnd`) ya pasó. En modelo EXTENDIDO `cycleEnd` es MAÑANA por
  // construcción, así que la ventana es vacía por definición: la query salía
  // igual y traía todos los gastos desde mañana para descartarlos enteros.
  // Un solo predicado para el gate y para el early-return de `outWindow`, así
  // no pueden divergir.
  const hasOutWindow = useMemo(
    () =>
      isOverdue &&
      startOfLocalDay(controller.cycleEnd).getTime() <=
        startOfLocalDay(controller.today).getTime(),
    [isOverdue, controller.cycleEnd, controller.today],
  )
  const outOfCycleQuery = useQuery<Expense[]>({
    queryKey: [...expenseQueryKeys.family(familyId), 'gastos-out-of-cycle', outOfCycleGte],
    enabled: hasOutWindow && Boolean(familyId),
    staleTime: 5 * 60_000,
    queryFn: () =>
      loadExpenses(familyId, { excludeArchived: true, createdAtGte: outOfCycleGte }),
  })

  // Ventana fuera-de-ciclo = [cycleEnd, today] (cycleEnd EXCLUSIVO del ciclo =
  // primer día fuera; today inclusive). Una celda `fuera` por día; el bucket
  // por-día alimenta las stats del day-detail. Fechas Y-M-D LOCAL.
  const outWindow = useMemo(() => {
    const empty = {
      days: [] as { iso: string; dayOfMonth: number; date: Date; dateMs: number }[],
      byIso: new Map<string, { total: number; count: number; items: Expense[] }>(),
    }
    if (!hasOutWindow) return empty
    const start = startOfLocalDay(controller.cycleEnd)
    const end = startOfLocalDay(controller.today)
    const days: { iso: string; dayOfMonth: number; date: Date; dateMs: number }[] = []
    for (
      let d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      d.getTime() <= end.getTime();
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
    ) {
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      days.push({
        iso: formatLocalDateKey(day),
        dayOfMonth: day.getDate(),
        date: day,
        dateMs: day.getTime(),
      })
    }
    const byIso = new Map<string, { total: number; count: number; items: Expense[] }>()
    const startMs = start.getTime()
    const endMs = end.getTime()
    for (const e of outOfCycleQuery.data ?? []) {
      if (e.commitment_id) continue // los fijos viven en su propia vista
      const dayMs = startOfLocalDay(new Date(e.created_at)).getTime()
      if (dayMs < startMs || dayMs > endMs) continue
      const iso = formatLocalDateKey(new Date(dayMs))
      const bucket = byIso.get(iso) ?? { total: 0, count: 0, items: [] as Expense[] }
      bucket.total += Number(e.price ?? 0)
      bucket.count += 1
      bucket.items.push(e)
      byIso.set(iso, bucket)
    }
    return { days, byIso }
  }, [hasOutWindow, controller.cycleEnd, controller.today, outOfCycleQuery.data])

  const selectedOutDay = useMemo(
    () =>
      selectedOutIso == null
        ? null
        : (outWindow.days.find((d) => d.iso === selectedOutIso) ?? null),
    [selectedOutIso, outWindow.days],
  )
  const selectedOutBucket =
    selectedOutIso == null ? undefined : outWindow.byIso.get(selectedOutIso)
  const handleClearOutDay = useCallback(() => setSelectedOutIso(null), [])
  const outBucketByIso = outWindow.byIso
  // v2 · B-2 "Ver días" — el no-owner no confirma nada, pero sí puede mirar qué
  // quedó afuera: enfoca el PRIMER día fuera (el más viejo, el que más tiempo
  // lleva sin resolverse). Ref-estable: es dep del `overdueBlock`.
  const outWindowDaysRef = useRef(outWindow.days)
  outWindowDaysRef.current = outWindow.days
  const handleFocusFirstOutDay = useCallback(() => {
    const first = outWindowDaysRef.current[0]
    if (first) setSelectedOutIso(first.iso)
  }, [])

  // "Ver días" en modo EXTENDIDO: los días de extendido SÍ están en la
  // grilla del ciclo, así que el foco va por el camino in-cycle (no por
  // `selectedOutIso`, que modela días que el controller no conoce).
  const handleFocusFirstExtendedDay = useCallback(() => {
    const nominal = startOfLocalDay(controllerRef.current.cycleNominalEnd)
    setSelectedOutIso(null)
    controllerRef.current.selectDayByIso(
      formatLocalDateKey(nominal),
      nominal.getDate(),
    )
  }, [])

  // ── Selección de día (F3) ──────────────────────────────────────────
  // Drive el CONTROLLER (`setSelectedDay`), no un estado local: re-escopa la
  // lista + el day-detail al día real vía la RPC day-detail (correcta aun
  // para días viejos fuera de la página paginada cargada). El HERO se
  // mantiene a nivel ciclo (lee los `cycle*` del controller) — el day-detail
  // lleva los números del día, igual que el mock aprobado.
  const cycleDates = useMemo(() => {
    const out: Date[] = []
    for (let i = 0; i < controller.cycleDays; i++) {
      out.push(
        new Date(
          controller.cycleStart.getFullYear(),
          controller.cycleStart.getMonth(),
          controller.cycleStart.getDate() + i,
        ),
      )
    }
    return out
  }, [controller.cycleStart, controller.cycleDays])
  const todayStartMs = useMemo(
    () => startOfLocalDay(controller.today).getTime(),
    [controller.today],
  )
  const handleSelectDay = useCallback(
    (n: number, iso?: string) => {
      // Celda FUERA-DE-CICLO (n ≥ OUT_N_BASE): foco en un día posterior al fin
      // del ciclo. El day-detail lleva los MISMOS CTAs que un día del ciclo
      // (registrar olvidado / marcar sin gastos) — ver `handleRegisterOutDay`.
      // Limpia el día in-cycle para no solapar focos.
      if (n >= OUT_N_BASE) {
        const outDay = outWindow.days[n - OUT_N_BASE]
        if (!outDay) return
        void triggerHaptic('selection')
        trackTap('calendar_day', 'calendar')
        controllerRef.current.clearDay()
        setSelectedOutIso(outDay.iso)
        return
      }
      // Solo pasado/hoy entran a foco (paridad con la vieja: las celdas
      // futuras no son seleccionables). El calendario del kit no distingue,
      // así que gateamos acá.
      setSelectedOutIso(null)
      // El ISO de la celda manda: `find` por día-de-mes devolvía el PRIMER
      // match y con la ventana estirada (5-jul → 13-ago) tocar el 7 de
      // agosto abría el 7 de julio. El fallback por número queda para
      // callers que no mandan iso.
      const date = iso
        ? cycleDates.find((d) => isoOf(d) === iso)
        : cycleDates.find((d) => d.getDate() === n)
      if (!date || startOfLocalDay(date).getTime() > todayStartMs) return
      // HÁPTICO · va DESPUÉS del guard de día futuro (un tap que no hace nada no
      // debe confirmar nada). Antes solo vibraba la rama fuera-de-ciclo: la
      // interacción PRINCIPAL de la pantalla — tocar un día del calendario — era
      // la única sin confirmación táctil, justo la que cambia el feed entero.
      void triggerHaptic('selection')
      if (n !== controllerRef.current.selectedDay) trackTap('calendar_day', 'calendar')
      // Cerrar el dropdown de ciclo: es lo que hace el reducer del kit
      // (`selectDay` → `dd:false`, transcripción literal del handoff) y el
      // cableado se lo había salteado. Repro: dropdown abierto + tap en un día →
      // el day-detail aparecía DEBAJO del panel desplegado. Las celdas FUERA no
      // lo cierran, igual que en el handoff (rama de arriba).
      setIsDropdownOpen(false)
      // Por ISO: fija QUÉ día es, no sólo su número.
      controllerRef.current.selectDayByIso(isoOf(date), n)
    },
    // controller vía controllerRef (FIX B): las deps restantes (outWindow.days/
    // cycleDates/todayStartMs) son memos data-driven, estables durante scroll.
    [outWindow.days, cycleDates, todayStartMs, trackTap],
  )
  // ── Navegación ‹ › unificada: días del ciclo + días FUERA-DE-CICLO ──
  // (FIX 2) La secuencia navegable es cronológica y contigua:
  //   [días del ciclo hasta hoy]  ++  [días fuera-de-ciclo cuando isOverdue]
  // El último día del ciclo y el primer día fuera son consecutivos (outWindow
  // arranca en cycleEnd = día siguiente al último del ciclo), así que → cruza
  // del ciclo al overflow y ← vuelve, clampando en los extremos reales (primer
  // día del ciclo ↔ último día fuera / hoy). Sin días fuera (ciclo no vencido)
  // queda solo el tramo del ciclo (mismo clamp a hoy que antes).
  const focusTargets = useMemo<FocusTarget[]>(
    () =>
      buildDayFocusTargets({
        cycleDates,
        todayStartMs,
        outDays: outWindow.days,
        isOverdue,
      }),
    [cycleDates, todayStartMs, isOverdue, outWindow.days],
  )

  // Índice del foco actual dentro de la secuencia unificada. -1 = sin día en
  // foco (calendario a la vista) → sin nav.
  const focusIndex = useMemo(
    () =>
      findDayFocusIndex(focusTargets, {
        selectedDayIso: controller.selectedDayIso,
        selectedOutIso,
      }),
    [focusTargets, selectedOutIso, controller.selectedDayIso],
  )

  const navBounds = useMemo(
    () => dayFocusNavBounds(focusIndex, focusTargets.length),
    [focusIndex, focusTargets.length],
  )

  // Aplica un destino reconciliando los DOS estados de foco (día del ciclo vs
  // día fuera): al cruzar de segmento se limpia el otro para no solapar focos.
  const goToFocus = useCallback(
    (target: FocusTarget) => {
      if (target.kind === 'cycle') {
        setSelectedOutIso(null)
        // `selectDayByIso`, NO `setSelectedDay`: el setter crudo deja intacto
        // el `selectedDayIsoOverride` del día que se tocó en el calendario, y
        // ese ISO es el que consulta el RPC del detalle. Resultado: navegabas
        // con ‹ ›, el número del header cambiaba, pero los movimientos y las
        // stats seguían siendo los del día original.
        controllerRef.current.selectDayByIso(target.iso, target.day)
      } else {
        controllerRef.current.clearDay()
        setSelectedOutIso(target.iso)
      }
    },
    // controller vía controllerRef (FIX B): identidad ESTABLE → estabiliza
    // transitivamente handlePrevDay/handleNextDay (deps de ListHeader).
    [],
  )
  const handlePrevDay = useCallback(() => {
    if (focusIndex > 0) {
      const target = focusTargets[focusIndex - 1]
      if (target) goToFocus(target)
    }
  }, [focusIndex, focusTargets, goToFocus])
  const handleNextDay = useCallback(() => {
    if (focusIndex >= 0 && focusIndex < focusTargets.length - 1) {
      const target = focusTargets[focusIndex + 1]
      if (target) goToFocus(target)
    }
  }, [focusIndex, focusTargets, goToFocus])
  // Fecha concreta del día en foco — la usan las mutaciones (mark/register) y
  // el estado "marcado". Y-M-D LOCAL, nunca toISOString (corre el día ±1).
  // Se resuelve por ISO: `find(d => d.getDate() === n)` devolvía la PRIMERA
  // ocurrencia del número, así que en ventana extendida las mutaciones
  // (marcar día limpio / registrar gasto en el día en foco) escribían un mes
  // atrás. El barrido por número queda de fallback para el caso en que el
  // controller todavía no tenga ISO.
  const selectedDate = useMemo(() => {
    if (controller.selectedDay == null) return null
    const byIso = parseIsoLocalDate(controller.selectedDayIso)
    if (byIso) return byIso
    return cycleDates.find((d) => d.getDate() === controller.selectedDay) ?? null
  }, [controller.selectedDay, controller.selectedDayIso, cycleDates])

  // ── Pose del Brot del header (reuso de derive-brot-pose) ───────────
  const hour = new Date().getHours()
  // PERF: `deriveStreak` corre `buildCopy` (varias interpolaciones i18n t()
  // para headline/message) que en esta pantalla NO se consumen — acá solo se
  // leen `.status` y `.atRiskIntensity`. Memoizar evita rehacer ese trabajo en
  // cada render (la Home sí usa el copy; acá es puro descarte). Se keyea también
  // por `hour` porque `atRiskIntensity` deriva de `new Date()` (banda horaria,
  // cruces 16:00/05:00 → pose del Brot): sin `hour` en deps quedaba congelada y
  // la pose no escalaba al cruzar la hora estando parkeado en Gastos.
  const streakDerived = useMemo(
    () => (streakData ? deriveStreak(streakData) : null),
    // `hour` es un cache-key DELIBERADO: deriveStreak lee `new Date()` adentro
    // (atRiskIntensity), dependencia que el linter no puede inferir léxicamente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streakData, hour],
  )
  const hasActiveStreak = (streakData?.currentStreak ?? 0) > 0
  const atRiskLevel: HomeBrotAtRiskLevel =
    hasActiveStreak && streakDerived?.status === 'at_risk'
      ? (streakDerived.atRiskIntensity ?? 'calm')
      : 'none'
  const isPerfectWeek = streakData ? streakData.weekActivity.every(Boolean) : false
  const brotPose = deriveHomeBrotPose({
    hasLoggedToday: streakData?.hasLoggedToday ?? false,
    isPerfectWeek,
    isBroken: streakData?.isBroken ?? false,
    atRiskLevel,
    hour,
  })
  const badgeCount = streakData?.currentStreak ?? 0
  const handlePressGarden = useCallback(() => {
    void triggerHaptic('selection')
    trackTap('streak_flame', 'header')
    router.push('/(app)/garden')
  }, [router, trackTap])

  const handlePressAdd = useCallback(() => {
    void triggerHaptic('light')
    // Abre el form de gasto como modal/sheet (igual que el botón '+' del tab
    // bar y el CTA de la vieja). Ruta real de add-expense.
    trackTap('add_expense_cta', 'movements_empty', '/(app)/add-expense')
    router.push('/(app)/add-expense')
  }, [router, trackTap])

  // ── Hero (categorías top-3 con color + valor reales) ───────────────
  // SIEMPRE a nivel ciclo (cycleTopCategories), aunque haya un día en foco:
  // el hero se mantiene cycle-level y el day-detail lleva el detalle del día.
  const heroCategories = useMemo<HeroCategory[]>(
    () =>
      controller.cycleTopCategories.map((c) => ({
        color: categorySwatch(c.rawName, mode === 'dark'),
        name: c.label,
        // Mismo formato que la vieja (CategoryWeightsList): "$X · N%".
        value: `${formatMoney(c.amount)} · ${c.percent}%`,
        pct: c.percent,
      })),
    [controller.cycleTopCategories, mode],
  )

  // ── Filtro por categoría: capa de mapeo índice↔category_id ──────────
  const categoriesList = useMemo(
    () => Array.from(controller.categoriesById.values()),
    [controller.categoriesById],
  )
  const totalCount = useMemo(() => {
    let sum = 0
    for (const n of controller.expenseCountByCategoryId.values()) sum += n
    return sum
  }, [controller.expenseCountByCategoryId])
  // Movimientos en el scope actual (respeta el filtro de categoría) → chip de
  // la sección MOVIMIENTOS.
  const movementsCount =
    controller.selectedCategoryId == null
      ? totalCount
      : (controller.expenseCountByCategoryId.get(controller.selectedCategoryId) ?? 0)
  /**
   * Categorías con presencia REAL en el ciclo (owner 2026-08-12). El carrusel
   * listaba el catálogo ENTERO: con 15 movimientos repartidos en 2 categorías
   * igual desfilaban ~12 chips en `0` que no filtran nada, empujando fuera de
   * pantalla a los que sí tienen datos.
   *
   * La categoría filtrada se queda aunque caiga a cero (borrás el último gasto
   * de Mercado con el filtro puesto): sin su chip el filtro activo se quedaría
   * sin ancla en pantalla y el vacío F-4 ("Nada en Mercado este ciclo") estaría
   * hablando de un chip que no está.
   */
  const filterCategories = useMemo(
    () =>
      categoriesList.filter(
        (c) =>
          (controller.expenseCountByCategoryId.get(c.id) ?? 0) > 0 ||
          controller.selectedCategoryId === c.id,
      ),
    [categoriesList, controller.expenseCountByCategoryId, controller.selectedCategoryId],
  )
  const filterChips = useMemo(
    () => [
      {
        label: t('gastos:smartFilter.all'),
        count: String(totalCount),
        active: controller.selectedCategoryId == null,
        catIcon: null as string | null,
      },
      ...filterCategories.map((c) => ({
        label: c.name,
        count: String(controller.expenseCountByCategoryId.get(c.id) ?? 0),
        active: controller.selectedCategoryId === c.id,
        // rawName CRUDO (ES) para el sticker real del CategoryIcon del kit.
        catIcon: (c.rawName ?? c.name) as string | null,
      })),
    ],
    [t, totalCount, filterCategories, controller.selectedCategoryId, controller.expenseCountByCategoryId],
  )
  // ── v2 · F-1…F-4 — estado del filtro ───────────────────────────────
  //
  // F-3 (chips fantasma) se dispara SOLO cuando el ciclo entero está en cero,
  // no por categoría: si ghostearamos cada categoría sin movimientos, F-4
  // ("Nada en Mercado este ciclo") quedaría inalcanzable — y el handoff lo
  // dibuja explícitamente con el chip `🛒 Mercado 0` ACTIVO.
  const filterCycleEmpty = totalCount === 0
  const activeCategory =
    controller.selectedCategoryId == null
      ? null
      : (controller.categoriesById.get(controller.selectedCategoryId) ?? null)
  const filterNoResults = activeCategory != null && movementsCount === 0
  /** Con el ciclo en cero el carrusel deja solo "Todas": el resto son moldes. */
  const visibleFilterChips = useMemo(
    () => (filterCycleEmpty ? filterChips.slice(0, 1) : filterChips),
    [filterCycleEmpty, filterChips],
  )
  const ghostFilterChips = useMemo(
    () => (filterCycleEmpty ? categoriesList.map((c) => c.name) : undefined),
    [filterCycleEmpty, categoriesList],
  )
  const filterStatus = useMemo(() => {
    if (filterNoResults) {
      return { label: t('gastos:filterStatus.noResults'), tone: 'alert' as const }
    }
    if (filterCycleEmpty) return { label: t('gastos:filterStatus.unused'), tone: 'muted' as const }
    if (activeCategory) {
      return {
        label: `${activeCategory.name} · ${movementsCount}`,
        tone: 'data' as const,
      }
    }
    return { label: t('gastos:smartFilter.all'), tone: 'data' as const }
  }, [filterNoResults, filterCycleEmpty, activeCategory, movementsCount, t])

  // F-4 · referencia de la edición cerrada más reciente para la categoría
  // filtrada. Sale de su `category_breakdown` (match por id y, si la categoría
  // se renombró/recreó, por nombre). Sin dato → la línea se omite entera en vez
  // de mostrar "$0", que leería como "no gastaste" y no como "no sabemos".
  const prevEditionCategoryAmount = useMemo(() => {
    if (!filterNoResults || !activeCategory) return null
    const prev = editions[0]
    const raw = prev?.category_breakdown
    if (!Array.isArray(raw)) return null
    const match = raw.find(
      (e) =>
        (e.category_id != null && e.category_id === activeCategory.id) ||
        (e.name != null && e.name === (activeCategory.rawName ?? activeCategory.name)),
    )
    const total = Number(match?.total ?? 0)
    return Number.isFinite(total) && total > 0 ? formatMoneyShort(total) : null
  }, [filterNoResults, activeCategory, editions])

  // Espejo en ref de los chips: `handleSelectFilter` tiene que ser ref-estable
  // (es dep del `filterBlock`), así que lee label/conteo de acá en vez de
  // cerrar sobre `filterChips`, que es un array nuevo por render.
  const filterChipsRef = useRef(filterChips)
  filterChipsRef.current = filterChips
  // Mismo espejo para las categorías VISIBLES: el índice del chip indexa contra
  // la lista filtrada, no contra el catálogo. Va por ref (y no en deps) porque
  // `filterCategories` cambia de identidad con cada conteo → como dep haría
  // inestable a `handleSelectFilter`, que es dep del ListHeader (FIX B).
  const filterCategoriesRef = useRef(filterCategories)
  filterCategoriesRef.current = filterCategories
  const handleSelectFilter = useCallback(
    (i: number) => {
      const id = i === 0 ? null : (filterCategoriesRef.current[i - 1]?.id ?? null)
      // Solo loguea cuando cambia el filtro (paridad con la vieja).
      if (id !== controllerRef.current.selectedCategoryId) {
        trackTap('filter_pill', 'filters')
        // A11Y · filtrar re-escopa TODA la pantalla (total y promedio del hero,
        // barras de 7 días, ~30 celdas del calendario, feed) SIN mover el foco
        // del lector: el único feedback era el `accessibilityState.selected`
        // del propio chip, que VoiceOver/TalkBack no re-anuncian salvo que el
        // usuario lo vuelva a enfocar. El conteo que anunciamos sale de
        // `expenseCountByCategoryId` (nivel CICLO, ya en mano) → no espera la
        // query en vuelo y por lo tanto nunca anuncia un número stale.
        const chip = filterChipsRef.current[i]
        if (chip) {
          // `count` NUMÉRICO: el chip lo guarda como string para el badge, pero
          // i18next necesita el número para elegir la forma plural.
          const count = Number(chip.count)
          AccessibilityInfo.announceForAccessibility(
            id == null
              ? t('gastos:smartFilter.a11yCleared', { count })
              : t('gastos:smartFilter.a11yApplied', { name: chip.label, count }),
          )
        }
      }
      // Mismo criterio que `handleSelectDay`: filtrar recalcula el hero y el
      // calendario ENTEROS, que es exactamente lo que el panel del dropdown
      // está tapando. Dejarlo abierto mostraba la transición debajo del panel.
      setIsDropdownOpen(false)
      controllerRef.current.setSelectedCategoryId(id)
    },
    // controller vía controllerRef (FIX B): también es dep del ListHeader, así
    // que su identidad debe ser estable para que la memo del header aguante.
    // `t` solo cambia de identidad al cambiar de idioma (mismo criterio que el
    // resto de los bloques); los chips van por ref para no desestabilizarlo.
    [trackTap, t],
  )
  const handleClearFilters = useCallback(() => {
    void triggerHaptic('selection')
    trackTap('clear_filters', 'filters')
    // controller vía controllerRef (FIX B): este handler se le escapó al pase
    // original (`handleSelectCycle` ya lo hacía). Es dep del useMemo de
    // `ListEmpty`, así que con el controller en deps el `ListEmptyComponent` era
    // un elemento NUEVO en cada render → otro prop inestable de la SectionList
    // que le rompía el bail-out (ver `refreshControl`).
    controllerRef.current.clearAll()
  }, [trackTap])

  // ── Movimientos (F2): feed real virtualizado ───────────────────────
  const membersQuery = useFamilyMembers(familyId)
  const memberById = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>()
    for (const m of membersQuery.data ?? []) map.set(m.id, m)
    return map
  }, [membersQuery.data])

  // Ingresos del ciclo visible — se intercalan con los gastos en las
  // day-groups (fila verde con "+"). useIncomeEvents trae los últimos 100 de
  // la familia; los bucketeamos por event_date (NO created_at: un ingreso
  // backdateado va al día que sucedió, no al que se registró).
  const incomeEventsQuery = useIncomeEvents(familyId)
  const cycleIncomeEvents = useMemo(() => {
    const all = incomeEventsQuery.data ?? []
    if (all.length === 0) return []
    const startMs = controller.cycleStart.getTime()
    const endMs = controller.cycleEnd.getTime()
    return all.filter((i) => {
      const eventMs = incomeHappenedAtMs(i)
      return Number.isFinite(eventMs) && eventMs >= startMs && eventMs < endMs
    })
  }, [incomeEventsQuery.data, controller.cycleStart, controller.cycleEnd])

  // Grupos-día → sections (merge gasto+ingreso, sort cronológico, bucketing
  // por event_date). F3: con `controller.selectedDay` la lista se escopa al
  // día (la RPC day-detail trae TODOS los movimientos del día, aun de páginas
  // no cargadas) y `buildGastosSections` filtra los ingresos a ese mismo día.
  const sections = useMemo<MovimientosSection[]>(
    () =>
      buildGastosSections({
        groups: controller.groups,
        cycleIncomeEvents,
        selectedDay: controller.selectedDay,
        // Con páginas viejas sin cargar, los ingresos fuera de la ventana no
        // abren sección propia: si no, el sueldo del día 1 aterrizaba al fondo
        // del feed y abría un hueco de semanas dentro de una ventana que el
        // usuario lee como continua (ver buildGastosSections).
        hasNextPage: controller.hasNextPage,
      }),
    [controller.groups, controller.selectedDay, cycleIncomeEvents, controller.hasNextPage],
  )

  // Detección de "cuenta nueva" (mismo criterio que la vieja): sin gastos, sin
  // ingresos del ciclo y sin gastos recientes fuera del ciclo (ciclo freezado
  // esperando confirm de cobro). Si solo hay ingresos, NO es vacío.
  //
  // LIMIT 6, NO 3. `home_snapshot` seedea el cache de recientes SOLO para
  // limit 6 (use-home-snapshot), y el limit entra en la queryKey: con 3 esto era
  // un cache-MISS garantizado — una request en el mount y otra en cada mutación
  // — para alimentar un simple booleano. Con 6 pega contra la cache que la Home
  // ya calentó. El valor derivado no cambia: solo importa si hay ≥1.
  const recentExpensesQuery = useRecentExpenses(familyId, 6)
  const hasRecentExpensesOutsideCycle = (recentExpensesQuery.data?.length ?? 0) > 0
  const isEmptyAccount =
    !controller.error &&
    controller.expenses.length === 0 &&
    cycleIncomeEvents.length === 0 &&
    !hasRecentExpensesOutsideCycle

  // ── Calendario: celdas del ciclo real + moods + hoy + futuro + marcas ─
  const firstWeekdayOffset = useMemo(
    () => getMondayFirstOffset(controller.cycleStart),
    [controller.cycleStart],
  )

  // v2 · CAL-4/EV2 "recién arrancado". Día 1-based dentro del ciclo; clampeado
  // por si el ciclo ya venció (el day-index se pasaría de `cycleDays`).
  const cycleDayIndex = useMemo(() => {
    const start = startOfLocalDay(controller.cycleStart).getTime()
    const now = startOfLocalDay(controller.today).getTime()
    const idx = Math.floor((now - start) / MS_PER_DAY) + 1
    return Math.min(Math.max(idx, 1), controller.cycleDays)
  }, [controller.cycleStart, controller.today, controller.cycleDays])
  // UMBRAL · los primeros 5 días. Es el tramo donde la grilla es mayormente
  // futuro: con 30 pozos apagados el calendario se lee como "roto" en vez de
  // "todavía no pasó nada". A partir del 6º ya hay suficiente pintado como para
  // que el futuro en inset se entienda solo. El ejemplo del handoff (CAL-4,
  // "día 3 de 30") cae adentro.
  const FRESH_CYCLE_DAYS = 5
  // `isEmptyAccount` entra sí o sí: una cuenta sin NADA cargado es el caso
  // "molde" por definición, aunque el ciclo vaya por el día 20. Sin esto, la
  // rama vacía dibujaba 30 pozos apagados debajo de un strip que habla de
  // "punteados" que no existían.
  const isFreshCycle = (cycleDayIndex <= FRESH_CYCLE_DAYS || isEmptyAccount) && !isOverdue
  const cells = useMemo(
    () =>
      buildNeoCells({
        cycleStart: controller.cycleStart,
        cycleDays: controller.cycleDays,
        today: controller.today,
        firstWeekdayOffset,
        dayMoodsByIso: controller.dayMoodsByIso,
        noSpendMarkedDates,
        selectedDay: controller.selectedDay,
        selectedDayIso: controller.selectedDayIso,
        nominalEnd: controller.cycleNominalEnd,
        extCellSub: t('gastos:overdue.extCellSub'),
        empty: isEmptyAccount,
        freshCycle: isFreshCycle,
      }),
    [
      controller.cycleStart,
      controller.cycleDays,
      controller.today,
      firstWeekdayOffset,
      controller.dayMoodsByIso,
      noSpendMarkedDates,
      controller.selectedDay,
      controller.selectedDayIso,
      controller.cycleNominalEnd,
      t,
      isEmptyAccount,
      isFreshCycle,
    ],
  )

  // Celdas FUERA-DE-CICLO (kind 'fuera') apéndice del calendario cuando el
  // ciclo está vencido — una por día en [cycleEnd, today]. Fluyen tras el
  // último día del ciclo en la grilla (mismo tratamiento que el mock).
  const outCells = useMemo<DayCell[]>(
    () =>
      outWindow.days.map((d, i) => ({
        key: `fuera-${i}`,
        n: OUT_N_BASE + i,
        label: `+${d.dayOfMonth}`,
        kind: 'fuera' as DayKind,
        selected: selectedOutIso === d.iso,
        sub: t('gastos:overdue.outCellSub'),
      })),
    [outWindow.days, selectedOutIso, t],
  )
  const calendarCells = useMemo(
    () => (isOverdue && outCells.length > 0 ? [...cells, ...outCells] : cells),
    [isOverdue, cells, outCells],
  )

  // ── Delete mutations (gateadas a NO-OP en preview) ─────────────────
  const deleteExpenseMutation = useDeleteExpense(familyId, userId)
  const deleteIncomeMutation = useDeleteIncomeEvent(userId)
  // FIX A (perf, MAJOR): RQ v5 `useMutation` retorna un objeto literal NUEVO
  // cada render → si estos handlers lo tuvieran en deps, se recrearían cada
  // render y, al bajarse como `onDeleteExpense`/`onDeleteIncome` a MovementRow
  // (React.memo), DERROTARÍAN la comparación shallow → ninguna fila hacía
  // bail-out y ~60-70 SwipeRow+boxShadow se reconciliaban en cada paginación/
  // refetch/realtime. Los leemos por ref (mismo patrón que telemetryRef): el
  // `.mutate` se resuelve en cada invocación → sin stale closures.
  const deleteExpenseMutationRef = useRef(deleteExpenseMutation)
  deleteExpenseMutationRef.current = deleteExpenseMutation
  const deleteIncomeMutationRef = useRef(deleteIncomeMutation)
  deleteIncomeMutationRef.current = deleteIncomeMutation

  const handleDeleteExpense = useCallback(
    (expenseId: string) => {
      // En preview NO borramos datos reales (la vieja está montada sobre el
      // mismo cache); la mutación queda no-op.
      if (preview) return
      void triggerHaptic('warning')
      trackTap('gasto_row_delete', 'list')
      deleteExpenseMutationRef.current.mutate(expenseId, {
        onError: (error: unknown) => {
          void triggerHaptic('error')
          toast.error(
            `${t('gastos:errors.deleteTitle')} · ${getErrorMessage(error, t('states:error.server'))}`,
          )
        },
        onSuccess: () => void triggerHaptic('success'),
      })
    },
    // Sin deleteExpenseMutation en deps (se lee por ref): identidad ESTABLE →
    // MovementRow hace bail-out durante scroll/paginación. preview/t/trackTap
    // ya son estables.
    [preview, t, trackTap],
  )

  const handleDeleteIncome = useCallback(
    (incomeId: string) => {
      if (preview || !familyId) return
      void triggerHaptic('warning')
      trackTap('income_row_delete', 'list')
      deleteIncomeMutationRef.current.mutate(
        { id: incomeId, familyId },
        {
          onError: (error: unknown) => {
            void triggerHaptic('error')
            toast.error(
              `${t('gastos:errors.deleteTitle')} · ${getErrorMessage(error, t('states:error.server'))}`,
            )
          },
          onSuccess: () => void triggerHaptic('success'),
        },
      )
    },
    // Sin deleteIncomeMutation en deps (se lee por ref): identidad ESTABLE.
    [preview, familyId, t, trackTap],
  )

  // ── Edición del gasto EN el feed (long-press de la fila) ───────────
  // La mutación es la MISMA que ya usaba el editor del historial retirado
  // (`useUpdateExpense`): patchea las caches paginadas en el onMutate, así que
  // la fila se corrige sola sin esperar el round-trip, y su onError ya avisa
  // con toast + reintento.
  const updateExpenseMutation = useUpdateExpense(familyId, userId)
  // Mismo motivo que las delete (FIX A): el objeto de RQ v5 es literal nuevo
  // por render; leerlo por ref mantiene ESTABLE el handler que baja a la fila.
  const updateExpenseMutationRef = useRef(updateExpenseMutation)
  updateExpenseMutationRef.current = updateExpenseMutation
  // `token` versiona la sesión de edición: es la `key` de la hoja, así que
  // abrir otro movimiento la remonta con sus valores. La sesión sobrevive al
  // cierre para que la hoja tenga contenido mientras corre su salida.
  const [editSession, setEditSession] = useState<{
    expense: Expense
    token: number
  } | null>(null)
  const [isEditOpen, setEditOpen] = useState(false)
  const editTokenRef = useRef(0)

  const handleEditExpense = useCallback(
    (expense: Expense) => {
      void triggerHaptic('selection')
      trackTap('gasto_row_edit', 'list')
      editTokenRef.current += 1
      setEditSession({ expense, token: editTokenRef.current })
      setEditOpen(true)
    },
    [trackTap],
  )

  const handleCloseEdit = useCallback(() => setEditOpen(false), [])

  const handleSubmitEdit = useCallback(
    (payload: { description: string; price: number }) => {
      const expenseId = editSession?.expense.id
      if (!expenseId) return
      // En preview NO escribimos datos reales (la vieja está montada sobre el
      // mismo cache): la hoja se cierra y la mutación queda no-op.
      if (preview) {
        setEditOpen(false)
        return
      }
      updateExpenseMutationRef.current.mutate(
        { description: payload.description, expenseId, price: payload.price },
        {
          onError: () => void triggerHaptic('error'),
          onSuccess: () => {
            void triggerHaptic('success')
            setEditOpen(false)
          },
        },
      )
    },
    [editSession, preview],
  )

  // ── No-spend mark / registrar-olvidado (F3, NO-OP en preview) ──────
  // Los MISMOS hooks que la vieja: la invalidación de cache (streak +
  // marked-days + home_snapshot) refresca el brote del calendario
  // (noSpendMarkedDates ← home_snapshot.no_spend_days_this_cycle) + la racha.
  const markNoSpendMutation = useMarkNoExpenseDay(familyId, userId)
  const unmarkNoSpendMutation = useUnmarkNoExpenseDay(familyId, userId)
  // FIX B (perf): mismas mutaciones RQ (objeto literal nuevo cada render). Sin
  // el ref, handleMarkNoSpend/handleUnmarkNoSpend se recreaban cada render, y
  // con ellos handleMarkSelected/handleUnmarkSelected — que son deps del useMemo
  // del ListHeader → lo reconstruían en cada render. Leídas por ref quedan
  // estables (mismo patrón que las delete mutations de FIX A).
  const markNoSpendMutationRef = useRef(markNoSpendMutation)
  markNoSpendMutationRef.current = markNoSpendMutation
  const unmarkNoSpendMutationRef = useRef(unmarkNoSpendMutation)
  unmarkNoSpendMutationRef.current = unmarkNoSpendMutation

  const handleMarkNoSpend = useCallback(
    (date: Date) => {
      // Preview NO escribe datos reales (la vieja está montada sobre el mismo
      // cache vía freezeOnBlur:false). Solo se marca un día SIN movimientos:
      // ese gate lo pone la presencia del callback (igual que la vieja).
      if (preview) return
      trackTap('mark_no_spend', 'day_detail')
      const iso = formatLocalDateKey(date) // Y-M-D LOCAL (nunca toISOString)
      markNoSpendMutationRef.current.mutate(
        { date: iso },
        {
          onSuccess: () => {
            void triggerHaptic('success')
            confetti.celebrate({ durationMs: 2000, origin: 'top' })
            toast.success(t('gastos:noSpend.markedSuccess'))
          },
          onError: (error: unknown) => {
            void triggerHaptic('error')
            const message =
              error instanceof Error ? error.message : t('gastos:noSpend.unknownError')
            if (message.includes('EXPENSES_EXIST_ON_DATE')) {
              toast.error(t('gastos:noSpend.expensesExist'))
            } else if (message.includes('FUTURE_DATE_NOT_ALLOWED')) {
              toast.error(t('gastos:noSpend.futureDate'))
            } else {
              toast.error(t('gastos:noSpend.markFailed'))
            }
          },
        },
      )
    },
    // markNoSpendMutation por ref (FIX B): identidad ESTABLE.
    [preview, t, trackTap],
  )

  const handleUnmarkNoSpend = useCallback(
    (date: Date) => {
      if (preview) return
      trackTap('unmark_no_spend', 'day_detail')
      const iso = formatLocalDateKey(date)
      unmarkNoSpendMutationRef.current.mutate(
        { date: iso },
        {
          onSuccess: () => {
            void triggerHaptic('selection')
            toast.info(t('gastos:noSpend.unmarkedSuccess'))
          },
          onError: (error: unknown) => {
            void triggerHaptic('error')
            toast.error(
              error instanceof Error ? error.message : t('gastos:noSpend.unmarkFailed'),
            )
          },
        },
      )
    },
    // unmarkNoSpendMutation por ref (FIX B): identidad ESTABLE.
    [preview, t, trackTap],
  )

  const handleRegisterForgotten = useCallback(
    (date: Date) => {
      // Preview NO navega al add-expense real. Live: back-datea con la fecha
      // del día (Y-M-D local) preseleccionada, igual que la vieja.
      if (preview) return
      void triggerHaptic('light')
      trackTap('calendar_register_forgotten', 'calendar', '/(app)/add-expense')
      router.push({
        pathname: '/(app)/add-expense',
        params: { date: formatLocalDateKey(date) },
      })
    },
    [preview, router, trackTap],
  )

  // Valores + callbacks del day-detail del día en foco (todo derivado; el
  // "gastado del día" NO es un campo nuevo: sale del rollup diario).
  //
  // Por ISO. Los índices por día-de-mes (`dailySpend[n]` / `dayMoods[n]`)
  // devuelven la PRIMERA ocurrencia del número, así que en ventana extendida
  // (5-jul → 15-ago, el número se repite) GASTADO, MOVIMIENTOS y el badge
  // "Día de exceso" mostraban los del gemelo de julio. Es la misma raíz que
  // la nav, pero una lectura distinta: el feed de movimientos sale del RPC
  // del día y ya iba por ISO; estas tres tarjetas salen del rollup del ciclo.
  const daySelected = controller.selectedDay != null
  const selectedDaySpend =
    controller.selectedDayIso != null
      ? controller.dailySpendByIso[controller.selectedDayIso]
      : controller.selectedDay != null
        ? controller.dailySpend[controller.selectedDay]
        : undefined
  const dayGastado = formatMoney(selectedDaySpend?.total ?? 0)
  const dayMovs = String(selectedDaySpend?.count ?? 0)
  const dayHasMovs = (selectedDaySpend?.count ?? 0) > 0
  const selectedDayMood =
    controller.selectedDayIso != null
      ? controller.dayMoodsByIso[controller.selectedDayIso]
      : controller.selectedDay != null
        ? controller.dayMoods[controller.selectedDay]
        : undefined
  // Badge = solo "Día de exceso" (amber/red). Bien/marcado → sin badge (el
  // brote del calendario + el botón "Revertir" comunican el estado marcado).
  const dayBadge =
    selectedDayMood === 'amber' || selectedDayMood === 'red'
      ? t('gastos:calendar.mood.over')
      : null
  const dayIsToday = selectedDate
    ? startOfLocalDay(selectedDate).getTime() === todayStartMs
    : false
  // v2 · DS-4 — el día todavía no llegó. Los días futuros ya eran navegables
  // con ‹ › (la nav clampea al ciclo, no a hoy), pero mostraban "$0 / 0 mov" y
  // ofrecían "registrar gasto olvidado" y "marcar día sin gastos" para un día
  // que no ocurrió — la mutación de marcar ya lo rechazaba en el server
  // (`noSpend.futureDate`), así que el CTA era una promesa falsa.
  const dayIsFuture = selectedDate
    ? startOfLocalDay(selectedDate).getTime() > todayStartMs
    : false
  const dayIsMarked = selectedDate
    ? noSpendMarkedDates.has(formatLocalDateKey(selectedDate))
    : false
  // El día elegido cayó DESPUÉS del fin nominal → entró de extendido porque
  // el cobro no se confirmó. `cycleNominalEnd` es exclusivo.
  const dayIsExtendido =
    selectedDate != null &&
    controller.cycleIsExtended &&
    startOfLocalDay(selectedDate).getTime() >=
      startOfLocalDay(controller.cycleNominalEnd).getTime()
  // Chips del day-detail. Se ACUMULAN: las condiciones no son excluyentes y
  // el ternario de prioridad que había antes tapaba información — un día
  // extendido que además se pasó del cupo mostraba sólo "Día de exceso" y el
  // owner no se enteraba de que ese día había entrado de más.
  //
  // Orden: primero qué pasó con el gasto (el logro gana sobre el exceso: si
  // el día está marcado sin gastos, no hay exceso que contar), después el
  // encuadre del día. Un día futuro no lleva ninguno de los dos.
  const dayChips = useMemo(() => {
    const out: { label: string; tone: GastosBadgeTone }[] = []
    if (!dayIsFuture) {
      if (dayIsMarked) out.push({ label: t('gastos:calendar.cleanDayBadge'), tone: 'good' })
      else if (dayBadge) out.push({ label: dayBadge, tone: 'warn' })
    }
    if (dayIsExtendido) out.push({ label: t('gastos:overdue.extBadge'), tone: 'ext' })
    return out
  }, [dayIsFuture, dayIsMarked, dayBadge, dayIsExtendido, t])
  const handleRegisterSelected = useCallback(() => {
    if (selectedDate) handleRegisterForgotten(selectedDate)
  }, [selectedDate, handleRegisterForgotten])
  const handleMarkSelected = useCallback(() => {
    if (selectedDate) handleMarkNoSpend(selectedDate)
  }, [selectedDate, handleMarkNoSpend])
  const handleUnmarkSelected = useCallback(() => {
    if (selectedDate) handleUnmarkNoSpend(selectedDate)
  }, [selectedDate, handleUnmarkNoSpend])

  // ── CTAs del día FUERA-DE-CICLO (pedido owner 2026-07-28) ──────────
  //
  // Antes el day-detail de un día `fuera` iba con `showCtas={false}` (decisión
  // [D] del cableado F5): la idea era que un día fuera del ciclo es "solo
  // lectura" hasta confirmar el cobro. En la práctica son días REALES y
  // PASADOS — el ciclo está congelado esperando la confirmación, pero el
  // usuario sigue viviendo: gastó, o no gastó, y quiere registrarlo.
  //
  // El backend los acepta sin ningún caso especial (verificado en las
  // migraciones, no asumido):
  //   · `mark_no_expense_day` solo rechaza FUTURE_DATE_NOT_ALLOWED y
  //     EXPENSES_EXIST_ON_DATE — no tiene noción de ciclo.
  //   · `home_snapshot.no_spend_days_this_cycle` agrega
  //     `marked_date >= cycle_start AND marked_date <= current_date`, o sea
  //     SIN tope en el fin del ciclo → una marca de un día fuera vuelve en el
  //     set y el estado "marcado/revertir" se refleja igual que in-cycle.
  //   · el gasto back-dateado cae bajo `expenseQueryKeys.family`, que es el
  //     prefijo de `outOfCycleQuery` → aparece en el bucket del día sin nada
  //     extra.
  //
  // Las MISMAS reglas que in-cycle, aplicadas al día fuera:
  //   · "registrar olvidado" solo en días pasados (hoy TAMBIÉN es un día
  //     fuera cuando el ciclo está vencido — `outWindow` llega hasta hoy
  //     inclusive — y para hoy el camino es el + normal);
  //   · "marcar sin gastos" solo con 0 movimientos y sin marca previa;
  //   · "revertir" solo si ya está marcado.
  const outDayIsToday = selectedOutDay != null && selectedOutDay.dateMs === todayStartMs
  const outDayIsMarked = selectedOutDay != null && noSpendMarkedDates.has(selectedOutDay.iso)
  const outDayHasMovs = (selectedOutBucket?.count ?? 0) > 0
  const handleRegisterOutDay = useCallback(() => {
    if (selectedOutDay) handleRegisterForgotten(selectedOutDay.date)
  }, [selectedOutDay, handleRegisterForgotten])
  const handleMarkOutDay = useCallback(() => {
    if (selectedOutDay) handleMarkNoSpend(selectedOutDay.date)
  }, [selectedOutDay, handleMarkNoSpend])
  const handleUnmarkOutDay = useCallback(() => {
    if (selectedOutDay) handleUnmarkNoSpend(selectedOutDay.date)
  }, [selectedOutDay, handleUnmarkNoSpend])

  // ── F5 · Confirmar cobro (REUSO EXACTO de la lógica de la Home) ─────
  // Gate OWNER-ONLY: family_finance es owner-only por RLS → solo el dueño
  // confirma/cierra el ciclo (no-owner: banner informativo, sin CTA). Gate
  // PREVIEW: la mutación es NO-OP en la ruta dev (no cerramos el mes real; la
  // Gastos vieja está montada sobre el mismo cache vía freezeOnBlur:false).
  // Ambos gates son INDEPENDIENTES: la mutación corre solo si
  // `isFamilyOwner && !preview`.
  const sessionUserId = useAuthSession().data?.user?.id
  const isFamilyOwner = useMyFamilyRole(sessionUserId, familyId).data === 'owner'
  const splashIsHidden = !useIsAuthOverlayVisible()
  const savingsGoalQuery = useSavingsGoal(familyId)
  const isDynamicIncome = controller.incomeMode === 'dynamic'
  const storedCycleAnchor = dashboard.familyFinanceQuery.data?.current_cycle_anchor ?? null
  const isOnboardingFlow = !isDynamicIncome && storedCycleAnchor == null
  // `pending` del orquestador — CÓMPUTO IDÉNTICO al de la Home neo
  // (neo-home-screen: isPaydayPending sobre el ciclo CONGELADO). NO
  // `isSalaryPendingConfirmation` (payday del mes corriente → true apenas pasa
  // el payday, aun con el ciclo congelado): eso divergiría del gate del
  // auto-open del decision-sheet que usa la Home. Mismas fuentes que la Home:
  // payCycle = dashboard.payCycle (frozen), lastConfirmedAt = family_finance,
  // isDynamicIncome = resolveIncomeMode (misma señal que dashboard.incomeMode).
  // `today` es inerte en isPaydayPending (param `_today`); usamos controller.today
  // (mismo usePayCycle) para mantener las deps consistentes.
  const lastConfirmedAt =
    dashboard.familyFinanceQuery.data?.last_salary_confirmed_at ?? null
  const payCycle = dashboard.payCycle
  const pending = useMemo(
    () =>
      isDynamicIncome
        ? false
        : isPaydayPending({ cycle: payCycle, lastConfirmedAt }, controller.today),
    [isDynamicIncome, payCycle, lastConfirmedAt, controller.today],
  )
  const activeGoalForSheet = useMemo(() => {
    const g = savingsGoalQuery.data
    if (!g || g.isActive === false) return null
    // Montos incluidos: la barra de progreso de la opción "Destinar a mi
    // meta" del wrapped (pantalla 06) los necesita.
    return {
      id: g.id,
      title: g.title,
      emoji: g.emoji,
      currentAmount: g.currentAmount,
      goalAmount: g.goalAmount,
    }
  }, [savingsGoalQuery.data])
  // Nombres display de categoría para el payload del wrapped — mismo shape que
  // la Home le pasa al orquestador.
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const [id, c] of controller.categoriesById) map.set(id, c.name)
    return map
  }, [controller.categoriesById])

  // ── F6 · CONSOLIDACIÓN DEL ORQUESTADOR DE CIERRE (crítico pre-swap) ──
  // MISMO hook que la Home (wrapped + decisión del sobrante + invalidaciones).
  // DECISIÓN: la HOME es la ÚNICA dueña del AUTO-OPEN. La Home ya está live y
  // corre useMonthCloseOrchestration con enabled:true — es SIEMPRE un tab
  // montado (freezeOnBlur:false), así que cualquier cierre pendiente lo cazan
  // sus efectos auto. Cuando Gastos vaya live junto a la Home, AMBAS pantallas
  // correrían este hook; con enabled:true en las dos se DUPLICARÍA (a) el
  // auto-open del MonthCloseDecisionSheet — dos Modals nativos apilados — y (b)
  // el auto-fire del wrapped dinámico — doble replay + doble mark-seen. Por eso
  // Gastos pasa `enabled: false`: NUNCA auto-abre ni auto-dispara. Esto
  // preserva EXACTO el comportamiento de producción de hoy (la Home ya es la
  // única dueña) — cero cambio de conducta, cero riesgo de doble-disparo. NO se
  // usa focus-gating (useIsFocused) porque exigiría gatear también la Home por
  // foco, y hoy la Home auto-abre sin importar el tab activo → sería regresión.
  // `enabled` NO gatea el callback manual `fireWrappedForClosedCycle`: el flujo
  // de confirmar-cobro de F5 (banner vencido → CycleBalanceSheet → confirm) lo
  // sigue llamando, y el wrapped resuelve la decisión del sobrante INLINE en su
  // closing scene (onApplyLeftoverDecision). El MonthCloseDecisionSheet
  // standalone NO se monta en Gastos (era su único disparador el auto-open, ya
  // apagado; cualquier fallback de ciclo-vacío lo cubre la Home).
  //
  // `enabled:false` es CORRECTO para el preview de hoy: Gastos es preview-only,
  // su confirmar-cobro no-opea (ver `runConfirmCobro`) y ninguno de los efectos
  // auto corre → cero doble-disparo hoy. NO hay lock cross-instancia acá (se
  // removió: introducía defectos latentes propios en el flujo de dinero, entre
  // ellos un Set module-level que nunca se limpiaba y suprimía el fallback
  // legítimo del MonthCloseDecisionSheet del sobrante tras un remount de la Home
  // — regresión vs prod; el doble-open que intentaba tapar es LATENTE, imposible
  // mientras Gastos sea preview-only).
  //
  // BLOCKER PENDIENTE del swap F6: cuando Gastos vaya LIVE junto a la Home, su
  // fireWrapped manual invalidará `monthCloseDecisionQueryKey` GLOBAL → la Home
  // (enabled:true, siempre montada) refetchea `pendingDecision` y, con sus
  // guards per-instancia limpios, auto-abriría el standalone para la MISMA
  // decisión que el wrapped de Gastos ya lleva integrada → DOBLE superficie. Eso
  // hay que RESOLVERLO en el swap consolidando el orquestador: atando la
  // supresión cross-instancia al CICLO DE VIDA DE DISPLAY del wrapped (mientras
  // su closing scene está en pantalla), NO a la ventana async del fire ni de
  // forma permanente, y testeándolo end-to-end con AMBAS pantallas live. NO
  // reintroducir el lock removido.
  const { fireWrappedForClosedCycle } = useMonthCloseOrchestration({
    familyId,
    sessionUserId,
    isOnboardingFlow,
    isDynamicIncome,
    pending,
    splashIsHidden,
    categoryNameById,
    activeGoalForSheet,
    t,
    // Home = dueña única del auto-open. Ver bloque de arriba.
    enabled: false,
  })

  const [isCycleBalanceSheetOpen, setCycleBalanceSheetOpen] = useState(false)
  const remainingDaysInCycle = Math.max(1, dashboard.remainingUntilPayday)
  const handleOpenConfirmSheet = useCallback(() => {
    void triggerHaptic('selection')
    trackTap('confirm_cobro', 'overdue')
    setCycleBalanceSheetOpen(true)
  }, [trackTap])
  const handleCycleSheetClose = useCallback(() => {
    if (isSavingSalary) return
    setCycleBalanceSheetOpen(false)
  }, [isSavingSalary])
  // Gate combinado: la confirmación real corre SOLO si dueño && !preview. El
  // CTA del banner ya se oculta al no-owner; este gate es defensa en profundidad
  // + el no-op de preview. Al confirmar: MISMO comportamiento que la Home —
  // upsert de family_finance + fireWrapped (sheet/haptic/toast + invalidaciones
  // de pay-cycle/snapshot/home_snapshot/controller vienen del reuso de hooks).
  const runConfirmCobro = useCallback(
    (startingBalance: number | null) => {
      setCycleBalanceSheetOpen(false)
      if (preview) {
        toast.info(t('gastos:overdue.previewNoop'))
        return
      }
      if (!isFamilyOwner) return
      confirmCycleStartingBalance(startingBalance)
      void fireWrappedForClosedCycle()
      // La edición recién cerrada NO la refresca fireWrapped (invalida
      // family_finance/gastos-snapshot/home_snapshot/controlIntelligence pero
      // NO monthlyEditions, que es su propia query con staleTime 5min +
      // initialData no-reactiva) → sin esto no aparece en la CycleDropdown
      // hasta 5min/remount. Gateado naturalmente: ya retornó temprano si
      // preview o no-owner.
      void queryClient.invalidateQueries({ queryKey: monthlyEditionsQueryKey(familyId) })
    },
    [
      preview,
      isFamilyOwner,
      confirmCycleStartingBalance,
      fireWrappedForClosedCycle,
      queryClient,
      familyId,
      t,
    ],
  )
  const handleCycleSheetSave = useCallback(
    (amount: number) => runConfirmCobro(amount),
    [runConfirmCobro],
  )
  const handleCycleSheetKeepDefault = useCallback(
    () => runConfirmCobro(null),
    [runConfirmCobro],
  )

  // Copy del banner derivado de datos reales: "terminó el {día}" = último día
  // DENTRO del ciclo (cycleEnd es exclusivo → −1 día); "N días … fuera" =
  // cantidad de días de la ventana fuera (== nº de celdas fuera).
  // Se rotula con el fin NOMINAL, no con el real. Con la ventana ESTIRADA
  // el fin real es hoy+1, así que "Tu ciclo terminó el {{day}}" decía HOY —
  // una afirmación falsa: el ciclo no terminó, se está estirando hasta que
  // confirmes el cobro (QA del owner 2026-08-13).
  const overdueTitleDay = useMemo(() => {
    const ref = controller.cycleNominalEnd
    const last = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 1)
    return last.getDate()
  }, [controller.cycleNominalEnd])

  // Secciones del feed con un día FUERA en foco: los gastos de ese día
  // (mapeados a MovementItem, sort por hora desc). Sin income intercalado — la
  // "fuera" es sobre gastos que pasan al próximo ciclo al confirmar.
  const outDaySections = useMemo<MovimientosSection[]>(() => {
    if (!selectedOutDay || !selectedOutBucket) return []
    const items: MovementItem[] = selectedOutBucket.items
      .map((e) => ({ kind: 'expense' as const, iso: e.created_at, expense: e }))
      .sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0))
    return [
      {
        title: formatWeekdayDayMonth(selectedOutDay.date),
        day: selectedOutDay.dayOfMonth,
        dateMs: selectedOutDay.dateMs,
        total: selectedOutBucket.total,
        data: items,
        incomes: [],
      },
    ]
  }, [selectedOutDay, selectedOutBucket])
  // Foco en un día FUERA resuelto (el iso mapea a un día real de la ventana).
  // Gatea feed/footer/onEndReached: si la ventana se vacía mientras hay un iso
  // seleccionado (p.ej. tras confirmar), esto vuelve a false y el feed retoma
  // las day-groups del ciclo — sin mismatch calendario↔feed.
  const isOutDayFocused = selectedOutDay != null

  // ── Pull-to-refresh (lectura pura; ok en preview) ──────────────────
  const [isRefreshing, setIsRefreshing] = useState(false)
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    // `gastos.refreshed` — MISMO evento que la vieja (gateado en preview).
    if (!preview) {
      void logScreenEvent({
        familyId,
        event: 'gastos.refreshed',
        context: { session_id: telemetryRef.current.sessionId },
      })
    }
    try {
      await controllerRef.current.refetchAll()
    } finally {
      setIsRefreshing(false)
    }
    // `controller` por ref (FIX B): su objeto de retorno es un literal nuevo por
    // render, así que tenerlo en deps recreaba `handleRefresh` → recreaba el
    // elemento `refreshControl` → prop nuevo en la SectionList → la lista
    // (PureComponent) NUNCA hacía bail-out y reconciliaba el subárbol entero.
  }, [preview, familyId])

  // FIX F (perf) · el `refreshControl` era un ELEMENTO INLINE: identidad nueva
  // en cada render de `NeoGastosContent` (que re-renderiza seguido — ~25
  // observers de RQ). `SectionList` es un PureComponent y `VirtualizedList`
  // extiende `StateSafePureComponent`: si TODOS sus props son shallow-equal se
  // saltan el subárbol completo. Un solo prop inestable anula ese bail-out para
  // toda la lista, o sea que el trabajo de memoizar filas y ListHeader quedaba
  // a medias. Memoizado, un render cuyos 7 sub-bloques no cambiaron ya no toca
  // celdas.
  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        tintColor={s.text}
        colors={[s.text]}
        // Android dibuja el spinner sobre un DISCO propio, blanco por default:
        // sobre el canvas oscuro del modo dark aparecía como un parche brillante
        // ajeno al sistema neumórfico. Con el color de card el disco se integra
        // y la flecha (s.text sobre s.cardBackground) conserva el contraste del
        // par aprobado.
        progressBackgroundColor={s.cardBackground}
      />
    ),
    [isRefreshing, handleRefresh, s.text, s.cardBackground],
  )

  // Paginación — dos caminos distintos:
  // - handleLoadMore (botón "Ver días anteriores"): acción EXPLÍCITA → carga sí
  //   o sí. Estable (controllerRef) para que el ListFooter memoizado aguante.
  // - handleEndReached (auto al llegar al FONDO REAL): GATEADO por scroll de
  //   usuario. Sin el gate, con contenido inicial corto `onEndReached` dispara
  //   en loop apenas monta y trae TODAS las páginas de una (los 105
  //   movimientos) — por eso el gate es LOAD-BEARING ahora que la 1ª página
  //   volvió a 2 días y el contenido inicial es corto de nuevo (el threshold
  //   bajo ayuda, pero no alcanza solo: al montar, `distanceFromEnd` ya es 0 si
  //   el contenido no llena el viewport). El flag arranca false → no carga al
  //   montar; lo prende el 1er drag del usuario y se RESETEA tras cada fetch →
  //   como mucho 1 página por gesto (sin cascada).
  //   `controller.fetchNextPage` ya guardea contra
  //   hasNextPage/isFetchingNextPage.
  const handleLoadMore = useCallback(() => {
    void controllerRef.current.fetchNextPage()
  }, [])
  const canPaginateRef = useRef(false)
  const handleEndReached = useCallback(() => {
    if (!canPaginateRef.current) return
    canPaginateRef.current = false
    void controllerRef.current.fetchNextPage()
  }, [])

  // EL FLAG NO SOBREVIVE A UN CAMBIO DE CONTENIDO NO-SCROLL.
  //
  // El gate se prende con el 1er drag y, hasta acá, solo se apagaba al disparar
  // `handleEndReached` o al salir a otra tab: quedaba PEGAJOSO. RN llama
  // `_maybeCallOnEdgeReached()` también desde `_onContentSizeChange`
  // (VirtualizedList), así que un ENCOGIMIENTO del contenido con el flag armado
  // dispara `onEndReached` sin que el usuario esté cerca del fondo. Repro: el
  // usuario arrastra un poco sin llegar al final (arma el flag) → toca un día
  // del calendario → el feed colapsa a UNA sección → contentSizeChange →
  // paginación invisible (al limpiar el día aparecen 4 días en vez de 2). Mismos
  // caminos: filtrar por categoría, borrar filas, limpiar el foco de día.
  //
  // El orden nos favorece: `_onContentSizeChange` invoca el callback del
  // usuario ANTES de `_maybeCallOnEdgeReached()`, así que desarmar acá gana la
  // carrera. Un CRECIMIENTO no toca el flag (es el caso de la página nueva que
  // acaba de entrar, y ahí el flag ya está abajo por `handleEndReached`).
  //
  // Solo se cablea en el feed: la rama vacío/cerrado no pagina.
  const lastFeedContentHeightRef = useRef(0)
  const handleFeedContentSizeChange = useCallback(
    (width: number, height: number) => {
      if (height < lastFeedContentHeightRef.current) canPaginateRef.current = false
      lastFeedContentHeightRef.current = height
      handleTourContentSizeChange(width, height)
    },
    [handleTourContentSizeChange],
  )

  // RESET DE PAGINACIÓN AL SALIR (fix "al entrar se cargan los 105").
  //
  // El gate de arriba es correcto y NO se toca: en un montaje limpio trae 1
  // página por gesto. El problema era que "montaje limpio" no volvía a pasar
  // nunca — la tab se pre-monta (`lazy:false`) y no se desmonta al cambiar de
  // tab (`freezeOnBlur:false`), así que `data.pages` del infinite query crecía
  // monótono durante toda la sesión (y RQ v5 re-fetchea TODAS las páginas
  // cargadas en cada invalidación de realtime). Ver la nota larga en
  // `useGastosController.resetPagination`.
  //
  // FIX A1 · DISCRIMINAR EL BLUR. El cleanup del `useFocusEffect` corre en
  // CUALQUIER blur, no solo al cambiar de tab. Desde Gastos se pushea
  // add-expense / jardín / (day-detail) sobre el STACK padre `(app)`; eso
  // desfoca Gastos igual que un cambio de tab. Reseteando en TODO blur, volver
  // de add-expense/jardín tiraba las páginas ya cargadas (round-trips pagados)
  // y el scroll → el usuario reaparecía arriba de todo con 1 página.
  //
  // Cómo distinguimos: `navigation` es el navigator de TABS. Un PUSH encima NO
  // cambia la tab activa (Gastos sigue siendo `routes[index]`), un cambio de
  // tab SÍ (pasa a una hermana). Solo reseteamos cuando confirmamos que la tab
  // activa YA NO es 'expenses'. Si no podemos confirmarlo (estado raro), CONSER-
  // VAMOS (no reseteamos): el costo de conservar de más es que el re-entry desde
  // otra tab muestre más páginas — nunca perder el estado del usuario.
  //
  // Lo hacemos en el BLUR y no en el focus: la pantalla ya no está visible, así
  // que recortar el cache + volver el scroll a 0 no produce salto. Al re-entrar
  // desde una tab hermana, Gastos arranca como en cold-start: 1ª página, arriba.
  //
  // También bajamos `canPaginateRef`: si el último gesto del usuario había
  // dejado el flag prendido, el shrink del contenido dispararía `onEndReached`
  // y adelantaría una página sin que nadie scrollee.
  useFocusEffect(
    useCallback(
      () => () => {
        const navState = navigation.getState()
        const activeRouteName =
          navState && navState.routes ? navState.routes[navState.index]?.name : undefined
        // Blur por PUSH encima (Gastos sigue siendo la tab activa) o estado
        // indeterminado → conservar páginas + scroll.
        //
        // OJO al medir: este discriminante asume el navigator de TABS (routes =
        // tabs, la activa 'expenses'). En la ruta dev de preview
        // (settings/dev/neo-gastos, montada en el stack (app)) getState() son
        // rutas de stack cuya activa nunca es 'expenses' → ahí siempre resetea
        // en cualquier push. Es solo el harness dev: la tab real anda bien.
        // Validá "volver de add-expense conserva scroll+páginas" EN LA TAB.
        const leftToSiblingTab = activeRouteName != null && activeRouteName !== 'expenses'
        if (!leftToSiblingTab) return
        // Incondicional: es barato y evita que el shrink dispare `onEndReached`.
        canPaginateRef.current = false
        // El scroll SOLO se rebobina si de verdad se recortaron páginas. Con una
        // sola página cargada `resetPagination` es no-op, así que el contenido
        // que hay al volver es el mismo que había al salir y no hay motivo para
        // perder la posición del usuario: volver de Inicio ahora te deja donde
        // estabas. Con varias páginas se sigue rebobinando — el contenido se
        // achica bajo el viewport y sin el rewind iOS clampearía el offset en el
        // próximo layout, que se ve como un salto.
        //
        // NO cierra el caso grande: quien scrollea hasta el fondo del feed
        // normalmente ya paginó (la 1ª página son 2 días y la auto-paginación se
        // prende con el primer drag), así que ahí sigue reseteando. Conservar el
        // scroll SIEMPRE exige soltar el recorte de páginas, y eso reabre el
        // re-fetch de N páginas por invalidación de realtime que motivó esta
        // política — es una decisión de producto, no un bug.
        void controllerRef.current.resetPagination().then((trimmed) => {
          if (!trimmed) return
          tourScrollRef.current?.getScrollResponder()?.scrollTo({ y: 0, animated: false })
        })
      },
      [navigation],
    ),
  )

  // ── Handlers de borde del gesto de scroll ──────────────────────────
  //
  // Única responsabilidad: mantener fresco el `scrollYRef` del tour. El
  // `onScroll` por-frame se cablea SOLO con el tour activo (ver `isTourActive`),
  // así que el resto del tiempo son los bordes del gesto los que sincronizan la
  // Y — el tour arranca en foco/first-run, nunca a mitad de gesto.
  //
  // REVERTIDO (A/B contra la pantalla VIEJA) · acá vivía además una máquina de
  // estados (`isScrolling` + timers idle/fallback) que PAUSABA las partículas
  // del hero durante el gesto. La vieja corre sus partículas SIN pausarlas y
  // scrollea fluida en el mismo device con los mismos datos → las partículas no
  // eran la causa del jank (lo era la composición nativa de la fila). Y la
  // pausa costaba 2 commits de React sobre el subárbol del hero POR GESTO,
  // justo durante el gesto que queremos fluido. Se conserva SOLO el gate por
  // FOCO (`paused={!isFocused}`), que es win puro: con `freezeOnBlur:false` el
  // hero queda montado en otra tab y su campo seguiría grabando un SkPicture
  // por frame para nadie.
  const handleScrollStart = handleTourScroll
  // Solo el FEED: además habilita la auto-paginación (gate original intacto —
  // se prende con el 1er drag REAL del usuario). Las ramas vacío/cerrado usan
  // `handleScrollStart` pelado: no paginan, y prender el flag ahí adelantaría
  // una página al volver al ciclo actual.
  const handleScrollBeginDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      canPaginateRef.current = true
      handleTourScroll(event)
    },
    [handleTourScroll],
  )
  const handleScrollEndDrag = handleTourScroll
  const handleMomentumScrollEnd = handleTourScroll

  // `paused` efectivo de TODOS los loops decorativos de la pantalla: fuera de
  // foco (otra tab, subárbol montado pero invisible por `freezeOnBlur:false`).
  // Durante el scroll NO se pausa (ver arriba). Lo consumen las partículas del
  // hero (`BrotParticles`, un `useFrameCallback` + un SkPicture por frame) y el
  // dot "EN CURSO" del trigger de ciclo (`withRepeat(-1)`, late mientras el
  // ciclo esté en curso) — ninguno de los dos tiene fin natural, así que el
  // gate de foco les ahorra trabajo real por frame.
  const pausedParticles = !isFocused

  // El halo de los días FUERA-DE-CICLO va por un booleano APARTE, gateado
  // ADEMÁS por `isOverdue`. Motivo (perf, no cosmética): el `withRepeat` que
  // este flag pausa vive en `FueraGlow`, que monta EXCLUSIVAMENTE en celdas
  // `kind === 'fuera'` — y esas celdas solo existen con el ciclo vencido
  // (`calendarCells` las concatena bajo `isOverdue`). Con el flag general, cada
  // cambio de foco de tab invalidaba el `calendarBlock` y re-renderizaba las
  // ~35 `DayCellView` memoizadas SIN pausar un solo worklet (no había ninguno
  // corriendo). Gateado por `isOverdue`, en el caso común el valor queda
  // constante en `false` → el useMemo conserva la identidad del elemento y
  // React hace bail-out de todo el subárbol del calendario; con ciclo vencido
  // se comporta igual que antes y el halo sí se pausa.
  const pausedFueraGlow = pausedParticles && isOverdue

  // A11Y del calendario · la copy del label de lector de las celdas ("Día 7,
  // hoy, marcado sin gastos") la arma LA PANTALLA con `t()` y baja por prop: el
  // kit es `@i18n-ignore-file`, así que un literal allá se le escapa a
  // `check-i18n-hardcoded` y un usuario en EN escucharía las ~35 celdas en
  // español. Memoizado por `t` (identidad estable salvo cambio de idioma): es
  // prop de `DayCellView`, que es React.memo — un objeto nuevo por render
  // anularía la memo de toda la grilla.
  const calendarA11y = useMemo<CalendarA11yStrings>(
    () => ({
      dayPrefix: t('gastos:calendar.dayA11y.dayPrefix'),
      marked: t('gastos:calendar.dayA11y.marked'),
      kinds: {
        ok: t('gastos:calendar.dayA11y.ok'),
        bad: t('gastos:calendar.dayA11y.bad'),
        now: t('gastos:calendar.dayA11y.now'),
        fut: t('gastos:calendar.dayA11y.fut'),
        fuera: t('gastos:calendar.dayA11y.fuera'),
        empty: t('gastos:calendar.dayA11y.empty'),
        none: t('gastos:calendar.dayA11y.none'),
      },
    }),
    [t],
  )

  // FIX F (perf) · estos estilos eran ARRAYS INLINE: literal nuevo por render →
  // prop inestable → la SectionList/ScrollView (PureComponent) no hacía
  // bail-out. Solo dependen del inset inferior, que cambia una vez por rotación.
  const listContentStyle = useMemo(
    // El TOP lleva el inset acá (no en el Screen, que va con `ownInsets`):
    // así la lista se dibuja de borde a borde y su contenido PASA por
    // debajo de la isla, que es lo que el edge effect difumina.
    // `insets.top` PISA el paddingTop 14 de la base (no se suma): así el
    // contenido arranca a la misma altura que Home/Fijos/Control, que
    // usan `Math.max(callerTop, insets.top)` en el Screen.
    () => [
      styles.listContent,
      // MISMO despeje que las otras tres tabs (la SectionList no pasa por el
      // contentContainer del `Screen`, así que lo aplica a mano). Reservaba 96:
      // 48 pt menos que el resto y por debajo del tope del disco del FAB, que
      // podía taparle la última fila.
      { paddingTop: insets.top, paddingBottom: insets.bottom + TAB_SCREEN_BOTTOM_CLEARANCE },
    ],
    [insets.top, insets.bottom],
  )
  const emptyScrollContentStyle = useMemo(
    // Mismo inset superior que `listContentStyle`: con `ownInsets` el
    // Screen ya no aporta padding, así que CADA superficie de scroll de
    // esta pantalla tiene que aplicarlo. Sin esto el header chocaba con
    // la isla dinámica en el estado vacío.
    () => [
      styles.emptyScroll,
      { paddingTop: insets.top, paddingBottom: insets.bottom + TAB_SCREEN_BOTTOM_CLEARANCE },
    ],
    [insets.top, insets.bottom],
  )

  // ── SectionList renderers ──────────────────────────────────────────
  // v2 · M-3 — con un día FUERA en foco, el feed muestra SOLO ese día, así que
  // todas sus filas llevan la nota. Un string (o undefined) es prop estable →
  // no derrota la memo de las filas.
  // M-3 · nota del grupo de movimientos. En EXTENDIDO el gasto no está en
  // limbo: ya está contado en este ciclo, así que la nota lo dice en vez de
  // anunciar una mudanza que no va a pasar.
  const outRowNote = isOutDayFocused
    ? t('gastos:overdue.rowNote')
    : dayIsExtendido
      ? t('gastos:overdue.extRowNote')
      : undefined
  const keyExtractor = useCallback(
    (item: MovementItem) =>
      item.kind === 'expense' ? `e-${item.expense.id}` : `i-${item.income.id}`,
    [],
  )

  // FIX B (perf): RQ v5 `useMutation` retorna un objeto literal NUEVO cada
  // render → tenerlos en las deps del `renderItem` lo recreaba cada render
  // (aun sin borrado en vuelo). Derivamos PRIMITIVOS estables — el id de la
  // fila en vuelo, o undefined — y usamos ESOS en el cuerpo y las deps: el
  // `renderItem` sólo cambia de identidad cuando cambia QUÉ fila se está
  // borrando (no en cada scroll/paginación). Complementa el React.memo de
  // MovementRow.
  const deletingExpenseId = deleteExpenseMutation.isPending
    ? deleteExpenseMutation.variables
    : undefined
  const deletingIncomeId = deleteIncomeMutation.isPending
    ? deleteIncomeMutation.variables?.id
    : undefined

  // Solo el `isDeleting` de la fila en vuelo cambia por render; el resto de los
  // props que baja `renderItem` son estables → `MovementRow` (React.memo) salta
  // el re-render de las ~60-70 filas montadas y solo reconcilia la que borra
  // (FIX 4). El VM/a11y/actions se arman DENTRO de MovementRow.
  const renderItem = useCallback(
    ({ item }: { item: MovementItem }) => {
      const isDeleting =
        item.kind === 'expense'
          ? deletingExpenseId === item.expense.id
          : deletingIncomeId === item.income.id
      return (
        <MovementRow
          item={item}
          mode={mode}
          s={s}
          categoriesById={controller.categoriesById}
          memberById={memberById}
          t={t}
          isDeleting={isDeleting}
          onDeleteExpense={handleDeleteExpense}
          onDeleteIncome={handleDeleteIncome}
          onEditExpense={handleEditExpense}
          outNote={outRowNote}
        />
      )
    },
    [
      mode,
      s,
      t,
      controller.categoriesById,
      memberById,
      handleDeleteExpense,
      handleDeleteIncome,
      handleEditExpense,
      deletingExpenseId,
      deletingIncomeId,
      outRowNote,
    ],
  )

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<MovementItem, MovimientosSection> }) => {
      const sec = section as MovimientosSection
      return (
        <View style={styles.sectionHeaderWrap}>
          <GastosMovDayHeader
            mode={mode}
            label={sec.title.toUpperCase()}
            total={sec.total > 0 ? `${MINUS}${formatMoney(sec.total)}` : ''}
          />
        </View>
      )
    },
    [mode],
  )

  // Chrome encima de la lista virtualizada: header + hero + calendario + filtro
  // + encabezado "MOVIMIENTOS". FIX C (perf): antes era UN solo useMemo con ~45
  // deps → cualquier interacción (toggle dropdown, cambio de filtro, foco de
  // día) recomputaba y reconciliaba TODO el header, incluido el hero (CardPar-
  // ticles + CategoryBars) y el calendario de 30+ celdas. Ahora se parte en
  // sub-bloques memoizados con deps ESTRECHAS; el `ListHeader` final solo los
  // COMPONE. Como cada bloque conserva su identidad de elemento mientras sus
  // deps no cambian, React hace bail-out de ese subárbol (los componentes del
  // kit NO están en React.memo, así que el bail-out por identidad de elemento es
  // lo que evita reconciliarlos). Los TourTarget viven DENTRO de cada bloque →
  // su registro/refs no se tocan. Orden visual idéntico.

  // ① header (streak) — el kit no expone ref del botón Brot/jardín (donde vive
  //    el badge de racha) → el paso resalta el header entero.
  const headerBlock = useMemo(
    () => (
      <GastosTourStep
        preview={preview}
        order={GASTOS_TOUR_STEPS.streak.order}
        text={GASTOS_TOUR_STEPS.streak.text}
        highlight={{ borderRadius: GASTOS_RADII.card, padding: 6, pulse: true }}
      >
        <GastosHeader
          mode={mode}
          cycleLabel={controller.cycleLabel}
          cycleVariant="current"
          brotPose={brotPose}
          badgeCount={badgeCount}
          // El dot "EN CURSO" corre un withRepeat(-1) sin gate propio: mismo
          // criterio que las partículas del hero (pausa al salir de la tab, que
          // con freezeOnBlur:false deja el header montado e invisible).
          paused={pausedParticles}
          // Brot del botón del jardín SIN loop Skia: este header vive dentro
          // del ListHeaderComponent de la SectionList, así que su
          // PictureRecorder por frame competía con el gesto del feed. Mismo
          // criterio que el banner VENCIDO y el strip del day-detail — y el
          // default del kit (`true`) queda intacto para el preview aprobado.
          animated={false}
          onPressBrot={handlePressGarden}
          onToggleDropdown={handleToggleDropdown}
        />
      </GastosTourStep>
    ),
    [
      preview,
      mode,
      controller.cycleLabel,
      brotPose,
      badgeCount,
      pausedParticles,
      handlePressGarden,
      handleToggleDropdown,
    ],
  )

  // ② dropdown de ciclo (conditional).
  const dropdownBlock = useMemo(
    () =>
      isDropdownOpen ? (
        <CycleDropdown mode={mode} items={dropdownItems} onSelect={handleSelectCycle} />
      ) : null,
    [isDropdownOpen, mode, dropdownItems, handleSelectCycle],
  )

  // ③ Aviso del ciclo. v2 parte el banner en DOS (Componentes §03):
  //    · B-1 (Brot `worried`, "Tu ciclo terminó el N" + ✓ Confirmar) → OWNER.
  //    · B-2 (Brot `sad`, "N gastos fuera del ciclo" + Ver días) → NO-OWNER.
  //    El no-owner no puede confirmar (RLS), y hasta v1 le quedaba el banner de
  //    B-1 SIN botón: le anunciaba un problema y no le daba nada que hacer.
  //    B-2 le cuenta la consecuencia y lo lleva a los días afectados.
  //    Va entre el dropdown y el hero (paridad con el mock).
  const outMovementsCount = useMemo(
    () => outWindow.days.reduce((sum, d) => sum + (outBucketByIso.get(d.iso)?.count ?? 0), 0),
    [outWindow.days, outBucketByIso],
  )
  const overdueBlock = useMemo(
    () =>
      !isOverdue ? null : isFamilyOwner ? (
        <GastosOverdueBanner
          mode={mode}
          // Modelo EXTENDIDO: no hay días "fuera del ciclo" —el ciclo los
          // absorbió— así que `outWindow` viene VACÍA y el banner anunciaba
          // "0 días sin confirmar". El copy de extendido dice lo que de
          // verdad pasa y cuenta los días de extensión reales.
          title={
            controller.cycleIsExtended
              ? t('gastos:overdue.extTitle')
              : t('gastos:overdue.title', { day: overdueTitleDay })
          }
          subtitle={
            controller.cycleIsExtended
              ? t('gastos:overdue.extSubtitle', {
                  count: controller.cycleExtensionDays,
                })
              : t('gastos:overdue.subtitle', { count: outWindow.days.length })
          }
          confirmLabel={t('gastos:overdue.confirmCta')}
          confirmA11yLabel={t('gastos:overdue.confirmA11y')}
          onConfirm={handleOpenConfirmSheet}
          // `worried` es la cara del ciclo VENCIDO (nominal: hay gastos en
          // limbo). En extendido el ciclo sigue corriendo y nada quedó afuera.
          brotPose={controller.cycleIsExtended ? 'think' : 'worried'}
          // Este banner vive DENTRO del ListHeaderComponent de la SectionList:
          // su Brot convive con el scroll del feed, así que su loop Skia
          // (PictureRecorder + drawBrot por frame en el UI runtime) competía con
          // el gesto. Queda en su frame estático — la pose se lee igual.
          animated={false}
        />
      ) : (
        <GastosOverdueBanner
          mode={mode}
          // En EXTENDIDO no hay "gastos que se van a mudar": el ciclo los
          // absorbió. El copy habla de la extendido y "Ver días" enfoca el
          // primer día de extendido, que sí está en la grilla.
          title={
            controller.cycleIsExtended
              ? t('gastos:overdue.extNoticeTitle')
              : t('gastos:overdue.outNoticeTitle', { count: outMovementsCount })
          }
          subtitle={
            controller.cycleIsExtended
              ? t('gastos:overdue.extNoticeSub', {
                  count: controller.cycleExtensionDays,
                })
              : t('gastos:overdue.outNoticeSub')
          }
          confirmLabel={
            controller.cycleIsExtended
              ? t('gastos:overdue.extNoticeCta')
              : t('gastos:overdue.outNoticeCta')
          }
          confirmA11yLabel={
            controller.cycleIsExtended
              ? t('gastos:overdue.extNoticeCta')
              : t('gastos:overdue.outNoticeCta')
          }
          // "Ver días" NO muta nada: enfoca el primer día afectado, que es lo
          // único que el no-owner puede hacer con esto.
          onConfirm={
            controller.cycleIsExtended
              ? handleFocusFirstExtendedDay
              : outWindow.days.length > 0
                ? handleFocusFirstOutDay
                : undefined
          }
          // `sad` comunica pérdida ("quedaron afuera"). En extendido no se
          // perdió nada: el ciclo sigue corriendo.
          brotPose={controller.cycleIsExtended ? 'think' : 'sad'}
          animated={false}
        />
      ),
    [
      isOverdue,
      mode,
      t,
      overdueTitleDay,
      controller.cycleIsExtended,
      controller.cycleExtensionDays,
      outWindow.days.length,
      outMovementsCount,
      isFamilyOwner,
      handleOpenConfirmSheet,
      handleFocusFirstOutDay,
      handleFocusFirstExtendedDay,
    ],
  )

  // ④ hero — bloque caro (BrotParticles + CategoryBars). Con deps estrechas, un
  //    cambio de filtro/foco NO lo reconcilia.
  const heroBlock = useMemo(
    () => (
      <View style={styles.heroSpacing}>
        <GastosTourStep
          preview={preview}
          order={GASTOS_TOUR_STEPS.hero.order}
          text={GASTOS_TOUR_STEPS.hero.text}
          highlight={{ borderRadius: GASTOS_RADII.hero, padding: 8 }}
        >
          <GastosHero
            mode={mode}
            tag={t('gastos:hero.totalVisible')}
            chip={controller.cycleSummaryChip}
            total={formatMoney(controller.cycleTotal)}
            prom={formatMoney(controller.cycleAverageDaily)}
            categories={heroCategories}
            recentDailyBars={controller.recentDailyBars}
            paused={pausedParticles}
            // v2 · H-3 — con días fuera, el total del hero deja de ser toda la
            // verdad: la sublínea dice cuántos días quedaron afuera y el Brot
            // `worried` ancla la preocupación AL DATO (no suelto en el header).
            subline={
              isOverdue && outWindow.days.length > 0
                ? t('gastos:hero.sublineOutDays', { count: outWindow.days.length })
                : undefined
            }
            sublineTone="warn"
            brotPose={isOverdue && outWindow.days.length > 0 ? 'worried' : undefined}
            animated={false}
          />
        </GastosTourStep>
      </View>
    ),
    // `pausedParticles` (= !isFocused) está en deps para que el memo recompute
    // al entrar/salir de la tab y el `paused` de las partículas no quede stale.
    // Ya NO cambia durante el scroll (se revirtió la pausa por gesto): cambia
    // solo en el cambio de tab. Quiénes lo toman: ESTE bloque (10 worklets de
    // partículas) y el header ① (el dot "EN CURSO", 1 worklet siempre vivo) —
    // en los dos hay un `withRepeat(-1)` REAL que pausar. El calendario ⑤ usa
    // el flag gateado `pausedFueraGlow` (constante salvo ciclo vencido, ver su
    // nota), y dropdown ②, overdue ③, filtro ⑥ y sectionHead ⑦ no lo toman:
    // conservan identidad de elemento y React hace bail-out de esos subárboles.
    [
      preview,
      mode,
      t,
      controller.cycleSummaryChip,
      controller.cycleTotal,
      controller.cycleAverageDaily,
      heroCategories,
      controller.recentDailyBars,
      pausedParticles,
      isOverdue,
      outWindow.days.length,
    ],
  )

  // ⑥ calendario / day-detail — día en foco → el day-detail REEMPLAZA el
  //    calendario (paridad con el mock: showCal = !dayF). Prioridad: día FUERA
  //    (venc) > día del ciclo > calendario.
  //    Los números siguen el orden EN PANTALLA (ver `ListHeader`): desde el
  //    reorden del 2026-08-12 el filtro ⑤ va arriba, aunque acá se defina abajo.
  const calendarBlock = useMemo(
    () =>
      selectedOutDay ? (
        // Día FUERA-DE-CICLO: strip Brot-sad "estos gastos pasan al próximo al
        // confirmar" + los MISMOS CTAs que un día del ciclo (pedido owner
        // 2026-07-28, revierte la decisión [D] del cableado F5 — ver el bloque
        // de `handleRegisterOutDay`). El strip y los CTAs son bloques
        // independientes en el kit, así que conviven: primero el aviso, después
        // las acciones. Nav ‹ › unificada (FIX 2): ← vuelve al último día del
        // ciclo, → avanza por los días de overflow hasta hoy; el back-chip
        // vuelve al mes.
        <GastosDayDetail
          mode={mode}
          dayNum={`+${selectedOutDay.dayOfMonth}`}
          sub={t('gastos:overdue.outDaySub')}
          badge={t('gastos:overdue.outBadge')}
          gastado={formatMoney(selectedOutBucket?.total ?? 0)}
          movs={String(selectedOutBucket?.count ?? 0)}
          isOut
          showCtas
          isMarked={outDayIsMarked}
          onRegister={outDayIsToday ? undefined : handleRegisterOutDay}
          onMarkEmpty={outDayHasMovs ? undefined : handleMarkOutDay}
          onUnmark={outDayIsMarked ? handleUnmarkOutDay : undefined}
          // El day-detail REEMPLAZA al calendario dentro del ListHeaderComponent
          // → el Brot `sad` del strip fuera-de-ciclo convive con el scroll del
          // feed. Mismo criterio que el banner vencido.
          animated={false}
          onPrev={navBounds.canGoPrev ? handlePrevDay : undefined}
          onNext={navBounds.canGoNext ? handleNextDay : undefined}
          onBackToMonth={handleClearOutDay}
          backLabel={t('gastos:calendar.backToCalendar')}
        />
      ) : daySelected ? (
        <GastosDayDetail
          mode={mode}
          dayNum={String(controller.selectedDay)}
          // El `sub` nombra la FECHA cuando la ventana es extendida: ahí la
          // grilla tiene dos celdas con el mismo número (5..14 existen en los
          // dos meses) y un header que dice sólo "14" no identifica cuál. Es
          // literalmente lo que confundió al owner al navegar con ‹ ›. En
          // ventana nominal el número ya es único, así que se conserva el
          // rango del ciclo como venía.
          sub={
            dayIsFuture
              ? t('gastos:calendar.futureDaySub')
              : controller.cycleIsExtended && selectedDate
                ? formatWeekdayDayMonth(selectedDate)
                : dayIsExtendido
                  ? t('gastos:overdue.extDaySub')
                  : controller.cycleLabel
          }
          // v2 · DS-3/DS-5 — los chips del día. Las condiciones NO son
          // excluyentes y antes se resolvían con un ternario de prioridad, así
          // que un día extendido Y de exceso mostraba sólo uno de los dos.
          // Ahora se apilan (la fila envuelve). Orden: primero lo que pasó con
          // el gasto (logro o exceso), después el encuadre del día.
          badge={null}
          badges={dayChips}
          // DS-5 · el strip de Brot — la pieza que el owner extrañaba. Pose
          // `think`, no `sad`: en extendido no se perdió nada, el ciclo sigue
          // corriendo y el gasto ya está contado donde corresponde.
          brotStrip={
            dayIsExtendido
              ? { pose: 'think' as const, text: t('gastos:overdue.extBrotLine') }
              : null
          }
          // v2 · DS-4 — un día futuro no tiene "gastado 0", tiene "todavía no
          // sabemos": em-dash, no cero.
          gastado={dayIsFuture ? EM_DASH : dayGastado}
          movs={dayMovs}
          isOut={false}
          showCtas
          isMarked={dayIsMarked}
          onPrev={navBounds.canGoPrev ? handlePrevDay : undefined}
          onNext={navBounds.canGoNext ? handleNextDay : undefined}
          onBackToMonth={controller.clearDay}
          backLabel={t('gastos:calendar.backToCalendar')}
          // Registrar olvidado: solo días pasados (hoy usa el + normal).
          onRegister={selectedDate && !dayIsToday && !dayIsFuture ? handleRegisterSelected : undefined}
          // Marcar sin-gastos: solo días de 0 movimientos aún sin marca.
          onMarkEmpty={selectedDate && !dayHasMovs && !dayIsFuture ? handleMarkSelected : undefined}
          // Revertir: solo cuando ya está marcado.
          onUnmark={selectedDate && dayIsMarked ? handleUnmarkSelected : undefined}
          // v2 · DS-4 — día futuro: sin acciones, con el porqué escrito.
          variant={dayIsFuture ? 'future' : 'live'}
          noteLine={dayIsFuture ? t('gastos:calendar.noActionsFuture') : undefined}
          // v2 · DS-3/EV3 — el vacío como logro.
          cleanLine={dayIsMarked ? t('gastos:calendar.cleanDayLine') : undefined}
          onOpenGarden={dayIsMarked ? handlePressGarden : undefined}
        />
      ) : (
        // Paso `calendar` (order 2): solo se registra cuando el calendario está
        // a la vista (sin día en foco); con day-detail no hay target → el tour
        // lo omite (start sigue funcionando con los otros pasos).
        <GastosTourStep
          preview={preview}
          order={GASTOS_TOUR_STEPS.calendar.order}
          text={GASTOS_TOUR_STEPS.calendar.text}
          highlight={{ borderRadius: GASTOS_RADII.card, padding: 8 }}
        >
          <GastosCalendar
            mode={mode}
            cells={calendarCells}
            onSelectDay={handleSelectDay}
            // Halo que respira de las celdas FUERA-DE-CICLO: gate de foco
            // ADEMÁS gateado por `isOverdue` (ver `pausedFueraGlow`) — sin
            // ciclo vencido no hay celda 'fuera' montada, así que el valor
            // queda constante y este bloque conserva su identidad.
            paused={pausedFueraGlow}
            a11y={calendarA11y}
            // v2 · CAL-1/CAL-2/CAL-4 — el hint dice en qué estado está la
            // grilla. Prioridad: días fuera (lo urgente) > recién arrancado
            // (explica el punteado) > invitación a tocar.
            hint={
              isOverdue && controller.cycleIsExtended
                ? t('gastos:overdue.extHint', {
                    count: controller.cycleExtensionDays,
                  })
                : isOverdue && outWindow.days.length > 0
                  ? t('gastos:calendar.hintOverdue', { count: outWindow.days.length })
                  : isFreshCycle
                  ? t('gastos:calendar.hintFresh', {
                      day: cycleDayIndex,
                      total: controller.cycleDays,
                    })
                  : t('gastos:calendar.hintTapShort')
            }
            // CAL-2 — el hint pasa al durazno de alerta cuando lo que anuncia
            // son días fuera del ciclo (o de extendido). Es la única variante
            // del handoff que no lo pinta en el verde de marca.
            hintWarn={isOverdue}
            footNote={
              isFreshCycle
                ? {
                    text: t('gastos:calendar.freshNote'),
                    strong: t('gastos:calendar.freshNoteStrong'),
                    tail: t('gastos:calendar.freshNoteTail'),
                  }
                : undefined
            }
            animated={false}
          />
        </GastosTourStep>
      ),
    [
      preview,
      mode,
      t,
      pausedFueraGlow,
      calendarA11y,
      selectedOutDay,
      selectedOutBucket,
      outDayIsMarked,
      outDayIsToday,
      outDayHasMovs,
      handleRegisterOutDay,
      handleMarkOutDay,
      handleUnmarkOutDay,
      daySelected,
      controller.selectedDay,
      controller.cycleLabel,
      controller.clearDay,
      controller.cycleIsExtended,
      controller.cycleExtensionDays,
      dayIsExtendido,
      dayChips,
      dayGastado,
      dayMovs,
      dayIsMarked,
      dayIsToday,
      dayHasMovs,
      selectedDate,
      navBounds,
      handlePrevDay,
      handleNextDay,
      handleClearOutDay,
      handleRegisterSelected,
      handleMarkSelected,
      handleUnmarkSelected,
      calendarCells,
      handleSelectDay,
      dayIsFuture,
      handlePressGarden,
      isOverdue,
      outWindow.days.length,
      isFreshCycle,
      cycleDayIndex,
      controller.cycleDays,
    ],
  )

  // ⑤ filtro — se pinta ENTRE el hero y el calendario (ver `ListHeader`).
  const filterBlock = useMemo(
    () => (
      <GastosTourStep
        preview={preview}
        order={GASTOS_TOUR_STEPS.filters.order}
        text={GASTOS_TOUR_STEPS.filters.text}
        highlight={{ borderRadius: GASTOS_RADII.chip + 6, padding: 8 }}
      >
        <GastosFilter
          mode={mode}
          chips={visibleFilterChips}
          onSelect={handleSelectFilter}
          eyebrow={
            activeCategory
              ? t('gastos:filterV2.eyebrowActive')
              : t('gastos:smartFilter.eyebrow')
          }
          status={filterStatus}
          ghostChips={ghostFilterChips}
          ghostHint={ghostFilterChips ? t('gastos:filterV2.ghostHint') : undefined}
          // v2 · F-4 — el vacío del filtro vive ACÁ (no en la lista): queda
          // pegado al chip que lo causó y el CTA de quitarlo a un dedo. Por eso
          // `ListEmpty` ya no dibuja su variante `filtered` (se duplicaría).
          emptyResult={
            filterNoResults && activeCategory
              ? {
                  title: t('gastos:filterV2.emptyTitle', { category: activeCategory.name }),
                  hint: prevEditionCategoryAmount
                    ? t('gastos:filterV2.prevEditionSpent')
                    : undefined,
                  hintAmount: prevEditionCategoryAmount ?? undefined,
                  ctaLabel: t('gastos:filterV2.clearCta'),
                  onClear: handleClearFilters,
                }
              : undefined
          }
          animated={false}
        />
      </GastosTourStep>
    ),
    [
      preview,
      mode,
      t,
      visibleFilterChips,
      handleSelectFilter,
      activeCategory,
      filterStatus,
      ghostFilterChips,
      filterNoResults,
      prevEditionCategoryAmount,
      handleClearFilters,
    ],
  )

  // ⑦ encabezado "MOVIMIENTOS" (paso `list`, order 4): con `extendToScrollEnd`
  //    estira el cutout hasta el fondo del scroll (la lista arranca justo
  //    debajo) — mismo tratamiento que la vieja.
  const sectionHeadBlock = useMemo(
    () => (
      <GastosTourStep
        preview={preview}
        order={GASTOS_TOUR_STEPS.list.order}
        text={GASTOS_TOUR_STEPS.list.text}
        highlight={{ borderRadius: GASTOS_RADII.row, padding: 6, extendToScrollEnd: true }}
      >
        <GastosMovSectionHead
          mode={mode}
          chipLabel={
            selectedOutDay
              ? t('gastos:overdue.outDayChip', { day: selectedOutDay.dayOfMonth })
              : daySelected
                ? t('gastos:history.dayFilterChip', { day: controller.selectedDay })
                // "en el ciclo", NO "visibles": `movementsCount` sale de
                // `expenseCountByCategoryId` (conteos a nivel CICLO del RPC de
                // categorías, respetando el filtro), no de las filas montadas.
                // Con la 1ª página en 2 días el feed muestra un puñado de filas
                // mientras el chip cuenta decenas — la palabra "visibles" era
                // directamente falsa. El número se mantiene (es el útil, y es
                // el mismo que muestran los chips del filtro); lo que cambia es
                // la promesa de la copy.
                : t('gastos:history.cycleMovements', { count: movementsCount })
          }
          onClearDay={
            selectedOutDay
              ? handleClearOutDay
              : daySelected
                ? controller.clearDay
                : undefined
          }
        />
      </GastosTourStep>
    ),
    [
      preview,
      mode,
      t,
      selectedOutDay,
      daySelected,
      controller.selectedDay,
      controller.clearDay,
      movementsCount,
      handleClearOutDay,
    ],
  )

  // Composición final: solo depende de las identidades de los sub-bloques → una
  // interacción localizada (p.ej. cambio de filtro) recomputa SOLO su bloque +
  // este fragmento liviano; el resto conserva identidad y hace bail-out.
  //
  // ORDEN · el filtro va ARRIBA del calendario (owner 2026-08-12). Filtrar por
  // categoría no re-escopa solo el listado: re-escopa TAMBIÉN el hero y las
  // celdas del calendario. Con el filtro entre el calendario y la lista se leía
  // como si mandara nada más sobre lo que tiene debajo — y había que scrollear
  // de vuelta hacia arriba para entender por qué el mes se había vaciado. Arriba
  // queda antes que todo lo que gobierna, y el vacío F-4 ("Nada en Mercado este
  // ciclo") aparece pegado al chip que lo causó, no dos bloques más abajo.
  const ListHeader = useMemo(
    () => (
      <>
        {headerBlock}
        {dropdownBlock}
        {overdueBlock}
        {heroBlock}
        {filterBlock}
        {calendarBlock}
        {sectionHeadBlock}
      </>
    ),
    [
      headerBlock,
      dropdownBlock,
      overdueBlock,
      heroBlock,
      calendarBlock,
      filterBlock,
      sectionHeadBlock,
    ],
  )

  const ListFooter = useMemo(() => {
    // Día FUERA en foco → la lista muestra solo ese día (sin paginación del
    // ciclo): nada de "ver días anteriores" ni "fin del ciclo".
    if (isOutDayFocused) return null
    if (controller.isFetchingNextPage) {
      return (
        <View style={styles.footerLoading}>
          <ActivityIndicator size="small" color={s.sub} />
          <Text style={[styles.footerText, { color: s.sub }]}>
            {t('gastos:list.loadingMoreDays')}
          </Text>
        </View>
      )
    }
    if (controller.hasNextPage) {
      return <GastosSeeMore mode={mode} onPress={handleLoadMore} />
    }
    if (controller.expenses.length > 0) {
      return (
        <View style={styles.footerEnd}>
          <Text style={[styles.footerEndText, { color: s.faint }]}>
            {t('gastos:list.endOfMonth')}
          </Text>
        </View>
      )
    }
    return null
  }, [
    isOutDayFocused,
    controller.isFetchingNextPage,
    controller.hasNextPage,
    controller.expenses.length,
    handleLoadMore,
    mode,
    s,
    t,
  ])

  // Vacío contextual (dentro de la lista, cuando hay historial pero el scope
  // actual queda sin filas).
  //
  // v2 · cuando el vacío lo causa un FILTRO DE CATEGORÍA, el bloque del filtro
  // ya dibuja F-4 ("Nada en X este ciclo" + Brot + ✕ Quitar filtro) justo
  // debajo de los chips. Renderizar acá el mini-empty de "limpiar filtros"
  // repetiría el mismo mensaje dos veces en la misma pantalla, así que la lista
  // no dibuja NADA en ese caso. El resto de los filtros (día en foco) sí
  // conservan su vacío: no tienen bloque propio que los explique.
  //
  // Sin filtro → M-4/EV6: el ciclo vacío se dibuja como MOLDE — 3 filas
  // fantasma punteadas + Brot + "Registrar mi primer gasto".
  const ListEmpty = useMemo(() => {
    if (filterNoResults) return null
    const filtered = controller.hasAnyFilter
    return (
      <GastosMovementsEmptyWell
        mode={mode}
        title={
          filtered
            ? t('gastos:emptyVariants.filtered.primary')
            : t('gastos:emptyVariants.cycle.primary')
        }
        sub={
          filtered
            ? t('gastos:emptyVariants.filtered.secondary')
            : t('gastos:emptyState.ghostSub')
        }
        ctaLabel={filtered ? t('gastos:clearFilters.label') : t('gastos:emptyState.addFirstCta')}
        onPressCta={filtered ? handleClearFilters : handlePressAdd}
        ghostRows={filtered ? 0 : 3}
        animated={false}
      />
    )
  }, [filterNoResults, controller.hasAnyFilter, mode, t, handleClearFilters, handlePressAdd])

  // Sheet de confirmación del ciclo (CycleBalanceSheet) — reuso EXACTO de la
  // Home. Se monta tanto en el feed como en el vacío (ambos pueden estar
  // vencidos); NO en cerrado (histórico). En preview queda montada para verla,
  // pero el save es NO-OP (runConfirmCobro). El MonthCloseDecisionSheet
  // standalone NO se monta acá: Gastos NO es dueña del auto-open (F6, ver la
  // consolidación del orquestador arriba). La decisión del sobrante del flujo
  // de confirmar-cobro la resuelve el wrapped INLINE (fireWrappedForClosedCycle
  // → closing scene); el fallback de ciclo-vacío lo cubre la Home.
  const confirmSheets = (
    <HomeDashboardSheets
      isOpen={isCycleBalanceSheetOpen}
      isOnboardingFlow={isOnboardingFlow}
      monthlyIncome={dashboard.monthlyIncome}
      remainingDaysInCycle={remainingDaysInCycle}
      isSaving={isSavingSalary}
      errorMessage={salaryErrorMessage}
      onClose={handleCycleSheetClose}
      onSaveBalance={handleCycleSheetSave}
      onKeepDefault={handleCycleSheetKeepDefault}
    />
  )

  // Hoja de edición del gasto — sólo se monta sobre el feed vivo (la edición
  // cerrada es de lectura). La `key` versiona la sesión: abrir otro movimiento
  // remonta el formulario con sus valores.
  const editSheet = editSession ? (
    <EditGastoSheet
      key={`edit-gasto-${editSession.token}`}
      amount={Math.abs(Number(editSession.expense.price ?? 0))}
      categoryName={controller.categoriesById.get(editSession.expense.category_id)?.name}
      categorySeed={
        controller.categoriesById.get(editSession.expense.category_id)?.rawName ??
        controller.categoriesById.get(editSession.expense.category_id)?.name
      }
      description={editSession.expense.description ?? ''}
      isSaving={updateExpenseMutation.isPending}
      onCancel={handleCloseEdit}
      onSubmit={handleSubmitEdit}
      visible={isEditOpen}
    />
  ) : null

  // Feed con un día FUERA en foco → muestra solo ese día (sin la paginación del
  // ciclo). Sino, las day-groups normales del controller.
  const feedSections = isOutDayFocused ? outDaySections : sections

  // ── Edición CERRADA (F4): solo lectura, agregados ──────────────────
  // Tiene prioridad sobre el hard-error/empty del ciclo VIVO: los datos son de
  // `useMonthlyEditions` (cache directo), así que una edición se ve aunque el
  // ciclo actual haya fallado o esté vacío. Composición: header (closed) +
  // dropdown + barra cerrada + hero "TOTAL DE LA EDICIÓN" + calendario de
  // intensidad (solo lectura) + well honesto "los movimientos no se conservan".
  // SIN filtro, SIN day-detail, SIN feed, SIN mutaciones (isCurrent=false).
  // ScrollView plano (contenido corto/fijo → sin virtualizar) y SIN
  // pull-to-refresh (no re-dispara las RPCs del ciclo vivo).
  if (viewingClosed && selectedEdition) {
    // Total real del día tocado, mismo `daily_totals` que alimenta `gastado`
    // más abajo — se reusa (no se recalcula) para decidir si el conteo de
    // `movs` es creíble: ver comentario junto al prop `movs`.
    const selectedClosedDayTotal = selectedClosedIso
      ? (closedDayMeta.get(selectedClosedIso)?.total ?? 0)
      : 0
    return (
      <ScrollView
        contentContainerStyle={emptyScrollContentStyle}
        // ÚNICO handler de esta rama: alimenta el umbral del scroll edge
        // effect (setState con bail-out; no re-renderea por frame). Sigue
        // sin handlers de tour — esta vista no registra superficie ni
        // pasos — ni de bordes de gesto.
        onScroll={handleListScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <GastosHeader
          mode={mode}
          cycleLabel={t('gastos:closed.trigger', { label: selectedEdition.period_label })}
          cycleVariant="closed"
          brotPose="think"
          badgeCount={badgeCount}
          paused={pausedParticles}
          // Mismo criterio que el feed: el Brot del botón del jardín va sin
          // loop Skia en el cableado (el usuario no debería ver dos
          // comportamientos del mismo botón según la rama).
          animated={false}
          onPressBrot={handlePressGarden}
          onToggleDropdown={handleToggleDropdown}
        />
        {isDropdownOpen ? (
          <CycleDropdown mode={mode} items={dropdownItems} onSelect={handleSelectCycle} />
        ) : null}
        <GastosClosedBar mode={mode} onBackToCurrent={handleBackToCurrent} />
        <View style={styles.heroSpacing}>
          <GastosHero
            mode={mode}
            tag={t('gastos:hero.totalEdition')}
            chip={t('gastos:closed.heroChip', { count: selectedEdition.expenses_count })}
            total={formatMoney(Math.round(selectedEdition.total_variable_spent ?? 0))}
            prom={closedProm}
            categories={closedCategories}
            recentDailyBars={closedBars}
            paused={pausedParticles}
            // v2 · H-2 — la sublínea dice que la edición no se toca, y el Brot
            // `think` la acompaña. Sin esto, el único cartel de "solo lectura"
            // era la barra ámbar de arriba, que se pierde al scrollear.
            subline={t('gastos:hero.sublineReadOnly')}
            brotPose="think"
            animated={false}
          />
        </View>
        {/* v2 · CAL-3 + DS-6 — el calendario de una edición cerrada ahora es
            tappable y alterna con el detalle del día, igual que el ciclo vivo.
            El detalle es de SOLO LECTURA: total real de `daily_totals`,
            MOVIMIENTOS = conteo real de `closedDayQuery` (guion largo mientras
            esa query no terminó de cargar, si terminó en error, o si resolvió
            vacía en un día con gasto — ver comentario junto al prop `movs`)
            y sin CTAs. */}
        {selectedClosedIso != null ? (
          <>
            <GastosDayDetail
              mode={mode}
              dayNum={String(selectedClosedDayNum ?? '')}
              // La fecha completa cuando la edición archivada dura más de un mes
              // (ventana extendida confirmada): ahí el número solo no identifica
              // el día. Si no, el rango de la edición, como venía.
              sub={
                closedNavIsos.length > 31 && closedDayMeta.get(selectedClosedIso)
                  ? formatWeekdayDayMonth(
                      closedDayMeta.get(selectedClosedIso)?.date ?? new Date(),
                    )
                  : t('gastos:closed.trigger', { label: selectedEdition.period_label })
              }
              badge={null}
              gastado={formatMoney(selectedClosedDayTotal)}
              // "0" solo es honesto si el día realmente no tuvo gasto. Si la
              // consulta todavía no terminó, terminó en error, o resolvió sin
              // filas mientras `daily_totals` dice que ese día SÍ gastó
              // (edición purgada por el cron de retención), "0" afirmaría un
              // conteo que no existe y contradice al well de abajo — mejor el
              // guion largo, que no promete un número que no tenemos.
              movs={
                !closedDayQuery.isFetched || closedDayQuery.isError
                  ? EM_DASH
                  : closedDayRows.length === 0 && selectedClosedDayTotal > 0
                    ? EM_DASH
                    : String(closedDayRows.length)
              }
              isOut={false}
              showCtas={false}
              variant="closed"
              noteLine={t('gastos:calendar.noActionsClosed')}
              backLabel={t('gastos:calendar.backToCalendar')}
              onBackToMonth={handleClearClosedDay}
              onPrev={closedNavIndex > 0 ? handlePrevClosedDay : undefined}
              onNext={
                closedNavIndex >= 0 && closedNavIndex < closedNavIsos.length - 1
                  ? handleNextClosedDay
                  : undefined
              }
              animated={false}
            />
            {closedDayExpenses.length > 0 ? (
              <View>
                {closedDayExpenses.map((expense) => (
                  <View
                    key={expense.id}
                    style={[
                      styles.rowShadowWrap,
                      { backgroundColor: s.movRowBackground, boxShadow: s.movRowShadow },
                    ]}
                  >
                    <GastosMovRow
                      mode={mode}
                      row={buildMovRowVM({
                        item: { kind: 'expense', iso: selectedClosedIso, expense },
                        categoriesById: controller.categoriesById,
                        memberById,
                        t,
                      })}
                      flat
                    />
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <GastosCalendar
            mode={mode}
            cells={closedCells}
            // "Mayo 2026" → "MAYO EN UN VISTAZO". El año se saca a propósito:
            // con él ("MAYO 2026 EN UN VISTAZO") el título no entra al lado del
            // hint y truncaba justo en la parte que nombra el mes. El año ya
            // está en el trigger del ciclo y en la barra de solo-lectura.
            title={t('gastos:calendar.titleMonth', {
              month: selectedEdition.period_label.replace(/\s+\d{4}$/, '').toUpperCase(),
            })}
            hint={t('gastos:calendar.hintClosed')}
            onSelectDay={handleSelectClosedDay}
            a11y={calendarA11y}
            animated={false}
          />
        )}
        <GastosMovSectionHead mode={mode} chipLabel={t('gastos:closed.sectionChip')} />
        {/* Feed de solo lectura de la edición cerrada. Orden de las ramas:
            v2 · EV7 — si la edición cerró SIN gastos, el well cambia de mensaje:
            no es que el detalle no se conserve, es que no hubo nada. Hoy este
            caso NO es alcanzable desde el dropdown (`useMonthlyEditions` filtra
            las ediciones con `expenses_count === 0`, y ese filtro también
            alimenta el archivo de Wrappeds de Ajustes, así que no se toca acá);
            queda cubierto por si el filtro cambia o llega por deep-link. Después
            el error de la query real. Después el placeholder: `closedFeed` usa
            `placeholderData: keepPreviousData` (perf, para que el hero/calendario
            crucen suave) — al saltar de una edición cerrada a OTRA desde el
            dropdown, mientras el fetch de la ventana NUEVA está en vuelo,
            `closedFeed.data` sigue siendo el de la edición ANTERIOR aunque
            `isFetched` ya mire la key nueva (0 fetches → false). Sin este gate,
            `closedFeedEmpty` da false (por el `isFetched` en false) y el
            ternario caía al feed real con las filas VIEJAS bajo el header
            nuevo. `isPlaceholderData` es el único flag que distingue "estas
            filas son de la key vieja" de "esta key nueva ya resolvió" — mientras
            esté prendido no se pinta nada (ni feed ni fallback). Recién
            resuelto el placeholder entra el fallback de "no se conservaron" (ediciones cerradas
            ANTES de la retención larga, cuyas filas ya fueron purgadas) —
            `closedFeedEmpty` ya exige `closedFeed.isFetched`, así que mientras
            carga la primera página en frío (sin placeholder de por medio) el
            ternario cae al feed real, que sin data todavía no dibuja nada. */}
        {(selectedEdition.expenses_count ?? 0) === 0 ? (
          <GastosMovementsEmptyWell
            mode={mode}
            title={t('gastos:closed.emptyTitle', { month: selectedEdition.period_label })}
            sub={t('gastos:closed.emptyBody')}
            ctaLabel={t('gastos:closed.backToCurrent')}
            onPressCta={handleBackToCurrent}
            animated={false}
          />
        ) : closedFeed.isError ? (
          // Mismo patrón error/retry del resto de la pantalla.
          <NeoStateBlock
            icon="error-outline"
            description={getErrorMessage(closedFeed.error, t('states:error.server'))}
            title={t('gastos:errors.loadTitle')}
            actionLabel={t('states:errorState.action')}
            tone="error"
            onAction={() => {
              void closedFeed.refetch()
            }}
          />
        ) : closedFeed.isPlaceholderData ? (
          // Todavía mostrando (por `keepPreviousData`) las filas de la edición
          // ANTERIOR mientras la ventana nueva termina de resolver: no
          // dibujamos nada acá — ni el feed viejo ni un fallback prematuro.
          null
        ) : closedFeedEmpty ? (
          // Edición cerrada ANTES de la retención extendida: sus filas ya
          // fueron purgadas. El resumen (hero/calendario) sigue arriba.
          <GastosMovementsEmptyWell
            mode={mode}
            title={t('gastos:closed.notRetainedTitle')}
            sub={t('gastos:closed.notRetainedBody')}
            animated={false}
          />
        ) : (
          <View>
            {closedSections.map((sec) => (
              <View key={sec.dateMs}>
                <View style={styles.sectionHeaderWrap}>
                  <GastosMovDayHeader
                    mode={mode}
                    label={sec.title.toUpperCase()}
                    total={sec.total > 0 ? `${MINUS}${formatMoney(sec.total)}` : ''}
                  />
                </View>
                {sec.data.map((item) => (
                  <View
                    key={item.kind === 'expense' ? item.expense.id : item.income.id}
                    style={[
                      styles.rowShadowWrap,
                      { backgroundColor: s.movRowBackground, boxShadow: s.movRowShadow },
                    ]}
                  >
                    {/* Solo lectura: GastosMovRow directo, sin SwipeRow ni
                        long-press (nada que editar en una edición cerrada). */}
                    <GastosMovRow
                      mode={mode}
                      row={buildMovRowVM({
                        item,
                        categoriesById: controller.categoriesById,
                        memberById,
                        t,
                      })}
                      flat
                    />
                  </View>
                ))}
              </View>
            ))}
            {closedFeed.hasNextPage ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('gastos:closed.loadMoreDays')}
                disabled={closedFeed.isFetchingNextPage}
                onPress={() => void closedFeed.fetchNextPage()}
                style={[
                  styles.rowShadowWrap,
                  { backgroundColor: s.movRowBackground, boxShadow: s.movRowShadow },
                ]}
              >
                <Text style={{ padding: 14, textAlign: 'center', color: s.sectionLabelInk }}>
                  {closedFeed.isFetchingNextPage ? '…' : t('gastos:closed.loadMoreDays')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </ScrollView>
    )
  }

  // ── Hard error ─────────────────────────────────────────────────────
  if (
    controller.error &&
    controller.filteredExpenses.length === 0 &&
    controller.expenses.length === 0
  ) {
    return (
      <View style={styles.errorWrap}>
        <NeoStateBlock
          icon="error-outline"
          description={getErrorMessage(controller.error, t('states:error.server'))}
          title={t('gastos:errors.loadTitle')}
          actionLabel={t('states:errorState.action')}
          tone="error"
          onAction={() => {
            void controller.refetchAll()
          }}
        />
      </View>
    )
  }

  // ── Cuenta nueva (first-run) ───────────────────────────────────────
  // El contenido solo monta tras el snapshot, así que expenses vacío = cuenta
  // nueva (no loading flash). Render de los vacíos del kit (hero + calendario
  // + movimientos) en un ScrollView plano (contenido corto → sin virtualizar).
  //
  // TOUR (paridad con la vieja + el feed): la rama vacía TAMBIÉN registra la
  // superficie de scroll (el ScrollView vía GastosTourScrollBinding, gateado
  // en preview) y sus TourTargets (streak/hero/calendar/list) — sin esto el
  // tour guiado no corría en first-run (measureSv daba null → cutout sin
  // posicionar). El paso `filters` no tiene target acá (igual que la vieja):
  // el engine arma el walk de los targets REGISTRADOS, así que se omite sin
  // stall. Solo una rama se renderiza por vez → sin doble registro con el feed.
  if (isEmptyAccount) {
    return (
      <>
      {preview ? null : (
        <>
          <GastosTourScrollBinding
            scrollRef={tourScrollRef}
            measureRef={tourMeasureRef}
            bindingRef={tourBindingRef}
          />
          <GastosTourActiveGate onChange={handleTourActiveChange} />
        </>
      )}
      <ScrollView
        // El ScrollView del vacío ES la superficie de scroll del tour: apuntamos
        // `tourScrollRef` acá (tourMeasureRef queda sin attach en esta rama →
        // resolveMeasureNode cae al scrollRef y mide el viewport). Mismo enfoque
        // que la vieja (y que Fijos) para su empty state.
        ref={tourScrollRef as unknown as RefObject<ScrollView | null>}
        contentContainerStyle={emptyScrollContentStyle}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        // Mismo gate que el feed (ver SectionList). Acá el ScrollView es PLANO
        // (no hay VirtualizedList que fuerce el throttle), así que sin tour
        // también se sube el throttle: de ~60 despachos/s a ~5/s. Con el tour
        // activo vuelve a 16ms para que el highlight no caiga off-target. Los
        // handlers de borde mantienen `scrollYRef` fresco con el onScroll
        // por-frame gateado.
        onScroll={handleListScroll}
        onScrollBeginDrag={handleScrollStart}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onContentSizeChange={handleTourContentSizeChange}
        scrollEventThrottle={16}
      >
        {/* Paso `streak` (order 1): resalta el header entero (el kit no expone
            ref del botón Brot/jardín donde vive el badge de racha) — mismo
            mapeo que el feed. */}
        <GastosTourStep
          preview={preview}
          order={GASTOS_TOUR_STEPS.streak.order}
          text={GASTOS_TOUR_STEPS.streak.text}
          highlight={{ borderRadius: GASTOS_RADII.card, padding: 6, pulse: true }}
        >
          <GastosHeader
            mode={mode}
            cycleLabel={controller.cycleLabel}
            cycleVariant="current"
            brotPose={brotPose}
            badgeCount={badgeCount}
            paused={pausedParticles}
            // Mismo criterio que el feed (ver la nota allá).
            animated={false}
            onPressBrot={handlePressGarden}
            onToggleDropdown={handleToggleDropdown}
          />
        </GastosTourStep>
        {isDropdownOpen ? (
          <CycleDropdown mode={mode} items={dropdownItems} onSelect={handleSelectCycle} />
        ) : null}
        {/* Cuenta nueva que YA pasó su primer payday sin confirmar (raro pero
            posible): el banner vencido igual guía a confirmar el cobro. */}
        {isOverdue ? (
          <GastosOverdueBanner
            mode={mode}
            title={t('gastos:overdue.title', { day: overdueTitleDay })}
            subtitle={t('gastos:overdue.subtitle', { count: outWindow.days.length })}
            confirmLabel={t('gastos:overdue.confirmCta')}
            confirmA11yLabel={t('gastos:overdue.confirmA11y')}
            onConfirm={isFamilyOwner ? handleOpenConfirmSheet : undefined}
            // Rama VACÍA: acá el banner vive en un ScrollView plano, sin filas.
            // Igual se apaga por coherencia con el feed (el usuario no debería
            // ver dos comportamientos distintos del mismo banner) y porque el
            // Brot GRANDE del hero vacío ya aporta el movimiento de la vista.
            animated={false}
          />
        ) : null}
        <View style={styles.heroSpacing}>
          <GastosTourStep
            preview={preview}
            order={GASTOS_TOUR_STEPS.hero.order}
            text={GASTOS_TOUR_STEPS.hero.text}
            highlight={{ borderRadius: GASTOS_RADII.hero, padding: 8 }}
          >
            {/* v2 · H-4/EV1 — el hero vacío deja de esconder promedio y
                categorías: las muestra en MOLDE (promedio "—", 7 barras
                punteadas con sus letras, y la promesa de las categorías). El
                chip "0 mov" también vuelve: el molde tiene que ser el mismo
                esqueleto que el hero lleno para que se lea como "todavía no",
                no como "esta pantalla es distinta". */}
            <GastosHero
              mode={mode}
              tag={t('gastos:hero.totalVisible')}
              chip={controller.cycleSummaryChip}
              total={formatMoney(0)}
              prom={EM_DASH}
              categories={[]}
              empty
              emptySub={t('gastos:hero.emptySub')}
              emptyCategoriesHint={t('gastos:hero.emptyCategories')}
              emptyCtaLabel={t('gastos:emptyState.addFirstCta')}
              onPressEmptyCta={handlePressAdd}
              paused={pausedParticles}
              animated={false}
            />
          </GastosTourStep>
        </View>
        <GastosTourStep
          preview={preview}
          order={GASTOS_TOUR_STEPS.calendar.order}
          text={GASTOS_TOUR_STEPS.calendar.text}
          highlight={{ borderRadius: GASTOS_RADII.card, padding: 8 }}
        >
          {/* v2 · CAL-4/EV2 — cuenta nueva: la grilla va punteada entera (en
              `empty` buildNeoCells manda TODOS los días por la rama de futuro,
              y `freshCycle` la vuelve molde) + el strip que traduce el
              punteado. El hint dice en qué día del ciclo está parado. */}
          <GastosCalendar
            mode={mode}
            cells={cells}
            onSelectDay={handleSelectDay}
            empty
            a11y={calendarA11y}
            hint={t('gastos:calendar.hintFresh', {
              day: cycleDayIndex,
              total: controller.cycleDays,
            })}
            footNote={{
              text: t('gastos:calendar.freshNote'),
              strong: t('gastos:calendar.freshNoteStrong'),
              tail: t('gastos:calendar.freshNoteTail'),
            }}
            animated={false}
          />
        </GastosTourStep>
        <GastosTourStep
          preview={preview}
          order={GASTOS_TOUR_STEPS.list.order}
          text={GASTOS_TOUR_STEPS.list.text}
          highlight={{ borderRadius: GASTOS_RADII.row, padding: 6 }}
        >
          {/* v2 · M-4/EV6 — filas fantasma + Brot + "Registrar mi primer gasto".
              La pill de estado del encabezado ("Ciclo sin cargar") sale del
              chipLabel, que en cero ya dice "0 gastos en el ciclo". */}
          <GastosMovements
            mode={mode}
            chipLabel={t('gastos:history.cycleMovements', { count: 0 })}
            groups={[]}
            showSeeMore={false}
            empty
            emptyTitle={t('gastos:emptyState.introTitle')}
            emptySub={t('gastos:emptyState.ghostSub')}
            emptyCtaLabel={t('gastos:emptyState.addFirstCta')}
            onPressEmptyCta={handlePressAdd}
            emptyGhostRows={3}
            animated={false}
          />
        </GastosTourStep>
      </ScrollView>
      {confirmSheets}
      </>
    )
  }

  // ── Feed real (SectionList virtualizada) ───────────────────────────
  // El `tourMeasureRef` (View flex:1) es el nodo medible del tour (la
  // SectionList no expone measureInWindow confiable). El GastosTourScrollBinding
  // registra la superficie de scroll — gateado en preview (no clobbea el
  // registro de la Gastos vieja live). onScroll/onContentSizeChange alimentan
  // el auto-scroll de los pasos.
  return (
    <>
    <View ref={tourMeasureRef} collapsable={false} style={styles.listWrap}>
      {preview ? null : (
        <>
          <GastosTourScrollBinding
            scrollRef={tourScrollRef}
            measureRef={tourMeasureRef}
            bindingRef={tourBindingRef}
          />
          <GastosTourActiveGate onChange={handleTourActiveChange} />
        </>
      )}
      {/* FIX A · por qué NO hay getItemLayout: aunque la FILA es de alto fijo por
          diseño (paddingVertical 12 + tile 44 = 68, + rowShadowWrap marginTop 10
          = 78px; determinístico a fontScale 1 porque el tile de 44 domina sobre
          el stack de texto), NO se puede dar un getItemLayout CORRECTO acá:
          1) OFFSET header-inclusive imposible. En VirtualizedList (RN 0.81) el
             offset de una celda medida es su Y real dentro del content, que YA
             incluye el ListHeaderComponent (ListMetricsAggregator.notifyCellLayout
             guarda flowRelativeOffset del onLayout, y la celda vive DEBAJO del
             header). Cuando hay getItemLayout, getCellMetrics devuelve su offset
             TAL CUAL (no le suma _headerLength) → el offset que yo retorne DEBE
             ser header-inclusive. Pero este ListHeader es de alto VARIABLE y no
             conocido de antemano: dropdown de ciclo (abre/cierra), banner VENCIDO
             (condicional), hero (alto según nº de categorías + partículas) y, el
             peor, el calendario que (a) se REEMPLAZA por el day-detail al enfocar
             un día, (b) tiene 5 o 6 semanas según offset+cycleDays y (c) crece con
             celdas 'fuera' si el ciclo está vencido. Cualquier offset fijo queda
             mal apenas algo de eso cambia → spacers mal dimensionados,
             scrollToIndex/Location erróneos, mal cálculo de onEndReached.
          2) Índice APLANADO con header + FOOTER por sección. SectionList mete por
             sección: 1 header + N items + 1 footer (itemCount += 2). El header de
             grupo (GastosMovDayHeader) es alignItems:'baseline' con dos textos de
             tamaños distintos (11/13) SIN lineHeight explícito → su alto sale de
             las métricas de Nunito, no computable al píxel; y vive en el kit
             (components/redesign/gastos), fuera de mi alcance de edición.
          3) FONT-SCALING. Los <Text> de fila y header viven en el kit → no puedo
             capar maxFontSizeMultiplier ahí. Un gate PixelRatio.getFontScale()===1
             salvaría solo la fila (tile-dominada), no el header baseline.
          Un getItemLayout mal calculado rompe el scroll — PEOR que no tenerlo. La
          virtualización ya se acota con windowSize/removeClippedSubviews +
          React.memo por fila (abajo). */}
      <SectionList<MovementItem, MovimientosSection>
        ref={tourScrollRef}
        sections={feedSections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        ListEmptyComponent={ListEmpty}
        stickySectionHeadersEnabled={false}
        // PERF · el onScroll POR FRAME del tour se cablea SOLO con el tour
        // activo (first-run). El resto del tiempo `scrollYRef` lo mantienen
        // fresco los bordes del gesto (begin/end drag + momentum end, abajo):
        // el tour arranca en foco/first-run, nunca a mitad de gesto, así que
        // cuando el host lee el ref ya tiene la Y REAL asentada — sin cutout
        // off-target.
        onScroll={handleListScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        // Tour + desarme del gate de paginación cuando el contenido ENCOGE
        // (ver handleFeedContentSizeChange).
        onContentSizeChange={handleFeedContentSizeChange}
        // 16ms = una vez por frame: el tour lee scrollYRef y con throttle mayor
        // el highlight cae off-target.
        //
        // OJO · acá el throttle NO es un knob de perf y NO se baja a undefined:
        // VirtualizedList pisa el prop con `scrollEventThrottle ?? 0.0001`
        // (virtualized-lists/Lists/VirtualizedList.js) porque su propio
        // `_onScroll` necesita la Y por frame para computar la ventana de
        // render. Con undefined el despacho nativo→JS queda IGUAL de frecuente
        // (en New Arch, iOS mapea <=16.6ms → 0 = cada frame, y Android solo
        // throttlea con valores >=17ms) y encima se pierde el control explícito.
        // Subirlo mataría la virtualización (celdas en blanco al flingear).
        scrollEventThrottle={16}
        // Auto-paginación GATEADA por scroll de usuario (handleEndReached): sin
        // el gate, con contenido inicial corto `onEndReached` cascadeaba al
        // montar y traía los 105 movimientos de una. Sin día FUERA en foco (esa
        // vista muestra un solo día, sin paginar).
        onEndReached={isOutDayFocused ? undefined : handleEndReached}
        // 0.1 (era 0.5) · el threshold se mide en VIEWPORTS desde el final
        // (`distanceFromEnd < threshold * visibleLength`): con 0.5 la carga
        // arrancaba a MEDIA pantalla del fondo, o sea el feed crecía sin que
        // el usuario hubiese llegado a ver el final de la sección. Con 0.1
        // dispara recién a ~10% del viewport del fondo REAL — que es el pedido
        // ("si scrolleamos hasta abajo de todo, recién ahí cargar más").
        // No se baja a 0: en RN el offset del fondo no cae exacto en cada
        // gesto (rubber-band iOS, redondeos de fling) y quedaría un feed que a
        // veces no pagina nunca; para eso está igual el botón explícito.
        onEndReachedThreshold={0.1}
        // PERF · MISMOS knobs que la pantalla VIEJA (gastos-v2-screen), que con
        // los mismos datos y el mismo device scrollea fluida.
        //
        // Una ronda previa los había BAJADO a 3/8/4 con la idea de "montar
        // menos filas". Estaba al revés: achicar la ventana NO baja el costo
        // UNITARIO de una fila, sube la FRECUENCIA con que se paga. Con ~105
        // movimientos, 3 viewports significa montar/desmontar ~80 filas en un
        // recorrido completo → mount + layout + rasterizado a mitad de gesto
        // (huecos en blanco y stutter). Con 9 la lista termina prácticamente
        // ENTERA montada: el scroll pasa a ser movimiento nativo puro, cero
        // mounts durante el gesto — que es exactamente lo que hace la vieja.
        //
        // La fila conserva su relieve neumórfico APROBADO (sombra en el wrapper
        // + gradiente en dark — ver MovementRow): sacarle esas capas se probó y
        // NO movió la aguja del scroll, además de aplanar el diseño, así que se
        // revirtió. El knob que sí importa es este: menos mounts durante el
        // gesto, no filas más baratas.
        //
        // `removeClippedSubviews` = igual que la vieja (Android desmonta las
        // subvistas fuera de pantalla; no-op en iOS).
        windowSize={9}
        removeClippedSubviews
        // initialNumToRender 12→8 · maxToRenderPerBatch 10→5 (2026-07-28).
        // La 1ª página pasó de 7 días a 2 (GASTOS_DAYS_PER_PAGE): el feed
        // inicial ronda ~10 celdas aplanadas (SectionList mete header+footer
        // POR SECCIÓN, o sea 2 días ≈ 4 celdas de chrome + los movimientos),
        // así que pedir 12 de una era pedir MÁS filas de las que existen —
        // el knob no hacía nada salvo alargar el primer commit cuando sí
        // había datos. Con 8 el primer commit cubre el viewport de arranque
        // (header alto: hero + calendario) y el resto entra en un batch.
        // `maxToRenderPerBatch` 5 mantiene cada batch por debajo de un frame
        // en gama baja; con páginas de 2 días nunca hay 10 filas nuevas que
        // montar de golpe.
        //
        // `windowSize` NO se toca (ver nota de arriba): bajarlo fue
        // CONTRAPRODUCENTE en la ronda previa (más montajes/desmontajes a
        // mitad de gesto), y ahora que la lista arranca corta, 9 viewports la
        // dejan prácticamente entera montada — scroll nativo puro.
        initialNumToRender={8}
        maxToRenderPerBatch={5}
        updateCellsBatchingPeriod={50}
        showsVerticalScrollIndicator={false}
        // SafeArea la maneja <Screen>; 'never' evita el top inset duplicado.
        contentInsetAdjustmentBehavior="never"
        style={styles.list}
        contentContainerStyle={listContentStyle}
        refreshControl={refreshControl}
      />
    </View>
    {confirmSheets}
    {editSheet}
    </>
  )
}

const styles = StyleSheet.create({
  // El SectionList/ScrollView interno maneja su propio padding: la Screen
  // no-scrollable solo provee el canvas (sin padding/gap propios).
  screenBody: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0 },
  // screenBody pisa el padding default del Screen (para que skeleton/feed/vacíos
  // manejen el suyo, 20/14). Las ramas de error no scrollean, así que se
  // padean acá para no quedar pegadas a los bordes ni al safe-area top.
  errorWrap: { flex: 1, paddingHorizontal: 20, justifyContent: 'center' },
  list: { flex: 1 },
  // Wrapper flex:1 de la SectionList = nodo medible del tour (tourMeasureRef).
  listWrap: { flex: 1 },
  // Horizontal 20 = padding del kit; top 14 = mismo offset que la Home neo.
  listContent: { paddingHorizontal: 20, paddingTop: 14 },
  emptyScroll: { paddingHorizontal: 20, paddingTop: 14 },
  heroSpacing: { marginTop: 16 },
  // ── Skeleton neumórfico (mismo padding que el feed: 20 / 14) ────────
  skeletonStack: { paddingHorizontal: 20, paddingTop: 14, gap: 16 },
  skelHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  // Alto de la caja del título real (fontSize 34 / lineHeight 40).
  skelTitleSlot: { height: 40, justifyContent: 'center' },
  skelTitle: { width: 140, height: 28, borderRadius: GASTOS_RADII.chip },
  skelCyclePill: { width: 150, height: 18, borderRadius: GASTOS_RADII.chip, marginTop: 6 },
  // 44 = `brotDisc` del header real (antes 46).
  skelBrot: { width: 44, height: 44, borderRadius: GASTOS_RADII.brotBtn },
  skelHero: { height: 168, borderRadius: GASTOS_RADII.hero },
  skelCalendar: { height: 300, borderRadius: GASTOS_RADII.card },
  skelFilterRow: { flexDirection: 'row', gap: 10 },
  skelChip: { width: 92, height: 40, borderRadius: GASTOS_RADII.chip },
  // 68 = paddingVertical 12×2 + tile 44 de `GastosMovRow`; 10 = el `movRows`
  // gap del kit, que es también el `rowShadowWrap marginTop` del feed vivo.
  skelRows: { gap: 10 },
  skelRow: { height: 68, borderRadius: GASTOS_RADII.row },
  // Encabezado de grupo-día (rhythm del kit: ~14px entre grupos).
  sectionHeaderWrap: { marginTop: 14 },
  // Fila: wrapper de sombra sin overflow (radius = fila) para que el SwipeRow no
  // clipe la sombra. `marginTop` = separación vertical entre filas (kit movRows
  // gap 10) — antes vivía en un View `rowWrap` externo (FIX D: nodo eliminado).
  rowShadowWrap: { borderRadius: GASTOS_RADII.row, marginTop: 10 },
  footerLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
  },
  footerText: { fontSize: 12, fontWeight: '700', fontFamily: nunitoFamily('700') },
  footerEnd: { alignItems: 'center', paddingVertical: 20 },
  footerEndText: { fontSize: 10.5, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1.8 },
})
