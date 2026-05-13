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
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import { RiseRow } from './smart-alerts-helpers'
import { buildTabBuckets, type TabId } from './tabs-helpers'
import type { HeroState } from './hero-states'

interface TabsChipDropdownLiveProps {
  state: HeroState
}

/**
 * Variant D · Single chip dropdown. Un solo chip "Pendientes (5) ▾"
 * que expande inline un panel con todos los buckets. Restraint
 * footprint mínimo — para pantallas que ya tienen mucha info.
 *
 * Animation: chevron rotates 180° on expand (200ms spring). Panel
 * usa LinearTransition layout para grow smooth.
 */
export function TabsChipDropdownLive({ state }: TabsChipDropdownLiveProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const buckets = buildTabBuckets(state).filter((b) => b.id !== 'zombis')

  const [activeId, setActiveId] = useState<TabId>('todos')
  const [isOpen, setIsOpen] = useState(false)
  const press = usePressScale({ pressedScale: 0.96 })

  const active = buckets.find((b) => b.id === activeId) ?? buckets[0]

  const chevronRotation = useSharedValue(0)
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }))

  const handleToggle = useCallback(() => {
    void triggerHaptic('selection')
    setIsOpen((prev) => {
      const next = !prev
      chevronRotation.value = withSpring(next ? 180 : 0, {
        damping: 16,
        stiffness: 220,
        mass: 0.6,
      })
      return next
    })
  }, [chevronRotation])

  const handleSelect = useCallback(
    (id: TabId) => {
      void triggerHaptic('selection')
      setActiveId(id)
      setIsOpen(false)
      chevronRotation.value = withSpring(0, {
        damping: 16,
        stiffness: 220,
        mass: 0.6,
      })
    },
    [chevronRotation],
  )

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
            MOSTRAR
          </Text>
          <Pressable
            onPress={handleToggle}
            onPressIn={press.onPressIn}
            onPressOut={press.onPressOut}
            accessibilityRole="button"
            accessibilityState={{ expanded: isOpen }}
            accessibilityLabel={`Filtro actual: ${active.label}, ${active.count} ítems. Tocar para cambiar.`}
          >
            <Animated.View
              style={[
                styles.chip,
                {
                  backgroundColor: theme.isDark
                    ? 'rgba(166,239,143,0.12)'
                    : 'rgba(31,89,13,0.08)',
                  borderColor: palette.success,
                },
                press.animatedStyle,
              ]}
            >
              <Text style={[styles.chipLabel, { color: palette.success }]}>
                {active.label}
              </Text>
              <View style={[styles.chipCount, { backgroundColor: palette.success }]}>
                <Text
                  style={[
                    styles.chipCountText,
                    { color: theme.isDark ? '#0F2E1F' : '#FFFBF2' },
                  ]}
                >
                  {active.count}
                </Text>
              </View>
              <Animated.View style={chevronStyle}>
                <MaterialIcons
                  name="keyboard-arrow-down"
                  size={18}
                  color={palette.success}
                />
              </Animated.View>
            </Animated.View>
          </Pressable>
        </View>
      </RiseRow>

      <Animated.View layout={LinearTransition.duration(260)} style={styles.expandedWrap}>
        {isOpen ? (
          <View
            style={[
              styles.expandedPanel,
              { borderTopColor: theme.colors.line },
            ]}
          >
            {buckets.map((b) => (
              <OptionRow
                key={b.id}
                bucket={b}
                active={b.id === activeId}
                onPress={() => handleSelect(b.id)}
                palette={palette}
                textColor={theme.colors.text}
                textMuted={theme.colors.textMuted}
                divider={theme.colors.line}
                isLast={b.id === buckets[buckets.length - 1].id}
              />
            ))}
          </View>
        ) : null}
      </Animated.View>
    </View>
  )
}

function OptionRow({
  bucket,
  active,
  onPress,
  palette,
  textColor,
  textMuted,
  divider,
  isLast,
}: {
  bucket: { id: TabId; label: string; count: number; amount: number }
  active: boolean
  onPress: () => void
  palette: ReturnType<typeof buildProximosPalette>
  textColor: string
  textMuted: string
  divider: string
  isLast: boolean
}) {
  const press = usePressScale({ pressedScale: 0.98 })
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Animated.View style={[styles.optionRow, press.animatedStyle]}>
        <View style={styles.optionLeft}>
          <Text
            style={[
              styles.optionLabel,
              {
                color: active ? palette.success : textColor,
                fontWeight: active ? '800' : '600',
              },
            ]}
          >
            {bucket.label}
          </Text>
          <Text style={[styles.optionAmount, { color: textMuted }]}>
            {bucket.amount > 0
              ? `$ ${Math.round(bucket.amount).toLocaleString('es-AR')}`
              : '—'}
          </Text>
        </View>
        <Text
          style={[
            styles.optionCount,
            { color: active ? palette.success : textMuted },
          ]}
        >
          {bucket.count}
        </Text>
        {active ? (
          <MaterialIcons name="check" size={16} color={palette.success} />
        ) : null}
      </Animated.View>
      {!isLast ? <View style={[styles.optionDivider, { backgroundColor: divider }]} /> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  chipCount: {
    minWidth: 22,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    alignItems: 'center',
  },
  chipCountText: {
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  expandedWrap: {
    overflow: 'hidden',
  },
  expandedPanel: {
    marginTop: 14,
    borderTopWidth: 1,
    paddingTop: 6,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  optionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    flexWrap: 'wrap',
  },
  optionLabel: {
    fontSize: 14,
    letterSpacing: -0.1,
  },
  optionAmount: {
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  optionCount: {
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  optionDivider: {
    height: 1,
    opacity: 0.4,
  },
})
