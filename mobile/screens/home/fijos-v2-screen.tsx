import { Alert, RefreshControl, StyleSheet, View, type ScrollView } from 'react-native'
import { useScreenLifecycleLog } from '@/lib/dev/anim-log'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { ConfirmFixedPaymentSheet } from '@/components/fijos/confirm-fixed-payment-sheet'
import { FijosHeader } from '@/components/fijos/fijos-header'
import { FijosScheduledBanner } from '@/components/fijos/fijos-scheduled-banner'
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
import { useFijosController } from '@/features/fijos/use-fijos-controller'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
import { useFixedExpenseCategories } from '@/features/categories/use-categories'
import { useLayoutTransitionGate } from '@/hooks/use-layout-transition-gate'
import { useControlV2Data } from '@/features/insights/use-control-v2-data'
import {
  useDeleteFixedExpense,
  useRecordFixedExpensePayment,
  useRevertFixedExpensePayment,
} from '@/features/fixed-expenses/use-fixed-expenses'
import { triggerHaptic } from '@/lib/haptics'
import { errorMessages } from '@/lib/copy/states'
import { toast } from '@/lib/toast-bus'
import { getErrorMessage } from '@/utils/error-message'
import { useAppTheme } from '@/theme/theme-provider'
import { brand, DARK_TAB_CANVAS } from '@/theme/palette'

interface FijosV2ScreenProps {
  familyId: string
  /** Required for pull-to-refresh — `useHomeSnapshot` keys by userId. */
  userId: string
}

/**
 * New Fijos screen — V1 Cuaderno port. Work in progress: ships the
 * cycle ring hero first and will grow to include smart alerts, the
 * upcoming strip, status tabs and the per-category list.
 */
export function FijosV2Screen({ familyId, userId }: FijosV2ScreenProps) {
  useScreenLifecycleLog('Fijos')
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
  const revertPaymentMutation = useRevertFixedExpensePayment(familyId)
  const deleteMutation = useDeleteFixedExpense(familyId)
  const queryClient = useQueryClient()
  // React Query cached — same source feeding the Control screen.
  const { signals: advisorSignals } = useControlV2Data(familyId)
  // Snapshot del home — su refetch re-seedea todos los caches del
  // cluster fijos (fixed_expenses, fixed_expense_payments, expenses,
  // categories, etc.) en un solo round-trip. Lo usa el pull-to-refresh.
  const snapshot = useHomeSnapshot(userId)

  // Pull-to-refresh: setea refreshing local + dispara el refetch del
  // snapshot. El RefreshControl muestra el spinner mientras la promise
  // resuelve.
  const [isRefreshing, setIsRefreshing] = useState(false)
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await snapshot.refetch()
    } finally {
      setIsRefreshing(false)
    }
  }, [snapshot])

  /**
   * Revierte un pago confirmado. Llamado desde el botón "Revertir pago"
   * del expand panel (cuando status='paid') Y desde el snackbar de
   * "Deshacer" que aparece tras un pago exitoso. La RPC borra el
   * expense generado, borra el payment row, retrocede next_due_on y
   * restaura last_paid_at — todo en una sola transacción server-side.
   */
  const handleRevertPaid = useCallback(
    (paymentId: string) => {
      void triggerHaptic('warning')
      revertPaymentMutation.mutate(paymentId, {
        onError: (error: unknown) => {
          void triggerHaptic('error')
          Alert.alert(
            'No pudimos revertir el pago',
            getErrorMessage(error, errorMessages.server),
          )
        },
        onSuccess: () => {
          void triggerHaptic('success')
          toast.info('Pago revertido.')
        },
      })
    },
    [revertPaymentMutation],
  )

  /**
   * Helper: encuentra el payment record más reciente NO-optimista para
   * un fixedExpenseId en cualquier cache `['fixed-expense-payments', …]`.
   * Lo usa el snackbar de "Deshacer" para resolver el id real (el
   * optimistic-... id no funciona con la RPC server-side).
   *
   * Si solo hay optimistic rows (el refetch no terminó), retorna null.
   * El caller debería mostrar un error o ignorar.
   */
  const findLatestRealPaymentId = useCallback(
    (fixedExpenseId: string): string | null => {
      const caches = queryClient.getQueriesData<Array<{
        id: string
        fixedExpenseId: string
        paidAt: string
      }>>({ queryKey: ['fixed-expense-payments'] })
      let latest: { id: string; paidAt: string } | null = null
      for (const [, list] of caches) {
        if (!Array.isArray(list)) continue
        for (const p of list) {
          if (p.fixedExpenseId !== fixedExpenseId) continue
          // Skip optimistic rows — solo ids reales sirven para la RPC.
          if (p.id.startsWith('optimistic-')) continue
          if (!latest || new Date(p.paidAt).getTime() > new Date(latest.paidAt).getTime()) {
            latest = { id: p.id, paidAt: p.paidAt }
          }
        }
      }
      return latest?.id ?? null
    },
    [queryClient],
  )

  /**
   * Wrapper post-success: muestra el snackbar "Pago registrado · Deshacer"
   * con duración 5s. Si el user toca Deshacer, resuelve el payment id
   * real desde el cache (saltando el optimistic) y dispara revert. Si
   * el refetch aún no completó cuando tocan, mostramos un mini error
   * sugiriendo reintentar.
   */
  const showPaySuccessToast = useCallback(
    (fixedExpenseId: string, fijoName: string) => {
      toast.success(`Pago de ${fijoName} registrado`, {
        actionLabel: 'Deshacer',
        durationMs: 5000,
        onAction: () => {
          const paymentId = findLatestRealPaymentId(fixedExpenseId)
          if (!paymentId) {
            toast.error('No pudimos deshacer todavía — prueba de nuevo en 1s.')
            return
          }
          handleRevertPaid(paymentId)
        },
      })
    },
    [findLatestRealPaymentId, handleRevertPaid],
  )

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
   * `isFirstPayment`: usa `last_paid_at` del fijo como source of truth.
   * Si nunca se pagó, last_paid_at es null → 1er pago → omite sheet.
   *
   * Antes (bug 2026-05-30): la heurística miraba `useExpenses` cache
   * buscando un expense con `commitment_id === fixedExpenseId`. Era
   * estructuralmente frágil — los expenses se archivan al cerrar ciclo
   * (archived_at) y el snapshot filtra esos. Resultado: fijos
   * MENSUALES pagados en ciclos previos quedaban marcados como "1er
   * pago" todos los meses, y el sheet de confirmación nunca aparecía.
   *
   * `last_paid_at` viene del fijo mismo, no de expenses ni payments —
   * el RPC siempre lo actualiza y nunca se borra por cierre de ciclo.
   * Es la señal correcta de "ya hubo al menos un pago".
   */
  const isFirstPayment = useCallback(
    (fixedExpenseId: string) => {
      const fixed = controller.allItems.find((i) => i.id === fixedExpenseId)
      // Si por alguna razón no encontramos el fijo (race), abrimos el
      // sheet conservadoramente — false positive (sheet innecesario)
      // es 1 tap; false negative (saltarse el sheet) pierde data.
      if (!fixed) return false
      return fixed.last_paid_at == null
    },
    [controller.allItems],
  )

  const handleMarkPaid = useCallback(
    (fixedExpenseId: string) => {
      void triggerHaptic('light')
      if (isFirstPayment(fixedExpenseId)) {
        // 1er pago: registro directo. El amount del commitment fue
        // capturado al crear el fijo, asumimos que es correcto.
        const fijoName =
          controller.allItems.find((i) => i.id === fixedExpenseId)?.name ?? 'fijo'
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
            onSuccess: () => {
              void triggerHaptic('success')
              showPaySuccessToast(fixedExpenseId, fijoName)
            },
          },
        )
        return
      }
      // 2do+ pago: abrir sheet de confirmación de precio.
      setPaymentSheet({ visible: true, fixedExpenseId })
    },
    [isFirstPayment, recordPaymentMutation, controller.allItems, showPaySuccessToast],
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
      const fijoName =
        controller.allItems.find((i) => i.id === id)?.name ?? 'fijo'
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
          onSuccess: () => {
            showPaySuccessToast(id, fijoName)
          },
          onSettled: () => {
            setPaymentSheet({ visible: false, fixedExpenseId: null })
          },
        },
      )
    },
    [
      paymentSheet.fixedExpenseId,
      recordPaymentMutation,
      controller.allItems,
      showPaySuccessToast,
    ],
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

  // Gate del LinearTransition para evitar el "warp" en cold-start del tab.
  // Pre-mounted tabs renderean su loading state al boot del app; cuando
  // el user toca el tab por primera vez, el data resuelve → layout cambia
  // → LinearTransition interpola → vista hace warp. El gate mantiene
  // `sectionLayout = undefined` durante el primer paint (sin layout
  // animation) y se activa después de que las interacciones del JS thread
  // settlen — para los cambios subsiguientes (add/delete fijo) sí hay
  // smoothing. Ver `use-layout-transition-gate.ts` para detalles.
  //
  // Declarado ARRIBA del early-return del error state porque las Rules
  // of Hooks exigen call counts estables across renders.
  const layoutGateOpen = useLayoutTransitionGate()
  const sectionLayout = layoutGateOpen ? LinearTransition.duration(260) : undefined

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
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor={brand.bright}
          colors={[brand.deep]}
        />
      }
    >
      <View style={styles.stack}>
        <Animated.View layout={sectionLayout}>
          <FijosHeader
            familyId={familyId}
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
            visibleTabs={controller.visibleTabs}
            counts={{
              // 3 tabs (v4 2026-05-31): vencidos / pendientes / pagados.
              // Future items (fijos programados sin pagar) viven en
              // FijosScheduledBanner sobre el listado, no en tab.
              vencidos: controller.summary.overdueItems.length,
              pendientes: controller.summary.pendingItems.length,
              pagados: controller.summary.paidItems.length,
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
            {/*
              Banner contextual de fijos programados sin pagar — vive
              encima del listado, visible en todas las tabs. Renderea
              null cuando no hay future items (99% del tiempo). Cuando
              aparece, comunica "tienes N fijos cargados sin pagar
              todavía" con un layout collapsible. Reemplazó la tab
              "Próximos" que casi siempre quedaba vacía.
            */}
            <FijosScheduledBanner items={controller.summary.futureItems} />
            <FijoCategoryGroups
              groups={controller.groups}
              todayDay={controller.summary.todayDay}
              onMarkPaid={handleMarkPaid}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onRevertPaid={handleRevertPaid}
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
