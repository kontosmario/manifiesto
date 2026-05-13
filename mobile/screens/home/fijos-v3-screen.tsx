import { Alert, StyleSheet, View, type ScrollView } from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { useCallback, useMemo, useRef } from 'react'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { FullListLive } from '@/components/fijos-hero-preview/full-list-live'
import { HeaderHealthPulse } from '@/components/fijos-hero-preview/header-d-health-pulse'
import { ProximosFusedLive } from '@/components/fijos-hero-preview/proximos-fused-live'
import { TitularHeroLive } from '@/components/fijos-hero-preview/titular-hero-live'
import { adaptControllerToHeroState } from '@/features/fijos/adapt-controller-to-hero-state'
import {
  FIJOS_TOUR,
  TourTarget,
  FIJOS_TOUR_STEPS,
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

interface FijosV3ScreenProps {
  familyId: string
}

/**
 * Fijos V3 screen. Reemplazo de V2 con el refactor editorial completo:
 *
 *   1. HeaderHealthPulse        breathe dot color-coded de salud del ciclo
 *   2. TitularHeroLive          hero con cycle label + headline state-aware
 *                               + ShineOverlay + CardParticles
 *   3. ProximosFusedLive        próximos top 3 + AVISOS inline (hikes + signals)
 *   4. FullListLive             todos los fijos agrupados por categoría,
 *                               smart-sort dentro de cada grupo, cada row
 *                               con tap-expand de acciones (pagar/editar/
 *                               eliminar)
 *
 * Rollback inmediato: cambiar el route en `app/(app)/(tabs)/fixed-expenses.tsx`
 * de FijosV3Screen ↔ FijosV2Screen — ambas screens siguen vivas en
 * código.
 */
export function FijosV3Screen({ familyId }: FijosV3ScreenProps) {
  const router = useRouter()
  useScreenTour(FIJOS_TOUR)
  const tourScrollRef = useRef<ScrollView | null>(null)
  const { onScroll: onTourScroll, onContentSizeChange: onTourContentSizeChange } =
    useRegisterTourScrollView(FIJOS_TOUR, tourScrollRef)
  const addButtonTourRef = useTourTargetRef(
    FIJOS_TOUR,
    FIJOS_TOUR_STEPS.addButton.order,
    {
      text: FIJOS_TOUR_STEPS.addButton.text,
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
  const { signals: advisorSignals } = useControlV2Data(familyId)

  // Adapt controller → HeroState. La shape que consumen los componentes
  // de la vista completa V3. Recalcula cuando controller / categorías /
  // signals cambian (todo memoizado por React Query).
  const state = useMemo(
    () =>
      adaptControllerToHeroState({
        controller,
        advisorSignals,
        categoriesById,
      }),
    [controller, advisorSignals, categoriesById],
  )

  const handlePressAdd = useCallback(() => {
    void triggerHaptic('light')
    router.push('/(app)/add-fixed-expense')
  }, [router])

  const handleMarkPaid = useCallback(
    (fixedExpenseId: string) => {
      void triggerHaptic('success')
      recordPaymentMutation.mutate(fixedExpenseId, {
        onError: (error: unknown) => {
          void triggerHaptic('error')
          Alert.alert(
            'No pudimos registrar el pago',
            getErrorMessage(error, errorMessages.server),
          )
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
                Alert.alert(
                  'No pudimos eliminar',
                  getErrorMessage(error, errorMessages.server),
                )
              },
              onSuccess: () => void triggerHaptic('success'),
            })
          },
        },
      ])
    },
    [deleteMutation],
  )

  const pendingFixedExpenseId = deleteMutation.isPending
    ? (deleteMutation.variables ?? null)
    : recordPaymentMutation.isPending
      ? (recordPaymentMutation.variables ?? null)
      : null

  if (controller.error && controller.allItems.length === 0 && !controller.isLoading) {
    return (
      <Screen contentContainerStyle={styles.screenContent} scrollable={false}>
        <ErrorState
          description={getErrorMessage(controller.error, errorMessages.server)}
          title="No pudimos cargar tus fijos"
        />
      </Screen>
    )
  }

  return (
    <Screen
      contentContainerStyle={styles.screenContent}
      backgroundSlot={<AmbientBlobs />}
      scrollRef={tourScrollRef}
      onScroll={onTourScroll}
      onContentSizeChange={onTourContentSizeChange}
      scrollEventThrottle={16}
    >
      <View style={styles.stack}>
        {/* Section 1 · Header (Health pulse) — wraps add tour target ref */}
        <Animated.View entering={FadeIn.duration(360)}>
          <View ref={addButtonTourRef} collapsable={false}>
            <HeaderHealthPulse state={state} onPressAdd={handlePressAdd} />
          </View>
        </Animated.View>

        {/* Section 2 · Hero Titular */}
        <TourTarget
          tour={FIJOS_TOUR}
          order={FIJOS_TOUR_STEPS.hero.order}
          text={FIJOS_TOUR_STEPS.hero.text}
          highlight={{ borderRadius: 28, padding: 6 }}
        >
          <Animated.View entering={FadeInDown.duration(420).delay(120)}>
            <TitularHeroLive state={state} />
          </Animated.View>
        </TourTarget>

        {/* Section 3 · Próximos fused (incluye AVISOS) */}
        <TourTarget
          tour={FIJOS_TOUR}
          order={FIJOS_TOUR_STEPS.calendar.order}
          text={FIJOS_TOUR_STEPS.calendar.text}
          highlight={{ borderRadius: 22, padding: 6 }}
        >
          <Animated.View entering={FadeInDown.duration(420).delay(240)}>
            <ProximosFusedLive state={state} />
          </Animated.View>
        </TourTarget>

        {/* Section 4 · Lista por categorías con acciones por row */}
        <TourTarget
          tour={FIJOS_TOUR}
          order={FIJOS_TOUR_STEPS.list.order}
          text={FIJOS_TOUR_STEPS.list.text}
          highlight={{
            borderRadius: 22,
            padding: 6,
            extendToScrollEnd: true,
          }}
        >
          <Animated.View entering={FadeInDown.duration(420).delay(360)}>
            <FullListLive
              state={state}
              onMarkPaid={handleMarkPaid}
              onEdit={handleEdit}
              onDelete={handleDelete}
              pendingFixedExpenseId={pendingFixedExpenseId}
            />
          </Animated.View>
        </TourTarget>

        <View style={styles.bottomSpacer} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: { paddingTop: 14, paddingHorizontal: 16 },
  stack: { gap: 12 },
  bottomSpacer: { height: 24 },
})
