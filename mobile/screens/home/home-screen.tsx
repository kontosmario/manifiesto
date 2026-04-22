import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { HomeHeroCard } from '@/components/home/home-hero-card'
import { Screen } from '@/components/ui/screen'
import { useMyProfile } from '@/features/profile/use-profile'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { buildHomeMetrics } from '@/features/home/home-dashboard-model'

interface HomeScreenProps {
  userId: string
  familyId: string
}

// BISECT ROUND 3: only HomeHeroCard (AnimatedAmount with useAnimatedReaction + runOnJS).
export function HomeScreen({ userId, familyId }: HomeScreenProps) {
  const { data: profile } = useMyProfile(userId)
  const displayName = profile?.display_name ?? 'Usuario'
  const dashboard = useFamilyDashboard(familyId)
  const metrics = useMemo(() => buildHomeMetrics(dashboard), [dashboard])

  return (
    <Screen title={`Hola, ${displayName}`} contentContainerStyle={styles.content}>
      <View style={styles.stack}>
        <HomeHeroCard
          availableToday={metrics.availableToday}
          projectedMargin={metrics.projectedMargin}
          onPressAddExpense={() => {}}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingTop: 8 },
  stack: { gap: 24 },
})
