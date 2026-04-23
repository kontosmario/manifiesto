import { StyleSheet, Text, View } from 'react-native'
import { MiniBars } from '@/components/home/mini-bars'
import { GastosInsightCard } from '@/components/gastos/gastos-insight-card'
import { GastosStreakBars } from '@/components/gastos/gastos-streak-bars'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

interface GastosInsightsRowProps {
  averageDaily: number
  windowDays?: number
  streakDays: number
}

/**
 * Two-card insights row under the hero:
 *   PROMEDIO DÍA — average daily spend + 7-bar mini histogram
 *   RACHA DE REGISTRO — consecutive days registering + gradient bars
 */
export function GastosInsightsRow({
  averageDaily,
  windowDays = 22,
  streakDays,
}: GastosInsightsRowProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.row}>
      <GastosInsightCard
        label="PROMEDIO DÍA"
        value={formatMoney(averageDaily)}
        sub={`últimos ${windowDays} días`}
        subColor={theme.colors.textMuted}
        chart={
          <MiniBars
            values={[0.4, 0.6, 0.3, 0.7, 0.5, 0.8, 0.55]}
            color={theme.isDark ? theme.colors.heroAccent : '#2E7D5B'}
            barWidth={6}
            totalHeight={24}
          />
        }
        delay={200}
      />
      <GastosInsightCard
        label="RACHA DE REGISTRO"
        value={streakDays === 1 ? '1 día' : `${streakDays} días`}
        sub={streakDays > 0 ? 'sin olvidarte' : 'empezá hoy'}
        subColor="#6B3A4F"
        chart={
          streakDays > 0 ? (
            <GastosStreakBars count={streakDays} />
          ) : (
            <Text style={styles.emoji}>🔥</Text>
          )
        }
        delay={260}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  emoji: { fontSize: 22 },
})
