import { Alert, StyleSheet, View, type ScrollView } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { useCallback, useMemo, useRef } from 'react'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { FijosHeader } from '@/components/fijos/fijos-header'
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
  // React Query cached — same source feeding the Control screen.
  const { signals: advisorSignals } = useControlV2Data(familyId)

  const handlePressAdd = useCallback(() => {
    void triggerHaptic('light')
    router.push('/(app)/add-fixed-expense')
  }, [router])

  const handleMarkPaid = useCallback(
    (fixedExpenseId: string) => {
      void triggerHaptic('success')
      recordPaymentMutation.mutate(fixedExpenseId, {
        // No onSuccess celebration here — each FijoRow watches its
        // own `computedStatus` and fires a local ConfettiBurst when
        // it flips to 'paid'. That way the burst is always anchored
        // to the row that just got marked, regardless of scroll
        // position or how many fijos are on screen.
        onError: (error: unknown) => {
          void triggerHaptic('error')
          Alert.alert('No pudimos registrar el pago', getErrorMessage(error, errorMessages.server))
        },
      })
    },
    [recordPaymentMutation],
  )

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
              todos: controller.allItems.length,
              pendientes:
                controller.summary.pendingItems.length + controller.summary.overdueItems.length,
              pagados: controller.summary.paidItems.length,
              zombis: controller.summary.zombies.length,
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
        <View style={styles.bottomSpacer} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: { paddingTop: 14 },
  stack: { gap: 10 },
  bottomSpacer: { height: 24 },
})
