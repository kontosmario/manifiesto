import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoneyShort } from '@/utils/money'

interface SettingsSavingsGoalCardProps {
  familyId: string
}

export function SettingsSavingsGoalCard({ familyId }: SettingsSavingsGoalCardProps) {
  const { theme } = useAppTheme()
  const router = useRouter()
  const goal = useSavingsGoal(familyId)
  const subtitle = goal.data
    ? `${goal.data.emoji} ${goal.data.title} · ${formatMoneyShort(goal.data.currentAmount)} / ${formatMoneyShort(goal.data.goalAmount)}`
    : 'Sin meta configurada'

  return (
    <Pressable
      onPress={() => router.push('/(app)/savings-goal')}
      style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
      accessibilityRole="button"
      accessibilityLabel="Configurar meta de ahorro"
    >
      <View style={styles.flex}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Meta de ahorro</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
      </View>
      <Text style={[styles.chev, { color: theme.colors.textSoft }]}>›</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, borderWidth: 1 },
  flex: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '700' },
  subtitle: { fontSize: 12 },
  chev: { fontSize: 22, fontWeight: '300' },
})
