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

interface TabsV2BandejaLiveProps {
  state: HeroState
}

/**
 * Variant A · Bandeja simple. SIN TABS. Dos secciones en el scroll:
 * "POR PAGAR" (expandida default) + "PAGADOS" (collapsable). La
 * estructura ES la organización. No hay decisión que tomar — abrís
 * la pantalla y ya estás viendo lo que necesitás (lo que falta).
 *
 * Editorial: cada sección tiene su own eyebrow + rule + count. La
 * de pagados se colapsa con chevron rotation + LinearTransition.
 */
export function TabsV2BandejaLive({ state }: TabsV2BandejaLiveProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const items = buildFijoList(state)

  const pending = items.filter((i) => i.status === 'pending' || i.status === 'overdue')
  const paid = items.filter((i) => i.status === 'paid')

  // Sort pending by urgency (overdue first, then days asc)
  const sortedPending = [...pending].sort((a, b) => {
    if (a.status === 'overdue' && b.status !== 'overdue') return -1
    if (b.status === 'overdue' && a.status !== 'overdue') return 1
    return a.daysUntil - b.daysUntil
  })

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
      {/* POR PAGAR section — siempre expandida */}
      <RiseRow delay={0}>
        <View style={styles.headerRow}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
            POR PAGAR
          </Text>
          <Text style={[styles.headerMeta, { color: palette.urgency }]}>
            {pending.length} {pending.length === 1 ? 'fijo' : 'fijos'} ·{' '}
            {formatMoney(pending.reduce((s, i) => s + i.amount, 0))}
          </Text>
        </View>
      </RiseRow>
      <View style={[styles.rule, { backgroundColor: palette.urgency }]} />

      <View style={styles.list}>
        {sortedPending.length === 0 ? (
          <View style={styles.emptyRow}>
            <MaterialIcons name="check-circle" size={18} color={palette.success} />
            <Text style={[styles.emptyText, { color: theme.colors.text }]}>
              Sin pendientes — todo pagado este ciclo.
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

      {/* PAGADOS section — collapsable */}
      {paid.length > 0 ? (
        <PaidSection paid={paid} divider={theme.colors.line} successColor={palette.success} />
      ) : null}
    </View>
  )
}

function PaidSection({
  paid,
  divider,
  successColor,
}: {
  paid: import('./fijo-list-sample').FijoItem[]
  divider: string
  successColor: string
}) {
  const { theme } = useAppTheme()
  const [open, setOpen] = useState(false)
  const chevron = useSharedValue(0)

  const handleToggle = useCallback(() => {
    void triggerHaptic('selection')
    setOpen((prev) => {
      const next = !prev
      chevron.value = withSpring(next ? 180 : 0, {
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

  return (
    <View style={styles.paidWrap}>
      <View style={[styles.sectionDivider, { backgroundColor: divider }]} />
      <Pressable
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${paid.length} fijos pagados, tocar para ${open ? 'colapsar' : 'expandir'}`}
      >
        <View style={styles.paidHeader}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
            PAGADOS
          </Text>
          <View style={styles.paidHeaderRight}>
            <Text style={[styles.headerMeta, { color: successColor }]}>
              {paid.length} · {formatMoney(paid.reduce((s, i) => s + i.amount, 0))}
            </Text>
            <Animated.View style={chevronStyle}>
              <MaterialIcons
                name="keyboard-arrow-down"
                size={18}
                color={theme.colors.textMuted}
              />
            </Animated.View>
          </View>
        </View>
      </Pressable>

      <Animated.View layout={LinearTransition.duration(260)} style={styles.paidExpanded}>
        {open ? (
          <View>
            <View style={[styles.rule, { backgroundColor: successColor }]} />
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
    fontWeight: '700',
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
    marginTop: 14,
  },
  sectionDivider: {
    height: 1,
    marginBottom: 14,
    opacity: 0.5,
  },
  paidHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paidHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paidExpanded: {
    overflow: 'hidden',
  },
})
