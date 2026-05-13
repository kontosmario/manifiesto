import { useCallback, useEffect, useState } from 'react'
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { motionEasings } from '@/lib/motion/tokens'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import { RiseRow } from './smart-alerts-helpers'
import { FijoRowMini } from './fijo-row-mini'
import { buildFijoList } from './fijo-list-sample'
import type { HeroState } from './hero-states'

const ENTER = motionEasings.enterSmooth

type ToggleId = 'por_pagar' | 'pagados'

interface TabsV2ToggleLiveProps {
  state: HeroState
}

/**
 * Variant B · Toggle binario. iOS-like segmented control con 2
 * estados: [Por pagar (N) / Pagados (N)]. La selección del usuario
 * es binaria → mínima fricción cognitiva. El segmented es el patrón
 * más familiar para "elegir entre dos vistas" en mobile.
 *
 * Default state: el que tiene más items (si la mayoría está pendiente
 * → por_pagar; si la mayoría está paid → pagados). Eso significa que
 * el usuario abre la pantalla y siempre arranca en la vista relevante.
 *
 * Animated indicator: una pill activa que se desliza spring entre los
 * dos segments al cambiar selección.
 */
export function TabsV2ToggleLive({ state }: TabsV2ToggleLiveProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const reduced = useReducedMotion()
  const items = buildFijoList(state)

  const pending = items.filter((i) => i.status !== 'paid')
  const paid = items.filter((i) => i.status === 'paid')

  // Default: el bucket con más items
  const defaultId: ToggleId = pending.length >= paid.length ? 'por_pagar' : 'pagados'
  const [activeId, setActiveId] = useState<ToggleId>(defaultId)

  const visible = activeId === 'por_pagar' ? pending : paid
  const sorted = activeId === 'por_pagar'
    ? [...visible].sort((a, b) => a.daysUntil - b.daysUntil)
    : visible

  // Animated indicator
  const [segLayouts, setSegLayouts] = useState<Record<ToggleId, { x: number; w: number }>>({
    por_pagar: { x: 0, w: 0 },
    pagados: { x: 0, w: 0 },
  })
  const indicatorX = useSharedValue(0)
  const indicatorW = useSharedValue(0)

  useEffect(() => {
    const layout = segLayouts[activeId]
    if (!layout || layout.w === 0) return
    if (reduced) {
      indicatorX.value = layout.x
      indicatorW.value = layout.w
      return
    }
    indicatorX.value = withTiming(layout.x, { duration: 240, easing: ENTER })
    indicatorW.value = withTiming(layout.w, { duration: 240, easing: ENTER })
    return () => {
      cancelAnimation(indicatorX)
      cancelAnimation(indicatorW)
    }
  }, [activeId, segLayouts, reduced, indicatorX, indicatorW])

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorW.value,
  }))

  const handlePress = useCallback((id: ToggleId) => {
    void triggerHaptic('selection')
    setActiveId(id)
  }, [])

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
        <View
          style={[
            styles.segmentTrack,
            {
              backgroundColor: theme.isDark
                ? 'rgba(242,234,211,0.06)'
                : 'rgba(18,33,26,0.05)',
            },
          ]}
        >
          {/* Animated indicator pill behind active segment */}
          <Animated.View
            style={[
              styles.segmentIndicator,
              {
                backgroundColor: theme.isDark
                  ? 'rgba(166,239,143,0.18)'
                  : 'rgba(255,253,246,1)',
                shadowColor: theme.isDark ? '#A6EF8F' : '#1F590D',
              },
              indicatorStyle,
            ]}
          />
          <Segment
            label="Por pagar"
            count={pending.length}
            isActive={activeId === 'por_pagar'}
            onPress={() => handlePress('por_pagar')}
            onLayout={(layout) =>
              setSegLayouts((prev) =>
                prev.por_pagar.x === layout.x && prev.por_pagar.w === layout.w
                  ? prev
                  : { ...prev, por_pagar: layout },
              )
            }
            activeColor={palette.urgency}
            inactiveColor={theme.colors.textMuted}
          />
          <Segment
            label="Pagados"
            count={paid.length}
            isActive={activeId === 'pagados'}
            onPress={() => handlePress('pagados')}
            onLayout={(layout) =>
              setSegLayouts((prev) =>
                prev.pagados.x === layout.x && prev.pagados.w === layout.w
                  ? prev
                  : { ...prev, pagados: layout },
              )
            }
            activeColor={palette.success}
            inactiveColor={theme.colors.textMuted}
          />
        </View>
      </RiseRow>

      {/* List below */}
      <RiseRow delay={120}>
        <View style={styles.list}>
          {sorted.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
              {activeId === 'por_pagar'
                ? 'No queda nada por pagar este ciclo.'
                : 'Ningún fijo pagado todavía.'}
            </Text>
          ) : (
            sorted.map((item, idx) => (
              <View key={item.id}>
                <FijoRowMini item={item} dimmed={item.status === 'paid'} />
                {idx < sorted.length - 1 ? (
                  <View style={[styles.divider, { backgroundColor: theme.colors.line }]} />
                ) : null}
              </View>
            ))
          )}
        </View>
      </RiseRow>

      {/* Sum caption */}
      {sorted.length > 0 ? (
        <RiseRow delay={200}>
          <Text style={[styles.sumCaption, { color: theme.colors.textMuted }]}>
            Total{' '}
            <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
              {formatMoney(sorted.reduce((s, i) => s + i.amount, 0))}
            </Text>
          </Text>
        </RiseRow>
      ) : null}
    </View>
  )
}

function Segment({
  label,
  count,
  isActive,
  onPress,
  onLayout,
  activeColor,
  inactiveColor,
}: {
  label: string
  count: number
  isActive: boolean
  onPress: () => void
  onLayout: (layout: { x: number; w: number }) => void
  activeColor: string
  inactiveColor: string
}) {
  return (
    <Pressable
      onPress={onPress}
      onLayout={(e: LayoutChangeEvent) => {
        const { x, width } = e.nativeEvent.layout
        onLayout({ x, w: width })
      }}
      style={styles.segmentBtn}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={`${label}, ${count} ítems`}
    >
      <Text
        style={[
          styles.segmentLabel,
          {
            color: isActive ? activeColor : inactiveColor,
            fontWeight: isActive ? '800' : '600',
          },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.segmentCount,
          {
            color: isActive ? activeColor : inactiveColor,
            opacity: isActive ? 1 : 0.65,
          },
        ]}
      >
        {count}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
  },
  segmentTrack: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 4,
    position: 'relative',
    marginBottom: 16,
  },
  segmentIndicator: {
    position: 'absolute',
    top: 4,
    left: 0,
    bottom: 4,
    borderRadius: 999,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    zIndex: 1,
  },
  segmentLabel: {
    fontSize: 13,
    letterSpacing: -0.1,
  },
  segmentCount: {
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  list: {
    gap: 0,
  },
  divider: {
    height: 1,
    opacity: 0.35,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 12,
    fontStyle: 'italic',
  },
  sumCaption: {
    fontSize: 11,
    marginTop: 12,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
})
