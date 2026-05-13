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
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import { RiseRow } from './smart-alerts-helpers'
import { buildTabBuckets, type TabId } from './tabs-helpers'
import type { HeroState } from './hero-states'

const ENTER = motionEasings.enterSmooth

interface TabsUnderlineLiveProps {
  state: HeroState
}

/**
 * Variant A · Underline switch. Labels en línea con underline que se
 * desliza animado entre tabs (240ms ease-out-expo). Cero pills, cero
 * count chips dentro. Counts a la derecha del label en muted. Editorial
 * NY Times style — restraint puro.
 *
 * Animation: underline slide-and-grow al cambiar tab. Tap haptic light.
 * Theme-aware: el underline usa palette.success (lime dark / forest
 * light), labels active tienen color text, inactive textMuted.
 */
export function TabsUnderlineLive({ state }: TabsUnderlineLiveProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const reduced = useReducedMotion()

  const buckets = buildTabBuckets(state).filter((b) => b.id !== 'zombis')
  // Filtro zombis fuera — bucket legacy. Si querés mostrarlo, remové.
  const [activeId, setActiveId] = useState<TabId>('todos')

  // Layout tracking de cada tab para mover el underline
  const [tabLayouts, setTabLayouts] = useState<Record<string, { x: number; w: number }>>({})
  const x = useSharedValue(0)
  const w = useSharedValue(0)

  useEffect(() => {
    const layout = tabLayouts[activeId]
    if (!layout) return
    if (reduced) {
      x.value = layout.x
      w.value = layout.w
      return
    }
    x.value = withTiming(layout.x, { duration: 280, easing: ENTER })
    w.value = withTiming(layout.w, { duration: 280, easing: ENTER })
    return () => {
      cancelAnimation(x)
      cancelAnimation(w)
    }
  }, [activeId, tabLayouts, reduced, x, w])

  const underlineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    width: w.value,
  }))

  const handlePress = useCallback((id: TabId) => {
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
        <View style={styles.tabsRow}>
          {buckets.map((b) => {
            const isActive = b.id === activeId
            return (
              <Pressable
                key={b.id}
                onPress={() => handlePress(b.id)}
                onLayout={(e: LayoutChangeEvent) => {
                  const { x: lx, width } = e.nativeEvent.layout
                  setTabLayouts((prev) =>
                    prev[b.id]?.x === lx && prev[b.id]?.w === width
                      ? prev
                      : { ...prev, [b.id]: { x: lx, w: width } },
                  )
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                style={styles.tabBtn}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color: isActive ? theme.colors.text : theme.colors.textMuted,
                      fontWeight: isActive ? '800' : '600',
                    },
                  ]}
                >
                  {b.label}
                </Text>
                <Text
                  style={[
                    styles.tabCount,
                    {
                      color: isActive ? palette.success : theme.colors.textMuted,
                    },
                  ]}
                >
                  {b.count}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </RiseRow>
      {/* Underline anchored to the bottom of the tabs row */}
      <View style={styles.underlineTrack}>
        <Animated.View
          style={[styles.underline, { backgroundColor: palette.success }, underlineStyle]}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
    borderWidth: 1,
    position: 'relative',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    paddingBottom: 12,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 14,
    letterSpacing: -0.2,
  },
  tabCount: {
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  underlineTrack: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 10,
    height: 2,
  },
  underline: {
    height: 2,
    borderRadius: 1,
  },
})
