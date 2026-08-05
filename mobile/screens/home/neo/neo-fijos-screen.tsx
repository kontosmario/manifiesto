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
 * Por eso va con `neoConfirm` de confirmación explícito.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { useQueryClient } from '@tanstack/react-query'
import { useIsFocused } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'

import {
  FIJOS_TOUR,
  FIJOS_TOUR_STEPS,
  TourTarget,
  useRegisterTourScrollView,
  useScreenTour,
  useTourTargetRef,
} from '@/features/tours'
import { ConfirmFixedPaymentSheet } from '@/components/fijos/confirm-fixed-payment-sheet'
// La lista de "Todos tus fijos" reusa el componente COLAPSABLE de la pantalla
// viva, no las filas del kit. El kit dibuja UNA fila por categoría, sin
// expansión y sin superficie por-fijo, así que no puede mostrar los fijos
// adentro de su categoría ni tener un botón "Pagar" por fijo — que es el
// comportamiento pedido. Reusarlo además elimina el colapso de las ~11
// categorías reales a las 3 llaves del kit: van todas con su nombre e ícono.
import { FijoCategoryGroups } from '@/components/fijos/fijo-category-groups'
// La piel del rediseño para esa lista. El provider es lo ÚNICO que la separa
// de la que dibuja la pantalla viva: sin él, los mismos componentes resuelven
// sus tokens de siempre (ver el docblock de fijos-skin.tsx).
import { FijosSkinProvider } from '@/components/fijos/fijos-skin'
import {
  FijosAvisos,
  FijosHeader,
  FijosHero,
  FijosTabs,
  fijosAvisosCategoriesSpacing,
  fijosHeaderHeroSpacing,
  fijosHeroAvisosSpacing,
} from '@/components/redesign/fijos/fijos-screen'
import { FIJOS_RADII, FIJOS_SPEC, type FijosMode } from '@/components/redesign/fijos/fijos-spec'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { useCommitmentExpenses } from '@/features/expenses/use-expenses'
import type { FijoItem } from '@/features/fijos/fijos-aggregates.model'
import { isPersistedFixedExpenseId } from '@/features/fixed-expenses/fixed-expense-id'
import { isOptimisticPaymentId } from '@/features/fixed-expenses/fixed-expense-payment.model'
import {
  useDeleteFixedExpense,
  useRecordFixedExpensePayment,
  useRevertFixedExpensePayment,
} from '@/features/fixed-expenses/use-fixed-expenses'
import { triggerHaptic } from '@/lib/haptics'
import { useFijosController, type FijosTab } from '@/features/fijos/use-fijos-controller'
import { useDismissedHikes } from '@/features/fijos/use-hike-dismiss-store'
import {
  buildAvisosContent,
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
import { useCycleConfirmation } from '@/features/home/use-cycle-confirmation'
import { useFixedExpensePayments } from '@/features/fixed-expenses/use-fixed-expense-payments'
import { useFixedExpenses } from '@/features/fixed-expenses/use-fixed-expenses'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { useGatedLayout } from '@/hooks/use-layout-transition-gate'
// NO se monta `useMonthlyAccounting`: la spec (§2.2/C4) lo pedía para
// `daysIntoMonth`, pero el review del view-model —posterior— estableció que el
// header necesita el día DEL CICLO (`computeDaysIntoCycle`), no el del mes
// calendario. Con un ciclo semanal, `daysIntoMonth` produciría
// "Semana del 6 jul → 12 jul · día 22". El view-model supersede a la spec acá.
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { motionDurations, motionEasings } from '@/lib/motion'
import { neoConfirm } from '@/lib/confirm-bus'
import { toast } from '@/lib/toast-bus'
import { brand } from '@/theme/palette'
import { nunitoFamily } from '@/theme/typography'
import { useThemeMode } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

/** Cap del ticker. Con duración fija de 30s, sin cap la VELOCIDAD escala con
 *  la cantidad de chips y el owner aprobaría una sensación que el usuario real
 *  no va a tener. El excedente se reporta en el banner de dev. */
const TICKER_CAP = 8

/** Aire sobre el título al auto-scrollear a la sección al cambiar de tab. */
const SECTION_SCROLL_PADDING = 8

/**
 * `measure` existe en runtime en todo host component (viene de `NativeMethods`)
 * pero los tipos de `ScrollView` no lo exponen. Se tipa la forma mínima que se
 * usa en vez de castear a `any`, así el callback conserva sus tipos.
 */
type Measurable = {
  measure?: (
    callback: (
      x: number,
      y: number,
      width: number,
      height: number,
      pageX: number,
      pageY: number,
    ) => void,
  ) => void
}

interface NeoFijosScreenProps {
  userId: string
  familyId: string
  /** `true` desde la ruta dev. Ver el bloque `preview` del header. */
  preview?: boolean
}

// `preview` apaga el único side-effect GLOBAL de esta pantalla: el registro del
// tour. En la ruta dev la Fijos vieja sigue montada (`freezeOnBlur:false` → sus
// efectos siguen vivos) y dos registros del mismo tour se pisan. Realtime y
// telemetría no existen en el cluster de Fijos — verificado, ningún `channel()`
// en sus hooks. La ruta viva NO pasa el prop (default `false`) y el tour corre.
export function NeoFijosScreen({ userId, familyId, preview = false }: NeoFijosScreenProps) {
  const { t } = useTranslation()
  const mode = useThemeMode().resolvedMode as FijosMode
  const s = FIJOS_SPEC[mode]
  const isFocused = useIsFocused()

  /** Fijo cuyo sheet de confirmación de precio está abierto (2do+ pago). */
  const [confirmFor, setConfirmFor] = useState<FijoItem | null>(null)

  // ── Auto-scroll al cambiar de tab ───────────────────────────────────────
  // Cambiar de Vencidos a Pendientes puede cambiar la altura de la sección
  // entera (8 fijos vs 1), así que el usuario se queda mirando el hero o
  // vacío. Al cambiar de tab llevamos "TODOS TUS FIJOS" al tope: el ancla es
  // el TÍTULO, no la primera fila, para que la sección se lea completa desde
  // su encabezado.
  const scrollRef = useRef<ScrollView>(null)
  // El tour de Fijos, portado de la pantalla viva: 4 pasos (hero, avisos,
  // lista y el botón de agregar). `preview` lo apaga porque en la ruta dev la
  // Fijos vieja sigue montada y los dos registros del mismo tour colisionan.
  useScreenTour(FIJOS_TOUR, { enabled: !preview })
  const { onScroll: onTourScroll, onContentSizeChange: onTourContentSizeChange } =
    useRegisterTourScrollView(FIJOS_TOUR, scrollRef)
  // El botón de agregar vive adentro del header del kit; se apunta por ref
  // para no tener que meterle el tour al componente.
  const addButtonTourRef = useTourTargetRef(FIJOS_TOUR, FIJOS_TOUR_STEPS.addButton.order, {
    highlight: { borderRadius: 28, padding: 6, pulse: true },
    text: FIJOS_TOUR_STEPS.addButton.text,
  })
  const sectionRef = useRef<View>(null)
  /**
   * Offset Y de la sección, cacheado por `onLayout`. Es solo el FALLBACK: el
   * scroll real vuelve a medir contra el ScrollView en el momento.
   *
   * Por qué no alcanza el cacheado: `onLayout` corre cuando la sección se
   * monta, con el hero y los Avisos todavía en su altura de carga. Después
   * llegan los datos, el contenido de arriba crece ~600px y la sección baja —
   * pero `onLayout` no siempre vuelve a disparar cuando lo único que cambia es
   * la POSICIÓN del view. Verificado: el valor cacheado quedaba en ~260
   * cuando la sección estaba en ~856, y el scroll aterrizaba a media página.
   */
  const sectionYRef = useRef(0)
  const handleSectionLayout = useCallback((e: LayoutChangeEvent) => {
    sectionYRef.current = e.nativeEvent.layout.y
  }, [])

  /** Offset de scroll vivo — lo necesita el cálculo del delta de abajo. */
  const scrollYRef = useRef(0)
  /**
   * Un solo `onScroll` para dos consumidores: la Y que usa el auto-scroll de
   * "TODOS TUS FIJOS" y la que el tour necesita para ubicar sus highlights.
   * `Screen` expone un solo handler, así que se encadenan acá.
   */
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollYRef.current = e.nativeEvent.contentOffset.y
      onTourScroll(e)
    },
    [onTourScroll],
  )

  /**
   * Lleva "TODOS TUS FIJOS" al tope del área visible.
   *
   * Mide en PANTALLA los dos nodos (la sección y el propio ScrollView) y
   * scrollea por la diferencia. Se descartaron dos caminos más simples:
   *   · el `y` de `onLayout` — queda viejo (ver `sectionYRef`);
   *   · `measureLayout` contra el ScrollView — devuelve coordenadas relativas
   *     a su caja VISIBLE, no al contenido, así que con la lista scrolleada da
   *     un número que no sirve para `scrollTo`.
   * Restar el `pageY` del ScrollView en vez de usar 0 hace que el cálculo sea
   * correcto aunque arriba haya safe-area o cualquier chrome.
   */
  const scrollToSection = useCallback(() => {
    const scroll = scrollRef.current
    const section = sectionRef.current as View & Measurable | null
    if (!scroll) return
    const go = (y: number) => scroll.scrollTo({ y: Math.max(0, y), animated: true })
    const scrollMeasurable = scroll as unknown as Measurable
    if (!section?.measure || !scrollMeasurable.measure) {
      go(sectionYRef.current - SECTION_SCROLL_PADDING)
      return
    }
    scrollMeasurable.measure((_sx, _sy, _sw, _sh, _spx, scrollPageY) => {
      section.measure?.((_x, _y, _w, _h, _px, sectionPageY) => {
        const delta = sectionPageY - scrollPageY
        go(scrollYRef.current + delta - SECTION_SCROLL_PADDING)
      })
    })
  }, [])

  // ── Datos ───────────────────────────────────────────────────────────────
  // Casi todo es CACHE-HIT del cluster que ya arma el controller (mismos
  // queryKeys, mismos deps) → cero round-trips extra.
  const controller = useFijosController(familyId)
  /** Espejo en ref: `handleSelectTab` tiene que ser estable (es prop de un
   *  componente memoizado del kit) y el controller es objeto nuevo por render. */
  const controllerRef = useRef(controller)
  controllerRef.current = controller
  /**
   * Transición de altura de la sección. Cambiar de tab puede pasar de 8 fijos
   * a 1, y sin esto el bloque saltaba de golpe mientras Avisos —que sí anima—
   * se quedaba quieto: dos lenguajes de movimiento en la misma pantalla.
   * Gateada como el resto: el primer attach NO debe interpolar (warp).
   */
  const sectionLayout = useGatedLayout(
    LinearTransition.duration(motionDurations.standard).easing(motionEasings.standard),
  )
  const payCycle = usePayCycle(familyId, { freeze: false })
  const fixedExpensesQuery = useFixedExpenses(familyId)
  const dismissedHikes = useDismissedHikes()
  const queryClient = useQueryClient()
  const snapshot = useHomeSnapshot(userId)

  // Pull-to-refresh, portado de la pantalla viva: el snapshot trae en un solo
  // round-trip todo lo que esta pantalla lee (fijos, pagos, ciclo, ingreso).
  const [isRefreshing, setIsRefreshing] = useState(false)
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await snapshot.refetch()
    } finally {
      setIsRefreshing(false)
    }
  }, [snapshot])
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

  // ── Mutaciones de pago (ESCRITURAS REALES) ──────────────────────────────
  const recordPaymentMutation = useRecordFixedExpensePayment(familyId, userId)
  const revertPaymentMutation = useRevertFixedExpensePayment(familyId, userId)
  const deleteMutation = useDeleteFixedExpense(familyId, userId)

  /**
   * El scroll dispara SOLO cuando el usuario toca una tab.
   *
   * No alcanza con "ignorar el primer render": el controller re-elige el tab
   * activo por urgencia cuando llegan los datos y cuando una tab se queda sin
   * ítems, así que `controller.tab` cambia SOLO por eso al entrar a la
   * pantalla — y eso abría la vista ya scrolleada, escondiendo el hero y los
   * Avisos. Por eso la señal es la intención del usuario (el tap), no el
   * cambio de valor.
   */
  const tabPressedRef = useRef(false)
  const handleSelectTab = useCallback(
    (next: FijosTab) => {
      tabPressedRef.current = true
      controllerRef.current.setTab(next)
    },
    [],
  )
  useEffect(() => {
    if (!tabPressedRef.current) return
    tabPressedRef.current = false
    scrollToSection()
  }, [controller.tab, scrollToSection])

  // `useMutation` de RQ v5 devuelve un objeto NUEVO en cada render. Guardarlo en
  // ref evita que los `useCallback` de abajo lo lleven en deps y se reconstruyan
  // por render — que es lo que anula las memos de las filas de la lista.
  const recordRef = useRef(recordPaymentMutation)
  recordRef.current = recordPaymentMutation
  const revertRef = useRef(revertPaymentMutation)
  revertRef.current = revertPaymentMutation

  /**
   * Payment id REAL más reciente de un fijo, leído del cache de RQ. Lo necesita
   * el "Deshacer" del toast: el `record` optimista todavía no tiene id de
   * servidor, y mandar un `optimistic-…` a la RPC devuelve 22P02.
   */
  const findLatestRealPaymentId = useCallback(
    (fixedExpenseId: string): string | null => {
      const caches = queryClient.getQueriesData<
        Array<{ id: string; fixedExpenseId: string; paidAt: string }>
      >({ queryKey: ['fixed-expense-payments'] })
      let latest: { id: string; paidAt: string } | null = null
      for (const [, list] of caches) {
        if (!Array.isArray(list)) continue
        for (const payment of list) {
          if (payment.fixedExpenseId !== fixedExpenseId) continue
          if (isOptimisticPaymentId(payment.id)) continue
          if (
            !latest ||
            new Date(payment.paidAt).getTime() > new Date(latest.paidAt).getTime()
          ) {
            latest = { id: payment.id, paidAt: payment.paidAt }
          }
        }
      }
      return latest?.id ?? null
    },
    [queryClient],
  )

  const handleRevertPaid = useCallback(
    (paymentId: string) => {
      // `paidPaymentId` ya viene null cuando el payment es `optimistic-…`; el
      // componente de la lista solo dispara con un id real, pero la guarda
      // queda porque mandar un optimista a la RPC da 22P02.
      if (!paymentId || paymentId.startsWith('optimistic-')) {
        toast.error(t('fijos:neo.toast.paymentSyncing'))
        return
      }
      void triggerHaptic('warning')
      revertRef.current.mutate(paymentId, {
        onError: (error: unknown) => {
          void triggerHaptic('error')
          toast.error(
            `${t('fijos:neo.alert.revertFailed')} · ${getErrorMessage(error, t('states:error.server'))}`,
          )
        },
        onSuccess: () => {
          void triggerHaptic('success')
          toast.info(t('fijos:neo.toast.reverted'))
        },
      })
    },
    [t],
  )

  /**
   * Snackbar "Pago registrado · Deshacer" (5s), portado de la pantalla viva.
   * Era la única acción de la viva que la neo no tenía: un pago mal marcado
   * obligaba a expandir la fila y buscar "Revertir pago". Si el refetch todavía
   * no trajo el id real, se avisa en vez de mandar un optimista a la RPC.
   */
  const showPaySuccessToast = useCallback(
    (fixedExpenseId: string, fijoName: string) => {
      toast.success(t('fijos:toast.paymentRecorded', { name: fijoName }), {
        actionLabel: t('fijos:toast.undo'),
        durationMs: 5000,
        onAction: () => {
          const paymentId = findLatestRealPaymentId(fixedExpenseId)
          if (!paymentId) {
            toast.error(t('fijos:toast.undoNotReadyYet'))
            return
          }
          handleRevertPaid(paymentId)
        },
      })
    },
    [findLatestRealPaymentId, handleRevertPaid, t],
  )

  const runRecord = useCallback(
    (item: FijoItem, amountOverride?: number) => {
      recordRef.current.mutate(
        { amountOverride, fixedExpenseId: item.id },
        {
          onError: (error: unknown) => {
            void triggerHaptic('error')
            toast.error(
              `${t('fijos:neo.alert.payFailed')} · ${getErrorMessage(error, t('states:error.server'))}`,
            )
          },
          onSuccess: () => {
            void triggerHaptic('success')
            showPaySuccessToast(item.id, item.name)
          },
        },
      )
    },
    [showPaySuccessToast, t],
  )

  /**
   * COPIADO LITERAL de la pantalla viva — es un bugfix documentado del
   * 2026-05-30, no una heurística a re-derivar. `last_paid_at` del fijo es el
   * source of truth: si nunca se pagó es null → 1er pago → se omite el sheet de
   * precio. La versión anterior miraba el cache de expenses buscando
   * `commitment_id`, y como los expenses se archivan al cerrar ciclo los fijos
   * MENSUALES quedaban marcados como "1er pago" todos los meses.
   * Si no se encuentra el fijo (race) devuelve `false` → abre el sheet
   * conservadoramente: un sheet innecesario es 1 tap, saltearlo pierde data.
   */
  const handleMarkPaid = useCallback(
    (fixedExpenseId: string) => {
      const item = controller.allItems.find((i) => i.id === fixedExpenseId)
      if (!item) return
      // Guarda de id: un `temp-…` (fijo recién creado, todavía optimista) no
      // existe server-side y tira `FixedExpenseNotPersistedError` sincrónico.
      if (!isPersistedFixedExpenseId(item.id)) {
        toast.error(t('fijos:neo.toast.stillSaving'))
        return
      }
      void triggerHaptic('light')
      if (item.last_paid_at == null) {
        runRecord(item)
        return
      }
      setConfirmFor(item)
    },
    [controller.allItems, runRecord, t],
  )

  const handleConfirmSame = useCallback(() => {
    if (!confirmFor) return
    const item = confirmFor
    setConfirmFor(null)
    runRecord(item)
  }, [confirmFor, runRecord])

  const handleConfirmChanged = useCallback(
    (newAmount: number) => {
      if (!confirmFor) return
      const item = confirmFor
      setConfirmFor(null)
      runRecord(item, newAmount)
    },
    [confirmFor, runRecord],
  )

  const cycleHeaderLabel = buildCycleHeaderLabel(controller.cycleLabel, daysIntoCycle)

  // ── Handlers ────────────────────────────────────────────────────────────

  /** El alta VIEJA existe y funciona. Es también la acción del botón de
   *  calendario del header (fallo del owner 2026-07-30: el calendario con el
   *  `+` hace lo mismo que "+ Agregar fijo"). Transitorio: la Fase 3 lo
   *  reemplaza por el flujo de 2 pasos. */
  const handleAddFijo = useCallback(() => {
    void triggerHaptic('light')
    router.push('/(app)/add-fixed-expense')
  }, [])

  /** Editar — misma ruta y mismos params que la pantalla viva. */
  const handleEdit = useCallback((fixedExpenseId: string) => {
    void triggerHaptic('light')
    router.push({
      pathname: '/(app)/add-fixed-expense',
      params: { id: fixedExpenseId },
    })
  }, [])

  /**
   * Eliminar — ESCRITURA REAL contra producción y NO reversible (se lleva el
   * historial de pagos del fijo). Confirmación explícita antes de mutar, con
   * el mismo copy y el mismo flujo de errores que la pantalla viva.
   */
  const handleDelete = useCallback(
    (fixedExpenseId: string) => {
      void triggerHaptic('warning')
      void (async () => {
        const confirmed = await neoConfirm(t('fijos:alerts.deleteTitle'), {
          message: t('fijos:alerts.deleteMessage'),
          confirmLabel: t('common:actions.delete'),
          tone: 'destructive',
        })
        if (!confirmed) return
        deleteMutation.mutate(fixedExpenseId, {
          onError: (error: unknown) => {
            void triggerHaptic('error')
            toast.error(
              `${t('fijos:alerts.deleteFailedTitle')} · ${getErrorMessage(error, t('states:error.server'))}`,
            )
          },
          onSuccess: () => void triggerHaptic('success'),
        })
      })()
    },
    [deleteMutation, t],
  )

  /**
   * ESCRITURA REAL y NO reversible desde acá: ancla el ciclo y descongela el
   * saldo de Home. Por eso la confirmación explícita antes de mutar.
   *
   * `tone: 'irreversible'` y no `'destructive'`: no borra nada, pero tampoco
   * se puede deshacer. El naranja de alerta lo separa del rojo de "eliminar",
   * que en esta misma pantalla significa perder el historial de un fijo.
   */
  const handleConfirmCobro = useCallback(() => {
    void (async () => {
      const confirmed = await neoConfirm(t('fijos:neo.confirmCobro.title'), {
        message: t('fijos:neo.confirmCobro.message'),
        tone: 'irreversible',
      })
      if (confirmed) confirmCycleStartingBalance(null)
    })()
  }, [confirmCycleStartingBalance, t])

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
    <Screen
      backgroundColor={s.bg}
      contentContainerStyle={styles.body}
      onContentSizeChange={onTourContentSizeChange}
      onScroll={handleScroll}
      // 16ms = un evento por frame a 60fps. La matemática de auto-scroll del
      // tour lee la Y trackeada para ubicar cada paso; con un throttle más
      // grueso la Y se atrasa y el highlight cae fuera del target.
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl
          colors={[brand.deep]}
          onRefresh={handleRefresh}
          refreshing={isRefreshing}
          tintColor={brand.bright}
        />
      }
      scrollRef={scrollRef}
      scrollable
    >
      <FijosHeader
        // El tour apunta al botón por ref: el header del kit no sabe del tour.
        calendarButtonRef={addButtonTourRef}
        cycleLabel={cycleHeaderLabel}
        mode={mode}
        // El botón de calendario con el `+` es la acción de "+ Agregar fijo"
        // (fallo del owner 2026-07-30).
        onPressCalendar={handleAddFijo}
      />
      <TourTarget
        // El hero del kit tiene radio 28; el highlight lo cubre con aire para
        // hilar el borde, igual que hace la viva con su `FijosHeroCard`.
        highlight={{ borderRadius: 32, padding: 6 }}
        order={FIJOS_TOUR_STEPS.hero.order}
        text={FIJOS_TOUR_STEPS.hero.text}
        tour={FIJOS_TOUR}
      >
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
      </TourTarget>
      <TourTarget
        // El paso `calendar` del tour habla de "lo que se viene": en la viva lo
        // anclaba `FijosProximosCard`, que acá es el bloque de Avisos.
        highlight={{ borderRadius: 26, padding: 6 }}
        order={FIJOS_TOUR_STEPS.calendar.order}
        text={FIJOS_TOUR_STEPS.calendar.text}
        tour={FIJOS_TOUR}
      >
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
      </TourTarget>
      {/* "Todos tus fijos": el header y las tabs son del kit; la LISTA es el
          componente colapsable de la pantalla viva. El kit dibuja una fila por
          categoría, sin expansión y sin acción por-fijo, así que no puede
          mostrar los fijos adentro de su categoría con su botón "Pagar". */}
      <TourTarget
        highlight={{ borderRadius: 26, padding: 6 }}
        order={FIJOS_TOUR_STEPS.list.order}
        text={FIJOS_TOUR_STEPS.list.text}
        tour={FIJOS_TOUR}
      >
      <View
        onLayout={handleSectionLayout}
        ref={sectionRef}
        style={fijosAvisosCategoriesSpacing}
      >
        {/* El link "+ Agregar fijo" se sacó a pedido del owner (2026-07-30):
            el alta ya está a un tap desde el botón de calendario del header y
            desde el FAB, así que acá era una tercera puerta a lo mismo
            compitiendo con el título de la sección. */}
        <View style={styles.categoriesHeaderRow}>
          <Text style={[styles.categoriesLabel, { color: s.sectionLabelInk }]}>
            {t('fijos:neo.allFijos')}
          </Text>
        </View>
        <FijosTabs
          activeTab={controller.tab}
          mode={mode}
          onSelectTab={handleSelectTab}
          pagadosCount={String(paidCount)}
          pendientesCount={String(pendingCount)}
          vencidosCount={String(overdueCount)}
        />
        <Animated.View layout={sectionLayout} style={styles.categoryList}>
          {/* `controller.groups` SÍ está filtrado por el tab activo — igual que
              en la pantalla viva, así que las tabs filtran de verdad. */}
          <FijosSkinProvider mode={mode}>
            <FijoCategoryGroups
              groups={controller.groups}
              onDelete={handleDelete}
              onEdit={handleEdit}
              onMarkPaid={handleMarkPaid}
              onRevertPaid={handleRevertPaid}
              pendingFixedExpenseId={
                deleteMutation.isPending ? (deleteMutation.variables ?? null) : null
              }
              // Gobierna el colapso inicial por tab (vencidos abre, el resto
              // cierra) y separa la memoria de colapso entre tabs.
              tab={controller.tab}
              todayDay={summary.todayDay}
            />
          </FijosSkinProvider>
        </Animated.View>
      </View>
      </TourTarget>
      {/* Confirmación de precio para el 2do+ pago — mismo sheet que la viva. */}
      <ConfirmFixedPaymentSheet
        fixedExpenseName={confirmFor?.name ?? ''}
        isProcessing={recordPaymentMutation.isPending}
        onClose={() => setConfirmFor(null)}
        onConfirmChanged={handleConfirmChanged}
        onConfirmSame={handleConfirmSame}
        previousAmount={confirmFor?.amount ?? 0}
        visible={confirmFor != null}
        wasOverdue={confirmFor?.computedStatus === 'overdue'}
      />
    </Screen>
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
  // Transcrito del markup, igual que el preview aprobado.
  body: { paddingHorizontal: 20, paddingTop: 10 },
  // Métricas copiadas del kit (`categoriesHeaderRow`/`categoriesLabel`/
  // `addFijoText`) para que el header de sección se vea idéntico aunque la
  // lista de abajo sea el componente colapsable de la pantalla viva.
  addFijoText: { fontFamily: nunitoFamily('900'), fontSize: 12, fontWeight: '900' },
  categoriesHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  categoriesLabel: {
    fontFamily: nunitoFamily('800'),
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 1.84,
  },
  categoryList: { marginTop: 12 },
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
