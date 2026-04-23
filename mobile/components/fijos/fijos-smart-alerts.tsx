import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'

interface SmartAlert {
  id: string
  icon: string
  title: string
  body: string
  action?: string
  tint: string
  onPress?: () => void
}

interface FijosSmartAlertsProps {
  zombieCount: number
  onOpenZombies?: () => void
  // Future: hike detection can feed into this too. For now we show
  // zombies only since that's all we can compute from the schema.
}

/**
 * Horizontal-scrolling rail of smart alert cards — zombie
 * subscriptions, upcoming hikes, stale payments. Each card has a
 * colored icon tile + title + body + action pill.
 */
export function FijosSmartAlerts({ zombieCount, onOpenZombies }: FijosSmartAlertsProps) {
  const alerts: SmartAlert[] = []
  if (zombieCount > 0) {
    alerts.push({
      id: 'zombies',
      icon: '🧟',
      title: `${zombieCount} ${zombieCount === 1 ? 'suscripción zombi' : 'suscripciones zombi'}`,
      body: 'Barato + sin uso. Revisalas.',
      action: 'Ver',
      tint: '#C9A6E0',
      onPress: onOpenZombies,
    })
  }
  if (alerts.length === 0) return null
  return (
    <RiseView delay={220}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {alerts.map((a, i) => (
          <AlertCard key={a.id} alert={a} index={i} />
        ))}
      </ScrollView>
    </RiseView>
  )
}

function AlertCard({ alert, index }: { alert: SmartAlert; index: number }) {
  const { theme } = useAppTheme()
  void index
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: hexAlpha(alert.tint, 0.12),
          borderColor: hexAlpha(alert.tint, 0.4),
        },
      ]}
    >
      <View style={[styles.iconTile, { backgroundColor: hexAlpha(alert.tint, 0.22) }]}>
        <Text style={styles.iconText}>{alert.icon}</Text>
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
          {alert.title}
        </Text>
        <Text style={[styles.bodyText, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {alert.body}
        </Text>
      </View>
      {alert.action ? (
        <Pressable
          onPress={alert.onPress}
          style={[styles.actionBtn, { borderColor: theme.colors.line }]}
          accessibilityRole="button"
          accessibilityLabel={alert.action}
        >
          <Text style={[styles.actionText, { color: theme.colors.text }]}>{alert.action}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function hexAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized.split('').map((c) => c + c).join('')
      : normalized
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingRight: 4 },
  card: {
    minWidth: 250,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 18 },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, fontWeight: '700', lineHeight: 16 },
  bodyText: { fontSize: 11, marginTop: 2 },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  actionText: { fontSize: 11, fontWeight: '700' },
})
