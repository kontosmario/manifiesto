import { StyleSheet, Text } from 'react-native'
import { AppCard } from '@/components/ui/card'
import { useAppTheme } from '@/theme/theme-provider'

interface MetricCardProps {
  label: string
  value: string
  helper?: string
}

export function MetricCard({ label, value, helper }: MetricCardProps) {
  const { theme } = useAppTheme()

  return (
    <AppCard elevated style={styles.card}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.value, theme.typography.metricValue, { color: theme.colors.text }]}>
        {value}
      </Text>
      {helper ? (
        <Text style={[styles.helper, theme.typography.bodySmall, { color: theme.colors.textSoft }]}>
          {helper}
        </Text>
      ) : null}
    </AppCard>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '48%',
    gap: 10,
  },
  label: {
    fontSize: 12, // no exact preset — fieldLabel(11,700,uppercase,ls:0.8) is closest but size/ls differ; flagged
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  value: {},
  helper: {},
})
