import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'

interface GastosInsightCardProps {
  label: string
  value: string
  sub: string
  subColor?: string
  chart?: ReactNode
  delay?: number
}

/**
 * Small "insight" card used in the Gastos insights row (Promedio día,
 * Racha de registro). Matches the V1 Cuaderno mock spacing: label
 * eyebrow → bold value → sub line in an accent tone → mini chart.
 */
export function GastosInsightCard({
  label,
  value,
  sub,
  subColor,
  chart,
  delay = 0,
}: GastosInsightCardProps) {
  const { theme } = useAppTheme()
  return (
    <RiseView delay={delay} style={styles.flex}>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
        ]}
      >
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
        <Text style={[styles.value, { color: theme.colors.text }]} numberOfLines={1}>
          {value}
        </Text>
        <Text style={[styles.sub, { color: subColor ?? theme.colors.textMuted }]}>{sub}</Text>
        {chart ? <View style={styles.chartSlot}>{chart}</View> : null}
      </View>
    </RiseView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, alignSelf: 'stretch' },
  card: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
  },
  label: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  value: { fontSize: 20, fontWeight: '800', marginTop: 2, letterSpacing: -0.4 },
  sub: { fontSize: 10, fontWeight: '700' },
  chartSlot: { marginTop: 6 },
})
