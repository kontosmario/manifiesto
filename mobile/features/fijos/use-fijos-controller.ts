import { useEffect, useMemo, useRef, useState } from 'react'
import { useFixedExpenseCategories } from '@/features/categories/use-categories'
import { useCommitmentExpenses } from '@/features/expenses/use-expenses'
import {
  effectiveMonthlyIncome,
  effectiveSavingsGoal,
  resolveIncomeMode,
} from '@/features/finance/family-finance.model'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { useFixedExpenses } from '@/features/fixed-expenses/use-fixed-expenses'
import { useFixedExpensePayments } from '@/features/fixed-expenses/use-fixed-expense-payments'
import {
  groupFijosByCategory,
  summarizeFijos,
  type FijoCategoryGroup,
  type FijoItem,
  type FijosCycleSummary,
} from '@/features/fijos/fijos-aggregates.model'
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { useMonthlyAccounting } from '@/hooks/use-monthly-accounting'
import { financeToCycleConfig } from '@/utils/finance-cycle-config'
import { formatCycleLabel } from '@/utils/format-cycle-label'

/**
 * Tabs del listado (2026-05-31, refinado a 3 buckets):
 *  - 'vencidos'   → overdue (cuotas ya vencidas sin pagar).
 *                   Lo MÁS urgente. Color rojo para que salte primero.
 *  - 'pendientes' → pending (cuotas del ciclo activo que aún no vencieron).
 *  - 'pagados'    → paid (pago directo en cycle + cycle covered by
 *                   prior payment, ej. trimestrales recién pagados).
 *
 * Historia:
 *   - v1: 'todos' (poco scannable) y 'zombis' (deprecated). Removidos.
 *   - v2: 3 buckets (Pendientes+Vencidos juntos). Separamos en v3.
 *   - v3: 4 buckets (Vencidos / Pendientes / Pagados / Próximos).
 *   - v4 (HOY): 3 buckets. "Próximos" (future) era casi siempre vacía
 *     post-cycle-coverage fix — la info de fijos programados sin pagar
 *     pasa a un BANNER contextual arriba del listado en lugar de tab
 *     dedicada. Patrón típico de apps Bills/PocketGuard. Decisión
 *     después de comparable analysis.
 */
export type FijosTab = 'vencidos' | 'pendientes' | 'pagados'

export interface UseFijosControllerResult {
  isLoading: boolean
  error: unknown
  summary: FijosCycleSummary
  allItems: FijoItem[]
  filteredItems: FijoItem[]
  groups: FijoCategoryGroup[]
  tab: FijosTab
  setTab: (tab: FijosTab) => void
  /** Tabs con datos, en orden de urgencia (vencidos → pendientes → pagados).
   *  Las vacías no se muestran; si ninguna tiene datos → ['pendientes']. */
  visibleTabs: FijosTab[]
  monthlyIncome: number
  freeAfterFijos: number
  pctOfIncome: number
  /** 'dynamic' = hogar sin sueldo fijo — el hero oculta dinero libre / % del sueldo. */
  incomeMode: 'fixed' | 'dynamic'
  today: Date
  cycleStart: Date
  cycleEnd: Date
  cycleDays: number
  cycleLabel: string
}

const DEFAULT_SUMMARY: FijosCycleSummary = {
  total: 0,
  paidAmount: 0,
  pendingAmount: 0,
  overdueAmount: 0,
  paidPct: 0,
  pendingPct: 0,
  overduePct: 0,
  paidItems: [],
  pendingItems: [],
  overdueItems: [],
  futureItems: [],
  upcoming: [],
  zombies: [],
  hikes: [],
  daysToNextPayment: null,
  todayDay: 1,
  cycleDays: 30,
  daysRemaining: 30,
}

export function useFijosController(familyId: string): UseFijosControllerResult {
  // MODELO DE DOS PLANOS — los fijos viven en el plano OBLIGACIONES, que
  // SIEMPRE va en tiempo real: un fijo vence cuando vence, lo haya
  // confirmado el cobro o no. Por eso pedimos `freeze: false` a ambos
  // hooks. Si dejáramos el freeze (default, plano PLATA), tras el día de
  // cobro sin confirmar el ciclo quedaba pegado al mes anterior: los pagos
  // del ciclo viejo hacían que `paidThisPeriod` short-circuiteara a
  // 'paid', y los fijos de ESTE ciclo (recién vencidos) quedaban
  // invisibles. El saldo del Home sí sigue congelado (usa el default).
  //   · cycle (freeze:false) → ventana real para los payments + label.
  //   · monthlyAccounting (freeze:false) → ventana real de clasificación
  //     (paid/pending/overdue contra el calendario real).
  const { cycle, today } = usePayCycle(familyId, { freeze: false })
  const monthlyAccounting = useMonthlyAccounting(familyId, { freeze: false })
  // El default se inicializa a 'pendientes' pero el effect abajo lo
  // promueve a 'vencidos' si hay vencidos al cargar — para que el
  // primer paint muestre lo más urgente (mora arrastrada).
  const [tab, setTab] = useState<FijosTab>('pendientes')
  const userInteractedWithTabsRef = useRef(false)
  const setTabUserDriven = useMemo(
    () => (next: FijosTab) => {
      userInteractedWithTabsRef.current = true
      setTab(next)
    },
    [],
  )

  const categoriesQuery = useFixedExpenseCategories(familyId)
  const fixedExpensesQuery = useFixedExpenses(familyId)
  const financeQuery = useFamilyFinance(familyId)
  // Histórico de pagos de fijos sin pasar por el cap del `home_snapshot`
  // — necesario para que el badge de variación de precio compare contra
  // el pago anterior real, incluso cuando la familia tiene mucho gasto
  // variable en el medio.
  const commitmentExpensesQuery = useCommitmentExpenses(familyId)

  const itemsData = fixedExpensesQuery.data
  const items = useMemo(() => itemsData ?? [], [itemsData])
  const fixedExpenseIds = useMemo(() => items.map((i) => i.id), [items])
  const paymentsQuery = useFixedExpensePayments({
    familyId,
    fixedExpenseIds,
    cycleStart: cycle.start,
    cycleEnd: cycle.end,
  })

  const categoriesById = useMemo(() => {
    const m = new Map<string, { id: string; name: string; color: string }>()
    for (const c of categoriesQuery.data ?? []) {
      // Display localizado NO destructivo (== name crudo si renombrada).
      m.set(c.id, { id: c.id, name: c.displayName, color: c.color })
    }
    return m
  }, [categoriesQuery.data])

  // effectiveMonthlyIncome: en dinámico es 0 aunque la columna traiga un
  // sueldo stale — sin esto el detalle de cada fijo mostraba "% de tu
  // sueldo mensual" contra un sueldo que el modo declara inexistente
  // (review 2026-07-08; el hero ya lo tapaba con showIncomeStats, el
  // panel de detalle no).
  const monthlyIncomeForSummary = effectiveMonthlyIncome(financeQuery.data)
  const summary = useMemo(() => {
    if (items.length === 0) return DEFAULT_SUMMARY
    return summarizeFijos({
      items,
      paymentsThisCycle: paymentsQuery.data ?? [],
      commitmentExpenses: commitmentExpensesQuery.data ?? [],
      categoriesById,
      today,
      monthlyStart: monthlyAccounting.start,
      monthlyEnd: monthlyAccounting.end,
      monthlyDays: monthlyAccounting.days,
      monthlyIncome: monthlyIncomeForSummary,
    })
  }, [
    items,
    paymentsQuery.data,
    commitmentExpensesQuery.data,
    categoriesById,
    today,
    monthlyAccounting.start,
    monthlyAccounting.end,
    monthlyAccounting.days,
    monthlyIncomeForSummary,
  ])

  // `allItems` incluye los `future` para que pantallas que listan el
  // catálogo completo (ej: AsesorFijos) sigan viéndolos. En la pantalla
  // de Fijos los `future` no caen en ningún tab (vencen en un ciclo
  // posterior) y no se listan hasta que su ciclo llegue.
  const allItems = useMemo(
    () => [
      ...summary.paidItems,
      ...summary.pendingItems,
      ...summary.overdueItems,
      ...summary.futureItems,
    ],
    [
      summary.paidItems,
      summary.pendingItems,
      summary.overdueItems,
      summary.futureItems,
    ],
  )

  const filteredItems = useMemo(() => {
    // 3 buckets (2026-05-31 v4):
    //   vencidos   → overdue
    //   pendientes → pending
    //   pagados    → paid (incluye paid-via-coverage)
    // Future items NO van a ningún tab (vencen en un ciclo posterior);
    // no se listan en la pantalla de Fijos hasta que su ciclo llega.
    if (tab === 'vencidos') return summary.overdueItems
    if (tab === 'pagados') return summary.paidItems
    return summary.pendingItems
  }, [tab, summary])

  // Solo las tabs con datos, en orden de urgencia.
  //
  // Puede quedar VACÍO, y está bien: pasa cuando ningún fijo cae en el ciclo
  // (p. ej. todos son 'future', un trimestral ya pagado). Antes se caía a
  // `['pendientes']` para no dejar la barra vacía, pero eso dejaba una tab
  // sola diciendo "Pendientes 0" — un filtro que no filtra nada. Con el array
  // vacío, la barra entera se esconde (owner 2026-08-08).
  const visibleTabs = useMemo<FijosTab[]>(() => {
    return (['vencidos', 'pendientes', 'pagados'] as FijosTab[]).filter((t) =>
      t === 'vencidos'
        ? summary.overdueItems.length > 0
        : t === 'pendientes'
          ? summary.pendingItems.length > 0
          : summary.paidItems.length > 0,
    )
  }, [
    summary.overdueItems.length,
    summary.pendingItems.length,
    summary.paidItems.length,
  ])

  // Mantén el tab activo SIEMPRE válido + default al más urgente visible.
  //  - Si el tab activo se quedó sin datos (ej. pagaste el último vencido), la
  //    tab desaparece → saltamos a la primera visible (orden de urgencia).
  //  - En la primera carga (sin interacción del user) abrimos en la más urgente
  //    visible. Una vez que el user tocó una tab, respetamos su selección —
  //    salvo que esa tab desaparezca.
  useEffect(() => {
    if (fixedExpensesQuery.isLoading) return
    // Sin ninguna tab con datos no hay a dónde redirigir: se deja el tab como
    // está (sigue siendo un valor válido del tipo) y la barra no se dibuja.
    if (visibleTabs.length === 0) return
    if (!visibleTabs.includes(tab)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- redirección cuando el tab activo se queda sin datos
      setTab(visibleTabs[0])
      return
    }
    if (!userInteractedWithTabsRef.current && tab !== visibleTabs[0]) {
      setTab(visibleTabs[0])
    }
  }, [fixedExpensesQuery.isLoading, visibleTabs, tab])

  const categories = useMemo(
    () =>
      (categoriesQuery.data ?? []).map((c) => ({
        id: c.id,
        // Display localizado NO destructivo (== name crudo si renombrada).
        name: c.displayName,
        // Crudo de la DB → fuente para el ícono del grupo (matcher ES).
        rawName: c.name,
        color: c.color,
      })),
    [categoriesQuery.data],
  )

  const groups = useMemo(
    () => groupFijosByCategory({ items: filteredItems, categories }),
    [filteredItems, categories],
  )

  const monthlyIncome = effectiveMonthlyIncome(financeQuery.data)
  const savingsGoal = Math.max(0, effectiveSavingsGoal(financeQuery.data))
  // "Dinero libre este mes" es lo que queda DESPUÉS de que el usuario
  // pagó sus fijos Y reservó lo que tenía planeado ahorrar — la
  // misma fórmula canónica que usan Control/Home/Daily Budget Engine
  // para el cupo diario:
  //   libreMes = sueldo − fijos − ahorro
  // Antes solo se restaban fijos, así que con ahorro configurado y
  // sin fijos cargados, el hero mostraba el sueldo completo como
  // "libre" — sobre-prometía.
  const freeAfterFijos = Math.max(
    0,
    monthlyIncome - summary.total - savingsGoal,
  )
  const pctOfIncome =
    monthlyIncome > 0 ? Math.round((summary.total / monthlyIncome) * 100) : 0
  // Dinámico: "dinero libre" y "% de tu sueldo" no tienen base (no hay
  // sueldo) — el hero oculta esa fila.
  const incomeMode = resolveIncomeMode(financeQuery.data)

  const cycleType = useMemo(
    () => financeToCycleConfig(financeQuery.data).cycle_type,
    [financeQuery.data],
  )
  const cycleLabel = useMemo(
    () => formatCycleLabel(cycle, cycleType),
    [cycle, cycleType],
  )

  return {
    isLoading:
      fixedExpensesQuery.isLoading ||
      categoriesQuery.isLoading ||
      financeQuery.isLoading,
    error: fixedExpensesQuery.error ?? categoriesQuery.error ?? financeQuery.error ?? null,
    summary,
    allItems,
    filteredItems,
    groups,
    tab,
    setTab: setTabUserDriven,
    visibleTabs,
    monthlyIncome,
    freeAfterFijos,
    pctOfIncome,
    incomeMode,
    today,
    cycleStart: cycle.start,
    cycleEnd: cycle.end,
    cycleDays: cycle.days,
    cycleLabel,
  }
}
