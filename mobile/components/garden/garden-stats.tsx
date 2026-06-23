import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'

interface GardenStatsProps {
  total: number
  record: number
  seeds: number
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  const { theme } = useAppTheme()
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.creamCard }]}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
      <Text style={[styles.sub, { color: theme.colors.textSoft }]}>{sub}</Text>
    </View>
  )
}

/** 3 stat cards: total de brotes, récord de racha, semillas (escudos). */
function GardenStatsImpl({ total, record, seeds }: GardenStatsProps) {
  return (
    <View style={styles.row}>
      <StatCard label="JARDÍN" value={String(total)} sub="brotes en total" />
      <StatCard label="RÉCORD" value={`${record} días`} sub="tu mejor racha" />
      <StatCard label="SEMILLAS" value={`x ${seeds}`} sub="cubren un olvido" />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 11,
  },
  card: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 15,
    paddingHorizontal: 14,
    boxShadow: '0 4px 16px rgba(28,58,35,0.05)',
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  value: {
    fontSize: 21,
    fontWeight: '800',
    marginTop: 3,
  },
  sub: {
    fontSize: 11,
    marginTop: 1,
  },
})

export const GardenStats = memo(GardenStatsImpl)
