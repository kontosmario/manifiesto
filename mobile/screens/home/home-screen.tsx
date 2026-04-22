import { StyleSheet, View } from 'react-native'
import { AnimatedAmount } from '@/components/ui/animated-amount'
import { Screen } from '@/components/ui/screen'
import { useMyProfile } from '@/features/profile/use-profile'

interface HomeScreenProps {
  userId: string
  familyId: string
}

// BISECT ROUND 4: only AnimatedAmount, no HomeHeroCard/AppButton wrapper.
export function HomeScreen({ userId, familyId: _familyId }: HomeScreenProps) {
  const { data: profile } = useMyProfile(userId)
  const displayName = profile?.display_name ?? 'Usuario'

  return (
    <Screen title={`Hola, ${displayName}`} contentContainerStyle={styles.content}>
      <View style={styles.box}>
        <AnimatedAmount value={12400} variant="hero" color="#0F2E1F" />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingTop: 8 },
  box: { paddingVertical: 32, alignItems: 'center' },
})
