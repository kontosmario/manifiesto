// @i18n-ignore-file
/**
 * FIJOS neo — el kit del rediseño (design/fijos-2026-07) cableado a DATOS
 * REALES, con TODOS sus componentes montados: header, hero (E1-E8), Avisos
 * (A1-A6) y la sección "Todos tus fijos" (tabs + categorías + filas).
 *
 * Vive SOLO en la ruta dev `app/(app)/settings/dev/neo-fijos.tsx`; NO
 * reemplaza a `mobile/screens/home/fijos-v2-screen.tsx`. El swap de ruta es
 * posterior y está gateado por la aprobación visual del owner
 * (`REDESIGN_APPROVAL['fijos'] === 'pendiente'`).
 *
 * Spec: .superpowers/sdd/2026-07-29-fijos-cableado/wiring-spec.md
 * Decisiones: .superpowers/sdd/2026-07-29-fijos-cableado/controller-decisions.md
 *
 * ── Por qué hay un gate de carga y no se monta el kit directo ────────────
 * Cada campo de los 3 objetos `*Content` tiene un DEFAULT DE FIXTURE igual al
 * mockup. Montar el kit antes de que lleguen los datos mostraría los números
 * del mockup como si fueran reales — la falla se ve perfecta, que es lo que
 * la hace peligrosa. Por eso:
 *   · el kit se monta ÚNICAMENTE dentro del árbol post-gate;
 *   · los 3 `build*Content` del view-model devuelven el objeto COMPLETO, así
 *     que un campo olvidado es un error de tipos, no un número de mockup
 *     sobreviviendo en silencio;
 *   · mientras carga se rinde `NeoFijosSkeleton`, que no usa ni un
 *     componente del kit (solo `View`s planos con tokens de `FIJOS_SPEC`).
 *
 * ── `preview` ───────────────────────────────────────────────────────────
 * `true` desde la ruta dev. La Fijos VIEJA sigue montada en la tab
 * (`freezeOnBlur:false` → sus efectos siguen vivos), así que `preview` apaga
 * lo global que colisionaría. El MISMO componente sin `preview` es lo que
 * reemplaza a la vieja en el swap — no una variante paralela.
 *
 * ── ESCRITURAS REALES ───────────────────────────────────────────────────
 * El CTA "✓ Confirmar cobro" del estado E8 escribe `family_finance` de
 * verdad: NO es reversible desde acá y además descongela el saldo de Home.
 * Por eso va con `Alert` de confirmación explícito.
 */
import { useCallback, useMemo, useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'

import {
  FijosAvisos,
  FijosCategories,
  FijosHeader,
  FijosHero,
  fijosAvisosCategoriesSpacing,
  fijosHeaderHeroSpacing,
  fijosHeroAvisosSpacing,
} from '@/components/redesign/fijos/fijos-screen'
import { FIJOS_RADII, FIJOS_SPEC, type FijosMode } from '@/components/redesign/fijos/fijos-spec'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { useCommitmentExpenses } from '@/features/expenses/use-expenses'
import { groupFijosByCategory } from '@/features/fijos/fijos-aggregates.model'
import { useFijosController } from '@/features/fijos/use-fijos-controller'
import { useDismissedHikes } from '@/features/fijos/use-hike-dismiss-store'
import {
  buildAvisosContent,
  buildCategoriesContent,
  buildCategoryBuckets,
  buildCycleHeaderLabel,
  buildHeroContent,
  buildHikeRows,
  buildReminder,
  buildTickerItems,
  computeDaysIntoCycle,
  filterDueSoon,
  selectAvisosVariant,
  selectHeroVariant,
} from '@/features/fijos/neo-fijos-view-model'
import { useFixedExpenseCategories } from '@/features/categories/use-categories'
import { useCycleConfirmation } from '@/features/home/use-cycle-confirmation'
import { useFixedExpensePayments } from '@/features/fixed-expenses/use-fixed-expense-payments'
import { useFixedExpenses } from '@/features/fixed-expenses/use-fixed-expenses'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
// NO se monta `useMonthlyAccounting`: la spec (§2.2/C4) lo pedía para
// `daysIntoMonth`, pero el review del view-model —posterior— estableció que el
// header necesita el día DEL CICLO (`computeDaysIntoCycle`), no el del mes
// calendario. Con un ciclo semanal, `daysIntoMonth` produciría
// "Semana del 6 jul → 12 jul · día 22". El view-model supersede a la spec acá.
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { toast } from '@/lib/toast-bus'
import { nunitoFamily } from '@/theme/typography'
import { useThemeMode } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

/** Cap del ticker. Con duración fija de 30s, sin cap la VELOCIDAD escala con
 *  la cantidad de chips y el owner aprobaría una sensación que el usuario real
 *  no va a tener. El excedente se reporta en el banner de dev. */
const TICKER_CAP = 8

interface NeoFijosScreenProps {
  userId: string
  familyId: string
  /** `true` desde la ruta dev. Ver el bloque `preview` del header. */
  preview?: boolean
}

// `preview` no se desestructura: el único side-effect global que Fijos tiene es
// el tour, y esta pantalla no lo monta (ver el TODO al final del render).
// Realtime y telemetría NO EXISTEN en el cluster de Fijos — verificado, ningún
// `channel()` en sus hooks. El prop queda en la interfaz porque es el contrato
// que la ruta ya pasa y que el swap va a dejar de pasar.
export function NeoFijosScreen({ userId, familyId }: NeoFijosScreenProps) {
  const { t } = useTranslation()
  const mode = useThemeMode().resolvedMode as FijosMode
  const s = FIJOS_SPEC[mode]
  const isFocused = useIsFocused()

  // ── Datos ───────────────────────────────────────────────────────────────
  // Casi todo es CACHE-HIT del cluster que ya arma el controller (mismos
  // queryKeys, mismos deps) → cero round-trips extra.
  const controller = useFijosController(familyId)
  const payCycle = usePayCycle(familyId, { freeze: false })
  const fixedExpensesQuery = useFixedExpenses(familyId)
  const categoriesQuery = useFixedExpenseCategories(familyId)
  const dismissedHikes = useDismissedHikes()
  const snapshot = useHomeSnapshot(userId)
  const dashboard = useFamilyDashboard(familyId)

  const { confirmCycleStartingBalance, isSavingSalary } = useCycleConfirmation({
    dashboard,
    familyId,
    t,
    userId,
  })

  // `fixedExpenseIds` tiene que salir de ESTA misma lista o el queryKey difiere
  // del que ya cacheó el controller y se dispara un fetch de verdad.
  const fixedExpenseIds = useMemo(
    () => (fixedExpensesQuery.data ?? []).map((i) => i.id),
    [fixedExpensesQuery.data],
  )

  // Se monta SOLO para leer su `isLoading`: el controller no lo incluye en el
  // suyo, y sin este gate el hero muestra "0 de 16 · 0%" y después salta.
  const paymentsQuery = useFixedExpensePayments({
    familyId,
    fixedExpenseIds,
    cycleStart: payCycle.cycle.start,
    cycleEnd: payCycle.cycle.end,
  })

  // Su `isLoading` también entra al gate: los aumentos se derivan de acá, y sin
  // ellos la SELECCIÓN DE VARIANTE de Avisos sale mal (A2/A4 en vez de A1/A5),
  // que es peor que un número mal — la pantalla afirmaría "todo tranquilo".
  const commitmentExpensesQuery = useCommitmentExpenses(familyId)

  // ── Cantidades derivadas: fuente única, nada las recalcula ──────────────
  const summary = controller.summary
  const paidCount = summary.paidItems.length
  const pendingCount = summary.pendingItems.length
  const overdueCount = summary.overdueItems.length

  /** Los fijos que tocan ESTE ciclo (excluye `future`) — el "16" del mockup. */
  const cycleActiveCount = paidCount + pendingCount + overdueCount

  /**
   * Activos/pausados en la DB, INDEPENDIENTE del ciclo → predicado de E6/A6.
   * `fetchFixedExpenses` trae los CUATRO status (active|paused|completed|
   * archived) mientras `summarizeFijos` filtra a active||paused, así que este
   * filtro es load-bearing: con `items.length` crudo una familia cuyos fijos
   * están todos archivados caería en E1 "0 de 0" en vez de E6 "sin fijos".
   */
  const activeFixedCount = useMemo(
    () =>
      (fixedExpensesQuery.data ?? []).filter(
        (i) => i.status === 'active' || i.status === 'paused',
      ).length,
    [fixedExpensesQuery.data],
  )

  const isEmptyNoFijos = activeFixedCount === 0

  /**
   * Gatea E5 y los 4 campos `available*`. En modo `dynamic`
   * `effectiveMonthlyIncome` devuelve 0 POR DISEÑO, así que sin este gate
   * `availableRaw` sería `0 - total < 0` y TODA familia dinámica quedaría en E5
   * con la alarma falsa "⚠ te pasás este mes" para siempre.
   */
  const hasIncome = controller.incomeMode === 'fixed' && controller.monthlyIncome > 0

  /**
   * Unclamped a propósito: única fórmula que reproduce el fixture de E1 exacto.
   * NO `controller.freeAfterFijos` (clampeada a 0 y resta la meta de ahorro, así
   * que no puede representar el negativo de E5) ni `computeCycleDisponible`
   * (netea gasto variable). Consecuencia conocida: este "disponible" DIFIERE
   * del de Home, que sí netea variable. Sale del diseño, no del cableado.
   */
  const availableRaw = controller.monthlyIncome - summary.total

  const daysIntoCycle = computeDaysIntoCycle({
    today: payCycle.today,
    cycleStart: controller.cycleStart,
  })

  /** Último día del ciclo — convención de `formatCycleLabel` (end exclusivo). */
  const cycleLastDay = useMemo(() => {
    const d = new Date(controller.cycleEnd)
    d.setDate(d.getDate() - 1)
    return d
  }, [controller.cycleEnd])

  const segmentToday = useMemo(
    () => summary.pendingItems.some((i) => i.daysUntilDue === 0),
    [summary.pendingItems],
  )

  // ── Hero ────────────────────────────────────────────────────────────────
  const heroSelection = useMemo(
    () =>
      selectHeroVariant({
        activeFixedCount,
        availableRaw,
        cycleActiveCount,
        daysIntoCycle,
        hasIncome,
        isSalaryPendingConfirmation: payCycle.isSalaryPendingConfirmation,
        overdueCount,
        paidCount,
        pendingCount,
        // No existe selector de ediciones pasadas para Fijos. El parámetro se
        // mantiene para que el día que exista solo haya que pasar el flag.
        viewingClosedEdition: false,
      }),
    [
      activeFixedCount,
      availableRaw,
      cycleActiveCount,
      daysIntoCycle,
      hasIncome,
      payCycle.isSalaryPendingConfirmation,
      overdueCount,
      paidCount,
      pendingCount,
    ],
  )

  const heroContent = useMemo(
    () =>
      buildHeroContent({
        availableRaw,
        cycleActiveCount,
        cycleLastDay,
        cycleStart: controller.cycleStart,
        daysIntoCycle,
        hasIncome,
        isEmptyNoFijos,
        monthlyIncome: controller.monthlyIncome,
        overdueAmount: summary.overdueAmount,
        overdueCount,
        paidAmount: summary.paidAmount,
        paidCount,
        paidPct: summary.paidPct,
        pctOfIncome: controller.pctOfIncome,
        pendingAmount: summary.pendingAmount,
        pendingCount,
        salaryPaymentDay: payCycle.salaryPaymentDay,
        segmentToday,
        total: summary.total,
        variant: heroSelection.variant,
      }),
    [
      availableRaw,
      controller.cycleStart,
      controller.monthlyIncome,
      controller.pctOfIncome,
      cycleActiveCount,
      cycleLastDay,
      daysIntoCycle,
      hasIncome,
      heroSelection.variant,
      isEmptyNoFijos,
      overdueCount,
      paidCount,
      pendingCount,
      payCycle.salaryPaymentDay,
      segmentToday,
      summary.overdueAmount,
      summary.paidAmount,
      summary.paidPct,
      summary.pendingAmount,
      summary.total,
    ],
  )

  // ── Avisos ──────────────────────────────────────────────────────────────
  const dueSoon = useMemo(() => filterDueSoon(summary.pendingItems), [summary.pendingItems])

  const ticker = useMemo(
    () =>
      buildTickerItems({
        cap: TICKER_CAP,
        dueSoon,
        overdue: summary.overdueItems,
      }),
    [dueSoon, summary.overdueItems],
  )

  const hikeRows = useMemo(
    () => buildHikeRows({ dismissed: dismissedHikes, hikes: summary.hikes }),
    [dismissedHikes, summary.hikes],
  )

  const reminder = useMemo(
    () =>
      buildReminder({
        dismissed: dismissedHikes,
        dueSoon,
        hikes: summary.hikes,
        overdue: summary.overdueItems,
      }),
    [dismissedHikes, dueSoon, summary.hikes, summary.overdueItems],
  )

  const avisosSelection = useMemo(
    () =>
      selectAvisosVariant({
        activeFixedCount,
        cycleActiveCount,
        hikeCount: hikeRows.length,
        overdueCount,
        tickerCount: ticker.items.length,
      }),
    [activeFixedCount, cycleActiveCount, hikeRows.length, overdueCount, ticker.items.length],
  )

  const avisosContent = useMemo(
    () =>
      buildAvisosContent({
        hikeRows,
        isEmptyNoFijos,
        overdueCount,
        reminder,
        tickerItems: ticker.items,
        variant: avisosSelection.variant,
      }),
    [avisosSelection.variant, hikeRows, isEmptyNoFijos, overdueCount, reminder, ticker.items],
  )

  // ── "Todos tus fijos" ───────────────────────────────────────────────────
  const categories = useMemo(
    () =>
      (categoriesQuery.data ?? []).map((c) => ({
        color: c.color,
        id: c.id,
        name: c.displayName,
        rawName: c.name,
      })),
    [categoriesQuery.data],
  )

  /**
   * Las filas listan TODOS los fijos del ciclo activo, NO los del tab: el
   * fixture del mockup tiene `activeTab:'vencidos'` con `vencidosCount:'1'` y
   * 3 filas que suman 13 ítems, así que no puede ser la lista filtrada.
   * Por eso NO se usa `controller.groups`, que está construido sobre
   * `filteredItems` y sí está filtrado por tab.
   * Consecuencia a reportar, no a esconder: en el rediseño el tab no filtra
   * nada visible. Está en el banner de dev.
   */
  const allCycleGroups = useMemo(
    () =>
      groupFijosByCategory({
        categories,
        items: [...summary.paidItems, ...summary.pendingItems, ...summary.overdueItems],
      }),
    [categories, summary.paidItems, summary.pendingItems, summary.overdueItems],
  )

  // Colapsa las ~11 categorías reales a ≤3 buckets. Obligatorio: el kit mapea
  // con `key={group.category}` y `category` es una unión de 3 valores, así que
  // N grupos con la misma llave serían keys duplicadas de React.
  const categoryBuckets = useMemo(
    () => buildCategoryBuckets({ groups: allCycleGroups }),
    [allCycleGroups],
  )

  const categoriesContent = useMemo(
    () =>
      buildCategoriesContent({
        activeTab: controller.tab,
        groups: categoryBuckets.buckets,
        pagadosCount: paidCount,
        pendientesCount: pendingCount,
        vencidosCount: overdueCount,
      }),
    [controller.tab, categoryBuckets.buckets, overdueCount, paidCount, pendingCount],
  )

  const cycleHeaderLabel = buildCycleHeaderLabel(controller.cycleLabel, daysIntoCycle)

  // ── Handlers ────────────────────────────────────────────────────────────
  // No-op CON NOTA VISIBLE, no silencioso: un botón muerto se lee como bug, un
  // toast que nombra la fase es información.
  const handleToggleDropdown = useCallback(() => {
    toast.info('Selector de ciclos: fase posterior')
  }, [])

  const handlePressCalendar = useCallback(() => {
    toast.info('Alta en 2 pasos: Fase 3')
  }, [])

  const handlePressCategory = useCallback(() => {
    toast.info('Detalle de categoría: Fase 2')
  }, [])

  /** El alta VIEJA existe y funciona. Transitorio: la Fase 3 la reemplaza por
   *  el flujo de 2 pasos, que es también el destino del botón de calendario. */
  const handleAddFijo = useCallback(() => {
    router.push('/(app)/add-fixed-expense')
  }, [])

  /**
   * ESCRITURA REAL y NO reversible desde acá: ancla el ciclo y descongela el
   * saldo de Home. Por eso el `Alert` explícito antes de mutar.
   */
  const handleConfirmCobro = useCallback(() => {
    Alert.alert(
      'Confirmar cobro',
      'Esto confirma el cobro del ciclo en la base REAL: ancla el ciclo nuevo y descongela el saldo de Inicio. No se puede revertir desde esta pantalla.',
      [
        { style: 'cancel', text: 'Cancelar' },
        {
          onPress: () => confirmCycleStartingBalance(null),
          style: 'destructive',
          text: 'Confirmar',
        },
      ],
    )
  }, [confirmCycleStartingBalance])

  // ── Gate ────────────────────────────────────────────────────────────────
  // `isLoading` y NO `isFetched`: `useFixedExpensePayments` está `enabled` solo
  // si hay ≥1 id persistido, así que en una familia sin fijos la query nunca
  // corre y su `isFetched` queda `false` PARA SIEMPRE — el gate no abriría
  // nunca. En RQ v5 una query deshabilitada tiene `isLoading: false`.
  const ready =
    !controller.isLoading &&
    !paymentsQuery.isLoading &&
    !commitmentExpensesQuery.isLoading

  if (controller.error && controller.allItems.length === 0) {
    return (
      <Screen backgroundColor={s.bg} scrollable={false}>
        <ErrorState
          description={getErrorMessage(controller.error, t('states:error.server'))}
          onAction={() => void snapshot.refetch()}
        />
      </Screen>
    )
  }

  if (!ready) {
    return (
      <Screen backgroundColor={s.bg} scrollable={false}>
        <NeoFijosSkeleton mode={mode} />
      </Screen>
    )
  }

  return (
    <Screen backgroundColor={s.bg} contentContainerStyle={styles.body} scrollable>
      <NeoFijosDevBanner
        activeFixedCount={activeFixedCount}
        avisosReason={avisosSelection.reason}
        avisosVariant={avisosSelection.variant}
        collapsed={categoryBuckets.collapsed}
        cycleActiveCount={cycleActiveCount}
        futureCount={summary.futureItems.length}
        hasIncome={hasIncome}
        heroReason={heroSelection.reason}
        heroVariant={heroSelection.variant}
        incomeMode={controller.incomeMode}
        overdueCount={overdueCount}
        paidCount={paidCount}
        pendingCount={pendingCount}
        tickerDropped={ticker.dropped}
      />
      <FijosHeader
        cycleLabel={cycleHeaderLabel}
        mode={mode}
        onPressCalendar={handlePressCalendar}
        onToggleDropdown={handleToggleDropdown}
      />
      <View style={fijosHeaderHeroSpacing}>
        <FijosHero
          {...heroContent}
          // `animated={false}` + `paused` fuera de foco: mismo convenio que los
          // 6 call-sites del cableado de Gastos.
          animated={false}
          mode={mode}
          onPressConfirm={isSavingSalary ? undefined : handleConfirmCobro}
          onPressEmptyCta={handleAddFijo}
          paused={!isFocused}
          variant={heroSelection.variant}
        />
      </View>
      <View style={fijosHeroAvisosSpacing}>
        <FijosAvisos
          {...avisosContent}
          animated={false}
          mode={mode}
          onPressEmptyCta={handleAddFijo}
          // El ticker (30s) y el punto live (1.6s) NO se auto-gatean por foco,
          // a diferencia de las partículas del hero: sin esto los dos loops
          // siguen corriendo en el hilo de UI con la pantalla invisible.
          paused={!isFocused}
          variant={avisosSelection.variant}
        />
      </View>
      <View style={fijosAvisosCategoriesSpacing}>
        <FijosCategories
          {...categoriesContent}
          mode={mode}
          onPressAddFijo={handleAddFijo}
          onPressCategory={handlePressCategory}
          onSelectTab={controller.setTab}
        />
      </View>
      {/* TODO (fase posterior): el tour de Fijos, gateado con
          `enabled: !preview`. Omitido a propósito — con `preview` siempre true
          desde la ruta dev nunca correría, así que montarlo ahora sería riesgo
          sin beneficio. Hace falta antes del swap, no antes de mirar. */}
      {/* TODO (Fase 2): sheet de pago por fijo. El kit NO tiene ninguna
          superficie que reciba un `fixedExpenseId` (sus filas son por
          CATEGORÍA), así que marcar-pagado/revertir necesita UI propia fuera
          del kit — que es justo donde va a vivir el detalle de la Fase 2. */}
    </Screen>
  )
}

/**
 * Banner de dev — es un DELIVERABLE, no decoración: el objetivo declarado de
 * esta pantalla es "simular y ver qué falta", y esto es lo que lo hace
 * visible. Se compila fuera del bundle de release por el guard de `__DEV__`.
 */
function NeoFijosDevBanner(props: {
  activeFixedCount: number
  avisosReason: string
  avisosVariant: string
  collapsed: Array<{ bucket: string; realLabels: string[] }>
  cycleActiveCount: number
  futureCount: number
  hasIncome: boolean
  heroReason: string
  heroVariant: string
  incomeMode: 'fixed' | 'dynamic'
  overdueCount: number
  paidCount: number
  pendingCount: number
  tickerDropped: number
}) {
  const [open, setOpen] = useState(false)
  if (!__DEV__) return null

  const lines = [
    `hero ${props.heroVariant} — ${props.heroReason}`,
    `avisos ${props.avisosVariant} — ${props.avisosReason}`,
    `activos/pausados ${props.activeFixedCount} · este ciclo ${props.cycleActiveCount} (pagados ${props.paidCount} · pendientes ${props.pendingCount} · vencidos ${props.overdueCount})`,
    `ingreso ${props.incomeMode}${props.hasIncome ? '' : ' → sin sueldo fijo: E5 y "disponible" quedan gateados'}`,
    props.futureCount > 0
      ? `${props.futureCount} fijo(s) de ciclos futuros NO se cuentan en el hero ni en las tabs`
      : null,
    props.tickerDropped > 0
      ? `ticker: ${props.tickerDropped} ítem(s) fuera por el cap de ${TICKER_CAP} (la duración es fija, sin cap la velocidad escalaría)`
      : null,
    ...props.collapsed.map(
      (c) => `bucket ${c.bucket} ← ${c.realLabels.join(', ')}`,
    ),
    'las tabs NO filtran las filas: las filas listan todo el ciclo (es el mockup literal)',
    'sin superficie por-fijo en el kit → no se puede marcar pagado desde acá (Fase 2)',
    'detalle de categoría y alta en 2 pasos: fases posteriores, los botones avisan',
  ].filter(Boolean) as string[]

  return (
    <View style={styles.banner}>
      <Text onPress={() => setOpen((v) => !v)} style={styles.bannerTitle}>
        {`DEV · ${props.heroVariant}/${props.avisosVariant} · ${open ? 'ocultar' : `${lines.length} notas`}`}
      </Text>
      {open
        ? lines.map((l) => (
            <Text key={l} style={styles.bannerLine}>
              {`· ${l}`}
            </Text>
          ))
        : null}
    </View>
  )
}

/**
 * Placeholder de carga. Deliberadamente NO usa ni un componente del kit: el kit
 * trae fixtures del mockup por defecto, así que montarlo acá reintroduciría el
 * fixture-leak que el gate existe para evitar. Los altos matchean el contenido
 * real para que abrir no genere layout-shift. Sin animación.
 */
function NeoFijosSkeleton({ mode }: { mode: FijosMode }) {
  const s = FIJOS_SPEC[mode]
  return (
    <View
      accessibilityLabel="Cargando fijos"
      accessibilityRole="progressbar"
      style={styles.body}
    >
      <View style={styles.skHeaderRow}>
        <View style={[styles.skCyclePill, { backgroundColor: s.bg, boxShadow: s.ins }]} />
        <View
          style={[
            styles.skCalendarBtn,
            { backgroundColor: s.headerIconBtnBackground, boxShadow: s.headerIconBtnShadow },
          ]}
        />
      </View>
      <View
        style={[styles.skHero, { backgroundColor: s.cardBackground, boxShadow: s.heroShadow }]}
      />
      <View
        style={[
          styles.skAvisos,
          { backgroundColor: s.avisosCardBackground, boxShadow: s.avisosCardShadow },
        ]}
      />
      <View style={[styles.skSectionLabel, { backgroundColor: s.bg, boxShadow: s.ins }]} />
      <View style={styles.skTabsRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.skTab, { boxShadow: s.tabInactiveShadow }]} />
        ))}
      </View>
      <View style={styles.skRows}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[styles.skRow, { backgroundColor: s.rowBackground, boxShadow: s.rowShadow }]}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: 'rgba(217,115,85,0.12)',
    borderColor: '#D97355',
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  bannerLine: {
    color: '#D97355',
    fontFamily: nunitoFamily('700'),
    fontSize: 10.5,
    lineHeight: 15,
  },
  bannerTitle: {
    color: '#D97355',
    fontFamily: nunitoFamily('900'),
    fontSize: 11,
    letterSpacing: 0.4,
  },
  // Transcrito del markup, igual que el preview aprobado.
  body: { paddingHorizontal: 20, paddingTop: 10 },
  skAvisos: { borderRadius: FIJOS_RADII.card, height: 260, marginTop: 20 },
  skCalendarBtn: { borderRadius: 22, height: 44, width: 44 },
  skCyclePill: { borderRadius: 14, height: 18, width: 190 },
  skHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  skHero: { borderRadius: FIJOS_RADII.hero, height: 330, marginTop: 14 },
  skRow: { borderRadius: FIJOS_RADII.row, height: 68 },
  skRows: { gap: 10, marginTop: 12 },
  skSectionLabel: { borderRadius: 6, height: 12, marginTop: 20, width: 120 },
  skTab: { borderRadius: FIJOS_RADII.chip, flex: 1, height: 32 },
  skTabsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
})
