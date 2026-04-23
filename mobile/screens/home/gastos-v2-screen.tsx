import { StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { GastosHeader } from '@/components/gastos/gastos-header'
import { GastosHeroCard } from '@/components/gastos/gastos-hero-card'
import { GastosInsightsRow } from '@/components/gastos/gastos-insights-row'
import { useGastosController } from '@/features/gastos/use-gastos-controller'
import { triggerHaptic } from '@/lib/haptics'
import { errorMessages } from '@/lib/copy/states'
import { getErrorMessage } from '@/utils/error-message'

interface GastosV2ScreenProps {
  familyId: string
}

/**
 * New Gastos screen — V1 Cuaderno port. Work in progress: ships the
 * header + hero card first and will grow to include insights row,
 * month calendar, smart filter and the grouped movements list.
 */
export function GastosV2Screen({ familyId }: GastosV2ScreenProps) {
  const router = useRouter()
  const controller = useGastosController(familyId)

  const handlePressAdd = () => {
    void triggerHaptic('light')
    router.push('/(app)/(tabs)/add')
  }

  if (controller.error && controller.filteredExpenses.length === 0) {
    return (
      <Screen contentContainerStyle={styles.screenContent} scrollable={false}>
        <ErrorState
          description={getErrorMessage(controller.error, errorMessages.server)}
          title="No pudimos cargar tus gastos"
        />
      </Screen>
    )
  }

  return (
    <Screen contentContainerStyle={styles.screenContent}>
      <View style={styles.stack}>
        <AmbientBlobs />
        <GastosHeader onPressAdd={handlePressAdd} />
        <GastosHeroCard
          totalVisible={controller.filteredTotal}
          summaryChip={controller.summaryChip}
          topCategories={controller.topCategories}
        />
        <GastosInsightsRow
          averageDaily={controller.averageDaily}
          streakDays={controller.registrationStreak}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: { paddingTop: 0 },
  stack: { gap: 10 },
})
