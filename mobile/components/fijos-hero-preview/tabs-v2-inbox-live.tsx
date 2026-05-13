import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { triggerHaptic } from '@/lib/haptics'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import { RiseRow } from './smart-alerts-helpers'
import { FijoRowMini } from './fijo-row-mini'
import { buildFijoList } from './fijo-list-sample'
import type { HeroState } from './hero-states'

interface TabsV2InboxLiveProps {
  state: HeroState
}

/**
 * Variant C · Inbox progresivo. Por default muestra SOLO los
 * pendientes — es lo que el usuario vino a ver. Al final un link
 * sutil "Ver N pagados →" expande inline una sub-sección con los
 * pagados (dimmed). No hay tab, no hay toggle, no hay decisión
 * inicial. Progressive disclosure puro.
 *
 * Es el patrón de Gmail (default = inbox, "All Mail" es un sub-folder).
 */
export function TabsV2InboxLive({ state }: TabsV2InboxLiveProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const items = buildFijoList(state)

  const pending = items.filter((i) => i.status !== 'paid')
  const paid = items.filter((i) => i.status === 'paid')

  const sortedPending = [...pending].sort((a, b) => {
    if (a.status === 'overdue' && b.status !== 'overdue') return -1
    if (b.status === 'overdue' && a.status !== 'overdue') return 1
    return a.daysUntil - b.daysUntil
  })

  const [showPaid, setShowPaid] = useState(false)
  const chevron = useSharedValue(0)

  const handleToggle = useCallback(() => {
    void triggerHaptic('selection')
    setShowPaid((prev) => {
      const next = !prev
      chevron.value = withSpring(next ? 90 : 0, {
        damping: 16,
        stiffness: 220,
        mass: 0.6,
      })
      return next
    })
  }, [chevron])

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevron.value}deg` }],
  }))

  const pendingSum = sortedPending.reduce((s, i) => s + i.amount, 0)

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <RiseRow delay={0}>
        <View style={styles.headerRow}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
            BANDEJA DEL CICLO
          </Text>
          <Text style={[styles.headerMeta, { color: theme.colors.textMuted }]}>
            {sortedPending.length} {sortedPending.length === 1 ? 'pendiente' : 'pendientes'}
            {pendingSum > 0 ? ` · ${formatMoney(pendingSum)}` : ''}
          </Text>
        </View>
      </RiseRow>
      <View style={[styles.rule, { backgroundColor: theme.colors.text }]} />

      <View style={styles.list}>
        {sortedPending.length === 0 ? (
          <View style={styles.emptyRow}>
            <MaterialIcons name="check-circle" size={20} color={palette.success} />
            <Text style={[styles.emptyText, { color: theme.colors.text }]}>
              Bandeja vacía. Ya pagaste todo este ciclo.
            </Text>
          </View>
        ) : (
          sortedPending.map((item, idx) => (
            <View key={item.id}>
              <FijoRowMini item={item} />
              {idx < sortedPending.length - 1 ? (
                <View style={[styles.divider, { backgroundColor: theme.colors.line }]} />
              ) : null}
            </View>
          ))
        )}
      </View>

      {paid.length > 0 ? (
        <View style={styles.paidWrap}>
          <Pressable
            onPress={handleToggle}
            accessibilityRole="button"
            accessibilityState={{ expanded: showPaid }}
            accessibilityLabel={`${showPaid ? 'Ocultar' : 'Ver'} ${paid.length} pagados`}
          >
            <View style={styles.paidLinkRow}>
              <Animated.View style={chevronStyle}>
                <MaterialIcons
                  name="keyboard-arrow-right"
                  size={16}
                  color={palette.success}
                />
              </Animated.View>
              <Text style={[styles.paidLink, { color: palette.success }]}>
                {showPaid ? 'Ocultar' : 'Ver'} {paid.length}{' '}
                {paid.length === 1 ? 'pagado' : 'pagados'}
              </Text>
            </View>
          </Pressable>

          <Animated.View
            layout={LinearTransition.duration(280)}
            style={styles.paidExpandedWrap}
          >
            {showPaid ? (
              <View>
                <View style={styles.list}>
                  {paid.map((item, idx) => (
                    <View key={item.id}>
                      <FijoRowMini item={item} dimmed />
                      {idx < paid.length - 1 ? (
                        <View style={[styles.divider, { backgroundColor: theme.colors.line }]} />
                      ) : null}
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </Animated.View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  headerMeta: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  rule: {
    width: 28,
    height: 2,
    marginTop: 10,
    marginBottom: 12,
    opacity: 0.55,
  },
  list: {
    gap: 0,
  },
  divider: {
    height: 1,
    opacity: 0.35,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  paidWrap: {
    marginTop: 12,
  },
  paidLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  paidLink: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  paidExpandedWrap: {
    overflow: 'hidden',
  },
})
