import { StyleSheet, Text, View } from 'react-native'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'
import type { StatusTone } from './streak-sheet-tone'

interface WeekActivityProps {
  weekActivity: boolean[]
  tone: StatusTone
}

export function WeekActivity({ weekActivity, tone }: WeekActivityProps) {
  const { theme } = useAppTheme()
  const labels = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  const emptyDotBg = theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,42,30,0.04)'
  return (
    <RiseView delay={120}>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
        ]}
      >
        <Text style={[styles.cardLabel, { color: theme.colors.textMuted }]}>
          Últimos 7 días
        </Text>
        <View style={styles.weekRow}>
          {weekActivity.map((logged, i) => {
            const isToday = i === weekActivity.length - 1
            return (
              <View key={i} style={styles.dayCol}>
                <View
                  style={[
                    styles.dayDot,
                    {
                      backgroundColor: logged ? tone.fg : emptyDotBg,
                      borderColor: logged
                        ? tone.fg
                        : isToday
                          ? tone.fg
                          : theme.colors.line,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayDotText,
                      {
                        color: logged
                          ? theme.isDark
                            ? '#0A1410'
                            : '#F2EAD3'
                          : isToday
                            ? tone.fg
                            : theme.colors.textMuted,
                      },
                    ]}
                  >
                    {logged ? '✓' : isToday ? '?' : '·'}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.dayLabel,
                    {
                      color: isToday && !logged ? tone.fg : theme.colors.textMuted,
                      fontWeight: isToday ? '800' : '600',
                    },
                  ]}
                >
                  {labels[i]}
                </Text>
              </View>
            )
          })}
        </View>
      </View>
    </RiseView>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 10,
    letterSpacing: 0.6,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCol: { alignItems: 'center', gap: 5, flex: 1 },
  dayDot: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDotText: { fontSize: 12, fontWeight: '700' },
  dayLabel: { fontSize: 10 },
})
