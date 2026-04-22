import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { useMyProfile } from '@/features/profile/use-profile'
import { useAppTheme } from '@/theme/theme-provider'

interface HomeScreenProps {
  userId: string
  familyId: string
}

// TEMP: minimal home to bisect the crash. Once we confirm the root cause,
// restore the real implementation from mobile/components/home/home-dashboard.tsx.
export function HomeScreen({ userId, familyId }: HomeScreenProps) {
  const { theme } = useAppTheme()
  const { data: profile } = useMyProfile(userId)
  const displayName = profile?.display_name ?? 'Usuario'

  return (
    <Screen title={`Hola, ${displayName}`} contentContainerStyle={styles.content}>
      <View
        style={[
          styles.smokeCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '800' }}>
          Home mínima — bisect crash
        </Text>
        <Text style={{ color: theme.colors.textMuted, marginTop: 8 }}>
          userId: {userId.slice(0, 8)}…
        </Text>
        <Text style={{ color: theme.colors.textMuted }}>
          familyId: {familyId.slice(0, 8)}…
        </Text>
        <Text style={{ color: theme.colors.textSoft, marginTop: 12, fontSize: 12 }}>
          Si ves este texto, el Screen wrapper y los providers están OK. El crash está en
          HomeDashboard tree (AnimatedAmount / BottomSheetModal / SwipeableRow / PaydayChip).
        </Text>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingTop: 8 },
  smokeCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 4,
  },
})
