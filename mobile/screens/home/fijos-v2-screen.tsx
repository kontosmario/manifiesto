import { Alert, StyleSheet, View, type ScrollView } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { ConfirmFixedPaymentSheet } from '@/components/fijos/confirm-fixed-payment-sheet'
import { FijosHeader } from '@/components/fijos/fijos-header'
import { FijosEmptyState } from '@/components/fijos/fijos-empty-state'
import { FijosHeroCard } from '@/components/fijos/fijos-hero-card'
import { FijosProximosCard } from '@/components/fijos/fijos-proximos-card'
import { FijosTabs } from '@/components/fijos/fijos-tabs'
import { FijoCategoryGroups } from '@/components/fijos/fijo-category-groups'
import {
  FIJOS_TOUR,
  FIJOS_TOUR_STEPS,
  TourTarget,
  useRegisterTourScrollView,
  useScreenTour,
  useTourTargetRef,
} from '@/features/tours'
import { useExpenses } from '@/features/expenses/use-expenses'
import { useFijosController } from '@/features/fijos/use-fijos-controller'
import { useFixedExpenseCategories } from '@/features/categories/use-categories'
import { useControlV2Data } from '@/features/insights/use-control-v2-data'
import {
  useDeleteFixedExpense,
  useRecordFixedExpensePayment,
} from '@/features/fixed-expenses/use-fixed-expenses'
import { triggerHaptic } from '@/lib/haptics'
import { errorMessages } from '@/lib/copy/states'
import { getErrorMessage } from '@/utils/error-message'
import { useAppTheme } from '@/theme/theme-provider'
import { DARK_TAB_CANVAS } from '@/theme/palette'

interface FijosV2ScreenProps {
  familyId: string
}

/**
 * New Fijos screen — V1 Cuaderno port. Work in progress: ships the
 * cycle ring hero first and will grow to include smart alerts, the
 * upcoming strip, status tabs and the per-category list.
 */
export function FijosV2Screen({ familyId }: FijosV2ScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  // Auto-start the Fijos guided tour on first visit. No-op once seen.
  useScreenTour(FIJOS_TOUR)
  // ScrollView ref so the tour can auto-scroll to each step's target.
  const tourScrollRef = useRef<ScrollView | null>(null)
  const {
    onScroll: onTourScroll,
    onContentSizeChange: onTourContentSizeChange,
  } = useRegisterTourScrollView(FIJOS_TOUR, tourScrollRef)
  // The add-fijo button lives inside FijosHeader's right cluster.
  // Ref-based registration so we don't have to refactor the header.
  const addButtonTourRef = useTourTargetRef(
    FIJOS_TOUR,
    FIJOS_TOUR_STEPS.addButton.order,
    {
      text: FIJOS_TOUR_STEPS.addButton.text,
      // The button is circular (38pt) — match its shape with a high
      // radius and a soft pulse so it reads as "tappable here".
      highlight: { borderRadius: 28, padding: 6, pulse: true },
    },
  )
  const controller = useFijosController(familyId)
  const categoriesQuery = useFixedExpenseCategories(familyId)
  const categoriesById = useMemo(() => {
    const m = new Map<string, { id: string; name: string; color: string }>()
    for (const c of categoriesQuery.data ?? []) {
      m.set(c.id, { id: c.id, name: c.name, color: c.color })
    }
    return m
  }, [categoriesQuery.data])

  const recordPaymentMutation = useRecordFixedExpensePayment(familyId)
  const deleteMutation = useDeleteFixedExpense(familyId)
  // Expenses ya están en cache (mismo source que el aggregator de
  // FijoRow trend). Usamos esto para detectar si el commitment ya
  // tiene historial → decide si el sheet de confirmación de precio
  // se muestra o se hace pago directo (1er pago).
  const expensesQuery = useExpenses(familyId)
  // React Query cached — same source feeding the Control screen.
  const { signals: advisorSignals } = useControlV2Data(familyId)

  // Sheet de confirmación de precio (2do+ pago). Vivo en estado local
  // del screen — solo conoce qué fijo está abriendo + close. La
  // mutation se dispara desde sus callbacks `onConfirm*`.
  const [paymentSheet, setPaymentSheet] = useState<{
    visible: boolean
    fixedExpenseId: string | null
  }>({ visible: false, fixedExpenseId: null })

  const handlePressAdd = useCallback(() => {
    void triggerHaptic('light')
    router.push('/(app)/add-fixed-expense')
  }, [router])

  /**
   * `isFirstPayment`: el fijo no tiene NI UN expense en la cache con
   * `commitment_id` apuntando a él. Conservador — si hay un expense
   * (incluso optimistic), tratamos como 2do pago. Una falsa negativa
   * (i.e., fue 1er pago pero ya había un mock expense) solo significa
   * "abrir sheet innecesariamente" — el user puede confirmar "Mismo
   * monto" en 1 tap. Una falsa positiva (no abrir cuando debía) sería
   * peor.
   */
  const isFirstPayment = useCallback(
    (fixedExpenseId: string) => {
      const expenses = expensesQuery.data ?? []
      return !expenses.some((e) => e.commitment_id === fixedExpenseId)
    },
    [expensesQuery.data],
  )

  const handleMarkPaid = useCallback(
    (fixedExpenseId: string) => {
      void triggerHaptic('light')
      if (isFirstPayment(fixedExpenseId)) {
        // 1er pago: registro directo. El amount del commitment fue
        // capturado al crear el fijo, asumimos que es correcto.
        recordPaymentMutation.mutate(
          { fixedExpenseId },
          {
            onError: (error: unknown) => {
              void triggerHaptic('error')
              Alert.alert(
                'No pudimos registrar el pago',
                getErrorMessage(error, errorMessages.server),
              )
            },
            onSuccess: () => void triggerHaptic('success'),
          },
        )
        return
      }
      // 2do+ pago: abrir sheet de confirmación de precio.
      setPaymentSheet({ visible: true, fixedExpenseId })
    },
    [isFirstPayment, recordPaymentMutation],
  )

  // Cerrar el sheet sin disparar mutation.
  const closePaymentSheet = useCallback(() => {
    setPaymentSheet({ visible: false, fixedExpenseId: null })
  }, [])

  // Disparar la mutation desde el sheet. `same` no manda override (RPC
  // usa amount actual); `changed` manda override + persiste como nuevo
  // amount base. Cierra el sheet on-success o on-error (con toast).
  const handleSheetConfirm = useCallback(
    (newAmount: number | undefined) => {
      const id = paymentSheet.fixedExpenseId
      if (!id) return
      void triggerHaptic('success')
      recordPaymentMutation.mutate(
        { fixedExpenseId: id, amountOverride: newAmount },
        {
          onError: (error: unknown) => {
            void triggerHaptic('error')
            Alert.alert(
              'No pudimos registrar el pago',
              getErrorMessage(error, errorMessages.server),
            )
          },
          onSettled: () => {
            setPaymentSheet({ visible: false, fixedExpenseId: null })
          },
        },
      )
    },
    [paymentSheet.fixedExpenseId, recordPaymentMutation],
  )

  // Snapshot del fijo que está abriendo el sheet — pasamos su amount y
  // su status overdue al componente. Si por alguna razón el id no se
  // encuentra (race con delete, etc.), el sheet se queda inerte hasta
  // que cierre.
  const activeFixed = useMemo(() => {
    if (!paymentSheet.fixedExpenseId) return null
    return (
      controller.allItems.find((i) => i.id === paymentSheet.fixedExpenseId) ??
      null
    )
  }, [paymentSheet.fixedExpenseId, controller.allItems])

  const handleEdit = useCallback(
    (fixedExpenseId: string) => {
      void triggerHaptic('light')
      router.push({
        pathname: '/(app)/add-fixed-expense',
        params: { id: fixedExpenseId },
      })
    },
    [router],
  )

  const handleDelete = useCallback(
    (fixedExpenseId: string) => {
      void triggerHaptic('warning')
      Alert.alert('Eliminar fijo', '¿Seguro que quieres eliminar este fijo?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            deleteMutation.mutate(fixedExpenseId, {
              onError: (error: unknown) => {
                void triggerHaptic('error')
                Alert.alert('No pudimos eliminar', getErrorMessage(error, errorMessages.server))
              },
              onSuccess: () => void triggerHaptic('success'),
            })
          },
        },
      ])
    },
    [deleteMutation],
  )

  if (controller.error && controller.allItems.length === 0 && !controller.isLoading) {
    return (
      <Screen
        backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
        contentContainerStyle={styles.screenContent}
        scrollable={false}
      >
        <ErrorState
          description={getErrorMessage(controller.error, errorMessages.server)}
          title="No pudimos cargar tus fijos"
        />
      </Screen>
    )
  }

  const sectionLayout = LinearTransition.duration(260)

  // Brand-new account: data loaded fine but there are zero fijos.
  // Render the onboarding empty state instead of the data cards (which
  // would otherwise show zeros and read as broken).
  const isEmpty =
    !controller.isLoading && !controller.error && controller.allItems.length === 0

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      contentContainerStyle={styles.screenContent}
      // Rendered behind the ScrollView (not inside it) so the auroras
      // cover the full viewport and don't scroll with the content.
      // Dark mode uses the 'calm' tone (faint forest halos on the
      // near-black canvas); light keeps the bright aurora.
      backgroundSlot={<AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />}
      scrollRef={tourScrollRef}
      onScroll={onTourScroll}
      onContentSizeChange={onTourContentSizeChange}
      // 16ms = once per frame at 60fps. The tour's auto-scroll math
      // reads `scrollYRef.current` to compute each step's window
      // position; with a coarser throttle (e.g. 64ms) the tracked Y
      // drifts behind the actual scroll and the highlight lands
      // off-target.
      scrollEventThrottle={16}
    >
      <View style={styles.stack}>
        <Animated.View layout={sectionLayout}>
          <FijosHeader
            onPressAdd={handlePressAdd}
            addButtonRef={addButtonTourRef}
          />
        </Animated.View>
        {isEmpty ? (
          // Empty-state onboarding. We still wrap the three ghost
          // preview blocks in the SAME tour targets (hero/calendar/list)
          // so the auto-starting FIJOS tour highlights the ghost areas
          // and its copy still makes sense on a fresh account. The add
          // button keeps its own ref-based target inside FijosHeader.
          <FijosEmptyState
            onAddFirst={handlePressAdd}
            renderSection={(slot, children) => {
              const step =
                slot === 'hero'
                  ? FIJOS_TOUR_STEPS.hero
                  : slot === 'calendar'
                    ? FIJOS_TOUR_STEPS.calendar
                    : FIJOS_TOUR_STEPS.list
              return (
                <TourTarget
                  highlight={{ borderRadius: 22, padding: 6 }}
                  order={step.order}
                  text={step.text}
                  tour={FIJOS_TOUR}
                >
                  {children}
                </TourTarget>
              )
            }}
          />
        ) : (
          <>
        <TourTarget
          tour={FIJOS_TOUR}
          order={FIJOS_TOUR_STEPS.hero.order}
          text={FIJOS_TOUR_STEPS.hero.text}
          // Match FijosHeroCard's borderRadius (24) plus padding so
          // the cutout's curve sits a hair outside the card's edge.
          highlight={{ borderRadius: 28, padding: 6 }}
        >
          <Animated.View layout={sectionLayout}>
            <FijosHeroCard
              mes={controller.cycleLabel}
              diasRestantes={controller.summary.daysRemaining}
              totalFijos={controller.summary.total}
              montoPagado={controller.summary.paidAmount}
              cantidadPagados={controller.summary.paidItems.length}
              cantidadPendientes={
                controller.summary.pendingItems.length + controller.summary.overdueItems.length
              }
              cantidadVencidos={controller.summary.overdueItems.length}
              dineroLibre={controller.freeAfterFijos}
              porcentajeSueldo={controller.pctOfIncome}
              // Boarding-pass route line · drive del today marker en
              // el track ABR → MAY. Day index derivado del summary
              // (cycleDays total - daysRemaining = días recorridos).
              cycleDayIndex={Math.max(
                1,
                controller.cycleDays - controller.summary.daysRemaining,
              )}
              cycleDays={controller.cycleDays}
            />
          </Animated.View>
        </TourTarget>
        <TourTarget
          tour={FIJOS_TOUR}
          order={FIJOS_TOUR_STEPS.calendar.order}
          text={FIJOS_TOUR_STEPS.calendar.text}
          // FijosProximosCard tiene borderRadius 18 — el highlight cubre
          // la card completa con pad para hilar el border.
          highlight={{ borderRadius: 22, padding: 6 }}
        >
          <Animated.View layout={sectionLayout}>
            {/* Fusión SmartAlerts + UpcomingStrip en una sola card editorial:
                top section = próximos a pagar, sub-section AVISOS = hikes
                + advisor signals. Reemplaza las 2 cards que ocupaban demasiado
                footprint vertical conceptualmente similar. */}
            <FijosProximosCard
              upcoming={controller.summary.upcoming}
              hikes={controller.summary.hikes}
              advisorSignals={advisorSignals}
              todayDay={controller.summary.todayDay}
              categoriesById={categoriesById}
              onOpenHike={handleEdit}
            />
          </Animated.View>
        </TourTarget>
        <Animated.View layout={sectionLayout}>
          <FijosTabs
            tab={controller.tab}
            setTab={controller.setTab}
            counts={{
              pendientes:
                controller.summary.pendingItems.length + controller.summary.overdueItems.length,
              pagados: controller.summary.paidItems.length,
              // Próximos: fijos al día con próximo vencimiento en un
              // ciclo posterior — típicamente trimestrales / semestrales
              // / anuales recién pagados. Visibles aparte para no
              // mezclar el calendario lejano con lo cerrado este mes.
              proximos: controller.summary.futureItems.length,
            }}
          />
        </Animated.View>
        <TourTarget
          tour={FIJOS_TOUR}
          order={FIJOS_TOUR_STEPS.list.order}
          text={FIJOS_TOUR_STEPS.list.text}
          // Stretch the cutout from the top of the list category
          // groups down to the bottom of the visible scroll surface,
          // mirroring the gastos `list` step. This makes the
          // highlight feel like "everything from here onward" instead
          // of cutting off at whatever fraction of the list happens
          // to be in the natural rect.
          highlight={{
            borderRadius: 14,
            padding: 8,
            extendToScrollEnd: true,
          }}
        >
          <Animated.View layout={sectionLayout}>
            <FijoCategoryGroups
              groups={controller.groups}
              todayDay={controller.summary.todayDay}
              onMarkPaid={handleMarkPaid}
              onEdit={handleEdit}
              onDelete={handleDelete}
              pendingFixedExpenseId={
                deleteMutation.isPending ? (deleteMutation.variables ?? null) : null
              }
            />
          </Animated.View>
        </TourTarget>
          </>
        )}
        <View style={styles.bottomSpacer} />
      </View>
      {/* Sheet de confirmación de precio. Vive a nivel screen porque
          es 1 instancia para toda la pantalla — los rows solo
          disparan `handleMarkPaid` (que decide si abre el sheet o
          hace pago directo). Pasamos snapshot del fijo activo al
          momento de abrir; si el fijo se elimina mientras el sheet
          está abierto, `activeFixed === null` deja el sheet inerte
          hasta que el user lo cierre. */}
      <ConfirmFixedPaymentSheet
        visible={paymentSheet.visible && activeFixed != null}
        fixedExpenseName={activeFixed?.name ?? ''}
        previousAmount={activeFixed?.amount ?? 0}
        wasOverdue={activeFixed?.computedStatus === 'overdue'}
        isProcessing={recordPaymentMutation.isPending}
        onClose={closePaymentSheet}
        onConfirmSame={() => handleSheetConfirm(undefined)}
        onConfirmChanged={(amount) => handleSheetConfirm(amount)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: { paddingTop: 14 },
  stack: { gap: 10 },
  bottomSpacer: { height: 24 },
})
