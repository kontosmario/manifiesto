import { Alert, StyleSheet, View } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { useCallback, useMemo } from 'react'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { FijosHeader } from '@/components/fijos/fijos-header'
import { FijosHeroCard } from '@/components/fijos/fijos-hero-card'
import { FijosSmartAlerts } from '@/components/fijos/fijos-smart-alerts'
import { FijosUpcomingStrip } from '@/components/fijos/fijos-upcoming-strip'
import { FijosTabs } from '@/components/fijos/fijos-tabs'
import { FijoCategoryGroups } from '@/components/fijos/fijo-category-groups'
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
      Alert.alert('Eliminar fijo', '¿Seguro que querés eliminar este fijo?', [
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
      <Screen contentContainerStyle={styles.screenContent} scrollable={false}>
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
      contentContainerStyle={styles.screenContent}
      // Rendered behind the ScrollView (not inside it) so the auroras
      // cover the full viewport and don't scroll with the content.
      backgroundSlot={<AmbientBlobs />}
    >
      <View style={styles.stack}>
        <Animated.View layout={sectionLayout}>
          <FijosHeader onPressAdd={handlePressAdd} />
        </Animated.View>
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
            dineroLibre={controller.freeAfterFijos}
            porcentajeSueldo={controller.pctOfIncome}
          />
        </Animated.View>
        <Animated.View layout={sectionLayout}>
          <FijosSmartAlerts
            zombieCount={controller.summary.zombies.length}
            hikes={controller.summary.hikes}
            advisorSignals={advisorSignals}
            onOpenZombies={() => controller.setTab('zombis')}
            onOpenHike={handleEdit}
          />
        </Animated.View>
        <Animated.View layout={sectionLayout}>
          <FijosUpcomingStrip
            upcoming={controller.summary.upcoming}
            todayDay={controller.summary.todayDay}
            categoriesById={categoriesById}
          />
        </Animated.View>
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
