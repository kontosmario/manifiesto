import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { triggerHaptic } from '@/lib/haptics'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import { RiseRow, RuleScale, getSignalIcon } from './smart-alerts-helpers'
import type { HeroState } from './hero-states'

const ROTATION_MS = 6000
const CROSSFADE_MS = 360
const EXPO_OUT = Easing.bezier(0.16, 1, 0.3, 1)

interface SmartAlertsMarqueeLiveProps {
  state: HeroState
}

/**
 * Variant C · Marquee headline. Una sola noticia a la vez, rota cada
 * 6s con crossfade. Editorial restraint extremo: attention 100% en
 * la nota actual. Dots de paginación abajo. Tap left/right navega
 * manual. Gramática heredada del Wrapped pero a escala de card.
 *
 * Si hay 0 alertas → mensaje "todo en orden" estático sin rotación.
 * Si hay 1 alerta → no rota.
 */
export function SmartAlertsMarqueeLive({ state }: SmartAlertsMarqueeLiveProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const reduced = useReducedMotion()

  type Item =
    | {
        kind: 'hike'
        id: string
        label: string
        title: string
        body: string
        delta: string
        accent: string
      }
    | {
        kind: 'signal'
        id: string
        label: string
        title: string
        body: string
        icon: ReturnType<typeof getSignalIcon>
        accent: string
      }

  const items: Item[] = [
    ...state.alerts.hikes.map((h) => ({
      kind: 'hike' as const,
      id: h.id,
      label: 'PRECIO SUBIÓ',
      title: h.name,
      body: `${formatMoney(h.previousPrice)} → ${formatMoney(h.currentPrice)}`,
      delta: `+${h.deltaPct}%`,
      accent: palette.urgency,
    })),
    ...state.alerts.signals.map((s) => ({
      kind: 'signal' as const,
      id: s.id,
      label:
        s.kind === 'streak'
          ? 'LOGRO'
          : s.kind === 'stress-week'
          ? 'SEMANA CARGADA'
          : s.kind === 'fijos-ratio'
          ? 'RATIO ALTO'
          : 'TENDENCIA',
      title: s.title,
      body: s.body,
      icon: getSignalIcon(s.kind),
      accent:
        s.kind === 'streak'
          ? palette.success
          : s.urgency === 'alta'
          ? palette.urgencyStrong
          : palette.urgency,
    })),
  ]

  const total = items.length
  const [activeIdx, setActiveIdx] = useState(0)

  const progress = useSharedValue(0)
  const sceneAlpha = useSharedValue(1)
  const sceneY = useSharedValue(0)

  const advance = useCallback(() => {
    setActiveIdx((i) => (i + 1) % Math.max(1, total))
  }, [total])

  useEffect(() => {
    cancelAnimation(progress)
    progress.value = 0

    if (!reduced) {
      sceneAlpha.value = 0
      sceneY.value = 6
      sceneAlpha.value = withTiming(1, { duration: CROSSFADE_MS, easing: EXPO_OUT })
      sceneY.value = withTiming(0, { duration: CROSSFADE_MS, easing: EXPO_OUT })
    } else {
      sceneAlpha.value = 1
      sceneY.value = 0
    }

    if (reduced || total <= 1) return

    progress.value = withTiming(
      1,
      { duration: ROTATION_MS, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(advance)()
      },
    )
    return () => cancelAnimation(progress)
  }, [activeIdx, reduced, total, progress, sceneAlpha, sceneY, advance])

  const sceneStyle = useAnimatedStyle(() => ({
    opacity: sceneAlpha.value,
    transform: [{ translateY: sceneY.value }],
  }))

  const handleTapLeft = useCallback(() => {
    void triggerHaptic('selection')
    setActiveIdx((i) => (i - 1 + total) % Math.max(1, total))
  }, [total])
  const handleTapRight = useCallback(() => {
    void triggerHaptic('selection')
    setActiveIdx((i) => (i + 1) % Math.max(1, total))
  }, [total])

  if (total === 0) {
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
              TODO EN ORDEN
            </Text>
          </View>
        </RiseRow>
        <RuleScale color={theme.colors.text} delay={80} />
        <RiseRow delay={160}>
          <View style={styles.emptyRow}>
            <MaterialIcons name="check-circle" size={20} color={palette.success} />
            <Text style={[styles.emptyText, { color: theme.colors.text }]}>
              Sin avisos esta semana.
            </Text>
          </View>
        </RiseRow>
      </View>
    )
  }

  const item = items[activeIdx]
  if (!item) return null

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
            AVISOS
          </Text>
          <Text style={[styles.headerCount, { color: theme.colors.textMuted }]}>
            {activeIdx + 1} / {total}
          </Text>
        </View>
      </RiseRow>

      <RuleScale color={theme.colors.text} delay={80} />

      <View style={styles.stageWrap}>
        <Animated.View style={[styles.stage, sceneStyle]}>
          <Text style={[styles.itemLabel, { color: item.accent }]}>
            {item.label}
          </Text>
          <View style={styles.itemTitleRow}>
            {item.kind === 'signal' ? (
              <MaterialIcons
                name={item.icon}
                size={20}
                color={item.accent}
              />
            ) : null}
            <Text
              style={[styles.itemTitle, { color: theme.colors.text }]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            {item.kind === 'hike' ? (
              <Text style={[styles.itemDelta, { color: item.accent }]}>
                {item.delta}
              </Text>
            ) : null}
          </View>
          <Text
            style={[styles.itemBody, { color: theme.colors.textMuted }]}
            numberOfLines={3}
          >
            {item.body}
          </Text>
        </Animated.View>

        {/* Tap zones */}
        {total > 1 ? (
          <View style={styles.tapZones} pointerEvents="box-none">
            <Pressable
              onPress={handleTapLeft}
              accessibilityLabel="Aviso anterior"
              style={styles.tapZoneLeft}
            />
            <Pressable
              onPress={handleTapRight}
              accessibilityLabel="Siguiente aviso"
              style={styles.tapZoneRight}
            />
          </View>
        ) : null}
      </View>

      {/* Progress dots */}
      {total > 1 ? (
        <View style={styles.dotsRow}>
          {items.map((_, idx) => (
            <ProgressDot
              key={idx}
              index={idx}
              activeIdx={activeIdx}
              progress={progress}
              activeColor={item.accent}
              mutedColor={
                theme.isDark ? 'rgba(242,234,211,0.22)' : 'rgba(18,33,26,0.18)'
              }
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

function ProgressDot({
  index,
  activeIdx,
  progress,
  activeColor,
  mutedColor,
}: {
  index: number
  activeIdx: number
  progress: SharedValue<number>
  activeColor: string
  mutedColor: string
}) {
  const style = useAnimatedStyle(() => {
    let pct: number
    if (index < activeIdx) pct = 1
    else if (index === activeIdx) pct = progress.value
    else pct = 0
    return {
      width: `${Math.max(8, pct * 100)}%`,
    }
  })

  return (
    <View style={[styles.dotTrack, { backgroundColor: mutedColor }]}>
      <Animated.View
        style={[styles.dotFill, { backgroundColor: activeColor }, style]}
      />
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
  headerCount: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  emptyRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  stageWrap: {
    position: 'relative',
    minHeight: 100,
    marginBottom: 12,
  },
  stage: {
    gap: 6,
  },
  itemLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 26,
  },
  itemDelta: {
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  itemBody: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  tapZones: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  tapZoneLeft: { width: '33%', height: '100%' },
  tapZoneRight: { flex: 1, height: '100%' },
  dotsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  dotTrack: {
    flex: 1,
    height: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  dotFill: {
    height: '100%',
    borderRadius: 999,
  },
})
