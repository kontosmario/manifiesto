import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { RiseView } from '@/components/home/animated/rise-view'
import type { HomeAlert, HomeAlertType } from '@/features/home/use-home-metrics'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'

interface AlertsStripProps {
  alerts: HomeAlert[]
  onPressAlert: (alert: HomeAlert) => void
}

type AlertTone = {
  color: string
  bg: string
  border: string
}

const TONES: Record<HomeAlertType, AlertTone> = {
  upcoming_fixed: {
    color: '#E8976A',
    bg: 'rgba(240,160,96,0.12)',
    border: 'rgba(240,160,96,0.32)',
  },
  zombie_subscription: {
    color: '#C9A6E0',
    bg: 'rgba(160,140,230,0.12)',
    border: 'rgba(160,140,230,0.32)',
  },
  price_hike: {
    color: '#E06A6A',
    bg: 'rgba(220,80,80,0.10)',
    border: 'rgba(220,80,80,0.30)',
  },
}

/**
 * Horizontal rail of smart-signal chips the Home shows above the month
 * summary: upcoming fijo (orange), zombie subscriptions (purple), top
 * price hike (red). Emphasis follows urgency — high flips the border
 * to the full accent color.
 */
export function AlertsStrip({ alerts, onPressAlert }: AlertsStripProps) {
  if (alerts.length === 0) return null

  return (
    <RiseView delay={140}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {alerts.map((alert) => (
          <AlertChip key={alert.id} alert={alert} onPress={() => {
            void triggerHaptic('selection')
            onPressAlert(alert)
          }} />
        ))}
      </ScrollView>
    </RiseView>
  )
}

function AlertChip({ alert, onPress }: { alert: HomeAlert; onPress: () => void }) {
  const { theme } = useAppTheme()
  const tone = TONES[alert.type]
  const borderColor = alert.urgency === 'high' ? tone.color : tone.border

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: tone.bg,
          borderColor,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${alert.title}. ${alert.subtitle}. ${alert.actionLabel}`}
    >
      <View style={[styles.dot, { backgroundColor: tone.color }]} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: tone.color }]} numberOfLines={1}>
          {alert.title}
        </Text>
        <Text
          style={[styles.sub, { color: theme.colors.textMuted }]}
          numberOfLines={1}
        >
          {alert.subtitle} ·{' '}
          <Text style={[styles.action, { color: tone.color }]}>
            {alert.actionLabel} →
          </Text>
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 13,
    maxWidth: 320,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  body: {
    flexShrink: 1,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
  },
  sub: {
    fontSize: 11,
    marginTop: 2,
  },
  action: {
    fontWeight: '700',
  },
})
