// @i18n-ignore-file
/**
 * FIJOS neo — el kit del rediseño (design/fijos-2026-07) cableado a DATOS
 * REALES. Vive SOLO en la ruta dev `app/(app)/settings/dev/neo-fijos.tsx`;
 * NO reemplaza a `mobile/screens/home/fijos-v2-screen.tsx`. El swap de ruta
 * es una fase posterior, gateada por la aprobación visual del owner
 * (`REDESIGN_APPROVAL['fijos'] === 'pendiente'`).
 *
 * Spec: .superpowers/sdd/2026-07-29-fijos-cableado/wiring-spec.md
 * Decisiones: .superpowers/sdd/2026-07-29-fijos-cableado/controller-decisions.md
 *
 * ── Por qué hay un gate de carga y no se monta el kit directo ────────────
 * Cada campo de `FijosHeroContent` tiene un DEFAULT DE FIXTURE igual al
 * mockup. Montar el kit antes de que lleguen los datos mostraría los
 * números del mockup como si fueran reales — la falla se ve perfecta, que
 * es lo que la hace peligrosa. Por eso:
 *   · el kit se monta ÚNICAMENTE dentro de `NeoFijosContent`;
 *   · `NeoFijosContent` RECIBE los objetos `*Content` completos como prop,
 *     no los construye — así no existe camino de render donde el kit vea un
 *     `Partial<>`;
 *   · mientras carga se rinde `NeoFijosSkeleton`, que no usa ni un
 *     componente del kit (solo `View`s planos con tokens de `FIJOS_SPEC`).
 *
 * ── `preview` ───────────────────────────────────────────────────────────
 * `true` desde la ruta dev. La Fijos VIEJA sigue montada en la tab
 * (`freezeOnBlur:false` → sus efectos siguen vivos), así que `preview`
 * apaga lo global que colisionaría. El MISMO componente sin `preview` es lo
 * que reemplaza a la vieja en el swap — no una variante paralela.
 *
 * ── Estado del cableado (fase 1 de 3) ───────────────────────────────────
 * Montado: `FijosHeader` + `FijosHero` (variantes E1-E8 derivadas de datos).
 * Pendiente: `FijosAvisos` (A1-A6), `FijosTabs`/`FijosCategories`, el banner
 * de dev y el sheet de pago. Ver los `TODO (paso 2/3)` más abajo — la
 * estructura está hecha para que sumarlos sea un append, no un rewrite.
 */
import { useCallback, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'

import { FijosHeader, FijosHero, fijosHeaderHeroSpacing } from '@/components/redesign/fijos/fijos-screen'
import { FIJOS_RADII, FIJOS_SPEC, type FijosMode } from '@/components/redesign/fijos/fijos-spec'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { useCommitmentExpenses } from '@/features/expenses/use-expenses'
import { useFijosController } from '@/features/fijos/use-fijos-controller'
import {
  buildCycleHeaderLabel,
  buildHeroContent,
  computeDaysIntoCycle,
  selectHeroVariant,
} from '@/features/fijos/neo-fijos-view-model'
import { useFixedExpensePayments } from '@/features/fixed-expenses/use-fixed-expense-payments'
import { useFixedExpenses } from '@/features/fixed-expenses/use-fixed-expenses'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
// NO se monta `useMonthlyAccounting`: la spec (§2.2/C4) lo pedía para
// `daysIntoMonth`, pero el review del view-model —posterior— estableció que el
// header necesita el día DEL CICLO (`computeDaysIntoCycle`), no el del mes
// calendario. Con un ciclo semanal, `daysIntoMonth` produciría
// "Semana del 6 jul → 12 jul · día 22". El view-model supersede a la spec acá.
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { toast } from '@/lib/toast-bus'
import { useThemeMode } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

interface NeoFijosScreenProps {
  userId: string
  familyId: string
  /**
   * `true` desde `app/(app)/settings/dev/neo-fijos.tsx`. Ver el bloque
   * `preview` del header del archivo.
   */
  preview?: boolean
}

// `preview` NO se desestructura todavía a propósito: en esta fase 1 no hay
// ningún side-effect que gatear. El único que Fijos tiene es el tour, y se
// monta en la fase 3 (ver el TODO al final del render). Realtime y telemetría
// no existen en el cluster de Fijos — verificado, no hay un `channel()` en
// ninguno de sus hooks. El prop queda en la interfaz porque es el contrato
// que la ruta dev ya pasa y que el swap va a dejar de pasar.
export function NeoFijosScreen({ userId, familyId }: NeoFijosScreenProps) {
  const { t } = useTranslation()
  const mode = useThemeMode().resolvedMode as FijosMode
  const s = FIJOS_SPEC[mode]
  const isFocused = useIsFocused()

  // ── Datos ───────────────────────────────────────────────────────────────
  // Casi todo lo de abajo es CACHE-HIT del cluster que ya arma el controller
  // (mismos queryKeys, mismos deps) → cero round-trips extra. Los que se
  // montan "solo para leer su isLoading" están marcados.
  const controller = useFijosController(familyId)
  const payCycle = usePayCycle(familyId, { freeze: false })
  const fixedExpensesQuery = useFixedExpenses(familyId)
  const snapshot = useHomeSnapshot(userId)

  // `fixedExpenseIds` tiene que salir de ESTA misma lista o el queryKey
  // difiere del que ya cacheó el controller y se dispara un fetch de verdad.
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

  // Su `isLoading` también entra al gate: los aumentos se derivan de acá, y
  // sin ellos la SELECCIÓN DE VARIANTE sale mal (A2/A4 en vez de A1/A5), que
  // es peor que un número mal — la pantalla afirmaría "todo tranquilo".
  const commitmentExpensesQuery = useCommitmentExpenses(familyId)

  // ── Cantidades derivadas: fuente única, nada las recalcula ──────────────
  const summary = controller.summary
  const paidCount = summary.paidItems.length
  const pendingCount = summary.pendingItems.length
  const overdueCount = summary.overdueItems.length

  /** Los fijos que tocan ESTE ciclo (excluye `future`) — el "16" del mockup. */
  const cycleActiveCount = paidCount + pendingCount + overdueCount

  /**
   * Activos/pausados en la DB, INDEPENDIENTE del ciclo → es el predicado de
   * E6 "sin fijos". `fetchFixedExpenses` trae los CUATRO status
   * (active|paused|completed|archived) mientras `summarizeFijos` filtra a
   * active||paused, así que este filtro es load-bearing: con `items.length`
   * crudo, una familia cuyos fijos están todos archivados caería en E1
   * mostrando "0 de 0" en vez de E6.
   */
  const activeFixedCount = useMemo(
    () =>
      (fixedExpensesQuery.data ?? []).filter(
        (i) => i.status === 'active' || i.status === 'paused',
      ).length,
    [fixedExpensesQuery.data],
  )

  /**
   * Gatea E5 y los 4 campos `available*`. En modo `dynamic`
   * `effectiveMonthlyIncome` devuelve 0 POR DISEÑO, así que sin este gate
   * `availableRaw` sería `0 - total < 0` y TODA familia dinámica quedaría en
   * E5 con la alarma falsa "⚠ te pasás este mes" para siempre.
   */
  const hasIncome = controller.incomeMode === 'fixed' && controller.monthlyIncome > 0

  /**
   * Unclamped a propósito: es la única fórmula que reproduce el fixture de E1
   * exacto. NO usar `controller.freeAfterFijos` (clampeada a 0 y resta la
   * meta de ahorro, así que no puede representar el negativo de E5) ni
   * `computeCycleDisponible` (netea gasto variable).
   * Consecuencia conocida: este "disponible" DIFIERE del de Home, que sí
   * netea gasto variable. Es inconsistencia de producto que sale del diseño.
   */
  const availableRaw = controller.monthlyIncome - summary.total

  const daysIntoCycle = computeDaysIntoCycle({
    today: payCycle.today,
    cycleStart: controller.cycleStart,
  })

  /** Último día del ciclo — misma convención que `formatCycleLabel` (end exclusivo). */
  const cycleLastDay = useMemo(() => {
    const d = new Date(controller.cycleEnd)
    d.setDate(d.getDate() - 1)
    return d
  }, [controller.cycleEnd])

  const segmentToday = useMemo(
    () => summary.pendingItems.some((i) => i.daysUntilDue === 0),
    [summary.pendingItems],
  )

  // ── Variante + contenido del hero ───────────────────────────────────────
  const heroSelection = useMemo(
    () =>
      selectHeroVariant({
        activeFixedCount,
        cycleActiveCount,
        paidCount,
        pendingCount,
        overdueCount,
        daysIntoCycle,
        hasIncome,
        availableRaw,
        isSalaryPendingConfirmation: payCycle.isSalaryPendingConfirmation,
        // No existe selector de ediciones pasadas para Fijos. El parámetro se
        // mantiene para que el día que exista solo haya que pasar el flag.
        viewingClosedEdition: false,
      }),
    [
      activeFixedCount,
      cycleActiveCount,
      paidCount,
      pendingCount,
      overdueCount,
      daysIntoCycle,
      hasIncome,
      availableRaw,
      payCycle.isSalaryPendingConfirmation,
    ],
  )

  const heroContent = useMemo(
    () =>
      buildHeroContent({
        variant: heroSelection.variant,
        // Distingue E6 "sin fijos" de E6′ "hay fijos pero ninguno toca este
        // ciclo" — el mismo valor que decidió el paso 2 vs 3 del selector.
        isEmptyNoFijos: activeFixedCount === 0,
        cycleLastDay,
        cycleStart: controller.cycleStart,
        daysIntoCycle,
        salaryPaymentDay: payCycle.salaryPaymentDay,
        paidCount,
        pendingCount,
        overdueCount,
        cycleActiveCount,
        paidAmount: summary.paidAmount,
        pendingAmount: summary.pendingAmount,
        overdueAmount: summary.overdueAmount,
        total: summary.total,
        paidPct: summary.paidPct,
        hasIncome,
        monthlyIncome: controller.monthlyIncome,
        availableRaw,
        pctOfIncome: controller.pctOfIncome,
        segmentToday,
      }),
    [
      heroSelection.variant,
      activeFixedCount,
      cycleLastDay,
      controller.cycleStart,
      controller.monthlyIncome,
      controller.pctOfIncome,
      daysIntoCycle,
      payCycle.salaryPaymentDay,
      paidCount,
      pendingCount,
      overdueCount,
      cycleActiveCount,
      summary.paidAmount,
      summary.pendingAmount,
      summary.overdueAmount,
      summary.total,
      summary.paidPct,
      hasIncome,
      availableRaw,
      segmentToday,
    ],
  )

  const cycleHeaderLabel = buildCycleHeaderLabel(
    controller.cycleLabel,
    daysIntoCycle,
  )

  // ── Handlers ────────────────────────────────────────────────────────────
  // No-op CON NOTA VISIBLE, no silencioso: un botón muerto se lee como bug,
  // un toast que nombra la fase es información. Los destinos reales de estos
  // dos son fases posteriores que todavía no existen.
  const handleToggleDropdown = useCallback(() => {
    toast.info('Selector de ciclos: fase posterior')
  }, [])

  const handlePressCalendar = useCallback(() => {
    toast.info('Alta en 2 pasos: Fase 3')
  }, [])

  // ── Gate ────────────────────────────────────────────────────────────────
  // `isLoading` y NO `isFetched`: `useFixedExpensePayments` está `enabled`
  // solo si hay ≥1 id persistido, así que en una familia sin fijos la query
  // nunca corre y su `isFetched` queda `false` PARA SIEMPRE — el gate no
  // abriría nunca. En RQ v5 una query deshabilitada tiene `isLoading: false`.
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
    <Screen
      backgroundColor={s.bg}
      contentContainerStyle={styles.body}
      scrollable
    >
      {/* TODO (paso 3): NeoFijosDevBanner — variante + reason de hero y
          avisos, los conteos derivados, el colapso de las 11 categorías
          reales en los 3 buckets del kit, los ítems del ticker descartados
          por el cap, y los no-ops de navegación con su fase. */}
      <FijosHeader
        cycleLabel={cycleHeaderLabel}
        mode={mode}
        onPressCalendar={handlePressCalendar}
        onToggleDropdown={handleToggleDropdown}
      />
      <View style={fijosHeaderHeroSpacing}>
        <FijosHero
          {...heroContent}
          // `animated={false}` + `paused` fuera de foco: el mismo convenio
          // que los 6 call-sites del cableado de Gastos.
          animated={false}
          mode={mode}
          paused={!isFocused}
          variant={heroSelection.variant}
        />
      </View>
      {/* TODO (paso 2): FijosAvisos con su variante A1-A6 derivada
          (`selectAvisosVariant` + `buildAvisosContent` ya existen en el
          view-model), envuelto en `fijosHeroAvisosSpacing`, con
          `paused={!isFocused}` — el ticker (30s) y el punto live (1.6s) NO
          se auto-gatean por foco, a diferencia de las partículas. */}
      {/* TODO (paso 2): FijosTabs + FijosCategories con
          `fijosAvisosCategoriesSpacing` y `buildCategoriesContent`. */}
      {/* TODO (paso 3): sheet de pago (__DEV__) abierto desde
          `onPressCategory`, reusando useRecordFixedExpensePayment /
          useRevertFixedExpensePayment. Las escrituras son REALES. */}
      {/* TODO (paso 3): el tour de Fijos, gateado con `enabled: !preview`.
          Omitido a propósito en la fase 1 — con `preview` siempre true desde
          la ruta dev nunca correría, así que montarlo ahora sería riesgo sin
          beneficio. Hace falta antes del swap, no antes de mirar la pantalla. */}
    </Screen>
  )
}

/**
 * Placeholder de carga. Deliberadamente NO usa ni un componente del kit: el
 * kit trae fixtures del mockup por defecto, así que montarlo acá
 * reintroduciría el fixture-leak que el gate existe para evitar.
 * Los altos matchean el contenido real para que abrir no genere
 * layout-shift. Sin animación (el cableado no agrega ninguna).
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
        <View
          style={[
            styles.skCyclePill,
            { backgroundColor: s.bg, boxShadow: s.ins },
          ]}
        />
        <View
          style={[
            styles.skCalendarBtn,
            {
              backgroundColor: s.headerIconBtnBackground,
              boxShadow: s.headerIconBtnShadow,
            },
          ]}
        />
      </View>
      <View
        style={[
          styles.skHero,
          { backgroundColor: s.cardBackground, boxShadow: s.heroShadow },
        ]}
      />
      <View
        style={[
          styles.skAvisos,
          {
            backgroundColor: s.avisosCardBackground,
            boxShadow: s.avisosCardShadow,
          },
        ]}
      />
      <View
        style={[styles.skSectionLabel, { backgroundColor: s.bg, boxShadow: s.ins }]}
      />
      <View style={styles.skTabsRow}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[styles.skTab, { boxShadow: s.tabInactiveShadow }]}
          />
        ))}
      </View>
      <View style={styles.skRows}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.skRow,
              { backgroundColor: s.rowBackground, boxShadow: s.rowShadow },
            ]}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Transcrito del markup, igual que el preview aprobado.
  body: { paddingHorizontal: 20, paddingTop: 10 },
  skAvisos: {
    borderRadius: FIJOS_RADII.card,
    height: 260,
    marginTop: 20,
  },
  skCalendarBtn: { borderRadius: 22, height: 44, width: 44 },
  skCyclePill: { borderRadius: 14, height: 18, width: 190 },
  skHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  skHero: {
    borderRadius: FIJOS_RADII.hero,
    height: 330,
    marginTop: 14,
  },
  skRow: { borderRadius: FIJOS_RADII.row, height: 68 },
  skRows: { gap: 10, marginTop: 12 },
  skSectionLabel: {
    borderRadius: 6,
    height: 12,
    marginTop: 20,
    width: 120,
  },
  skTab: { borderRadius: FIJOS_RADII.chip, flex: 1, height: 32 },
  skTabsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
})
