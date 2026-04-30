import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { RiseView } from '@/components/home/animated/rise-view'
import { useRouter } from 'expo-router'
import type { FijoHikeAlert } from '@/features/fijos/fijos-aggregates.model'
import {
  dismissHike,
  isHikeDismissed,
  useDismissedHikes,
} from '@/features/fijos/use-hike-dismiss-store'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'
import { triggerHaptic } from '@/lib/haptics'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

interface SmartAlert {
  id: string
  icon: string
  title: string
  body: string
  action?: string
  tint: string
  onPress?: () => void
  /** When provided, renders a small "Entendido" (✓) button that
   *  calls this callback — used for acknowledgeable alerts (hikes). */
  onDismiss?: () => void
}

interface FijosSmartAlertsProps {
  zombieCount: number
  hikes: FijoHikeAlert[]
  onOpenZombies?: () => void
  onOpenHike?: (fixedExpenseId: string) => void
  /** Advisor signals from `useControlV2Data`. Filtered internally to
   *  the fijos domain (`stress-week`, `fijos-ratio`) so the rail
   *  surfaces them next to zombie + hike alerts. */
  advisorSignals?: ControlAdvisorTask[]
}

/**
 * Horizontal-scrolling rail of smart alert cards — zombie
 * subscriptions + detected price hikes. Each card has a colored
 * icon tile + title + body + action pill.
 */
export function FijosSmartAlerts({
  zombieCount,
  hikes,
  onOpenZombies,
  onOpenHike,
  advisorSignals = [],
}: FijosSmartAlertsProps) {
  const router = useRouter()
  const dismissedHikes = useDismissedHikes()
  const alerts: SmartAlert[] = []

  // Advisor signals tied to the fijos domain go first — they're the
  // "big picture" context (semana cargada, ratio fijos/sueldo) that
  // frames the more granular zombie/hike alerts below.
  const stressWeek = advisorSignals.find((s) => s.id === 'stress-week')
  if (stressWeek) {
    alerts.push({
      id: stressWeek.id,
      icon: '📅',
      title: stressWeek.title,
      body: stressWeek.body.split('.')[0] ?? stressWeek.body,
      action: 'Ver',
      tint: '#E8B85F',
      onPress: () => router.push('/(app)/(tabs)/fixed-expenses'),
    })
  }
  const fijosRatio = advisorSignals.find((s) => s.id === 'fijos-ratio')
  if (fijosRatio) {
    alerts.push({
      id: fijosRatio.id,
      icon: '⚖️',
      title: fijosRatio.title,
      body: fijosRatio.body.split('.')[0] ?? fijosRatio.body,
      action: 'Ver',
      tint: fijosRatio.urgency === 'alta' ? '#E88A70' : '#E8B85F',
    })
  }

  if (zombieCount > 0) {
    alerts.push({
      id: 'zombies',
      icon: '🧟',
      title: `${zombieCount} ${zombieCount === 1 ? 'suscripción zombi' : 'suscripciones zombi'}`,
      body: 'Sin uso en 60 días. Podés revisar.',
      action: 'Ver',
      tint: '#C9A6E0',
      onPress: onOpenZombies,
    })
  }
  // Hide hikes the user already acknowledged at the current price.
  // If the price changes again later, the stored `dismissedAtPrice`
  // won't match the new `currentPrice` and the alert re-surfaces.
  const visibleHikes = hikes.filter(
    (h) => !isHikeDismissed(h.fixedExpenseId, h.currentPrice, dismissedHikes),
  )
  for (const h of visibleHikes) {
    alerts.push({
      id: `hike-${h.fixedExpenseId}`,
      icon: '📈',
      title: `${h.name}`,
      body: `Subió ${h.deltaPct}% vs. ${formatMoney(h.previousPrice)}`,
      action: 'Ver',
      tint: h.category?.color ?? '#E8976A',
      onPress: onOpenHike ? () => onOpenHike(h.fixedExpenseId) : undefined,
      onDismiss: () => {
        void triggerHaptic('light')
        void dismissHike(h.fixedExpenseId, h.currentPrice)
      },
    })
  }
  if (alerts.length === 0) return null
  return (
    <RiseView delay={80}>
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
      <View style={styles.actions}>
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
        {alert.onDismiss ? (
          <Pressable
            onPress={alert.onDismiss}
            style={[styles.dismissBtn, { borderColor: theme.colors.line }]}
            accessibilityRole="button"
            accessibilityLabel="Ya lo vi"
            accessibilityHint="Oculta este aviso hasta que cambie el precio"
            hitSlop={8}
          >
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path
                d="M5 12l4 4 10-10"
                stroke={theme.colors.text}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        ) : null}
      </View>
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  actionText: { fontSize: 11, fontWeight: '700' },
  dismissBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
