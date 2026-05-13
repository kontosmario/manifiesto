import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { triggerHaptic } from '@/lib/haptics'
import { formatMoney } from '@/utils/money'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import { RiseRow, RuleScale, getSignalIcon } from './smart-alerts-helpers'
import type { HeroState } from './hero-states'

interface SmartAlertsPillsLiveProps {
  state: HeroState
}

/**
 * Variant D · Compact pills. Una fila horizontal de pills minimalistas
 * (no cards) con icon glyph + label corto + delta. Tap → expande el
 * detalle inline debajo con animation layout-driven (LinearTransition
 * en Reanimated). Restraint máximo de densidad info.
 *
 * State-aware empty: muestra "TODO EN ORDEN" pill verde inerte.
 */
export function SmartAlertsPillsLive({ state }: SmartAlertsPillsLiveProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  type Pill = {
    id: string
    label: string
    icon:
      | 'trending-up'
      | 'event-busy'
      | 'pie-chart'
      | 'whatshot'
      | 'check-circle'
    accent: string
    chipBg: string
    chipBorder: string
    title: string
    body: string
    delta?: string
  }

  const pills: Pill[] = [
    ...state.alerts.hikes.map((h) => ({
      id: h.id,
      label: h.name,
      icon: 'trending-up' as const,
      accent: palette.urgency,
      chipBg: palette.urgencyBadgeBg,
      chipBorder: palette.urgencyBadgeBorder,
      title: 'Precio subió',
      body: `${formatMoney(h.previousPrice)} → ${formatMoney(h.currentPrice)}`,
      delta: `+${h.deltaPct}%`,
    })),
    ...state.alerts.signals.map((s) => {
      const isPositive = s.kind === 'streak'
      const accent = isPositive
        ? palette.success
        : s.urgency === 'alta'
        ? palette.urgencyStrong
        : palette.urgency
      return {
        id: s.id,
        label: shortLabelForSignal(s.kind),
        icon: getSignalIcon(s.kind),
        accent,
        chipBg: isPositive
          ? palette.successSubtle
          : palette.urgencyBadgeBg,
        chipBorder: isPositive
          ? palette.success
          : palette.urgencyBadgeBorder,
        title: s.title,
        body: s.body,
      }
    }),
  ]

  const handlePillPress = useCallback((id: string) => {
    void triggerHaptic('selection')
    setExpandedId((prev) => (prev === id ? null : id))
  }, [setExpandedId])

  if (pills.length === 0) {
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
          </View>
        </RiseRow>
        <RuleScale color={theme.colors.text} delay={80} />
        <RiseRow delay={160}>
          <View
            style={[
              styles.emptyPill,
              {
                backgroundColor: palette.successSubtle,
                borderColor: palette.success,
              },
            ]}
          >
            <MaterialIcons name="check-circle" size={14} color={palette.success} />
            <Text style={[styles.emptyPillText, { color: palette.success }]}>
              TODO EN ORDEN
            </Text>
          </View>
        </RiseRow>
      </View>
    )
  }

  const expanded = pills.find((p) => p.id === expandedId)

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
            {pills.length} · tap para expandir
          </Text>
        </View>
      </RiseRow>

      <RuleScale color={theme.colors.text} delay={80} />

      <RiseRow delay={160}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsRow}
        >
          {pills.map((pill) => (
            <PillChip
              key={pill.id}
              pill={pill}
              isExpanded={expandedId === pill.id}
              onPress={() => handlePillPress(pill.id)}
            />
          ))}
        </ScrollView>
      </RiseRow>

      {/* Expanded detail */}
      <Animated.View
        layout={LinearTransition.duration(280)}
        style={styles.expandedWrap}
      >
        {expanded ? (
          <View
            style={[
              styles.expandedCard,
              {
                backgroundColor: expanded.chipBg,
                borderColor: expanded.chipBorder,
              },
            ]}
          >
            <View style={styles.expandedRow}>
              <Text style={[styles.expandedTitle, { color: expanded.accent }]}>
                {expanded.title}
              </Text>
              {expanded.delta ? (
                <Text style={[styles.expandedDelta, { color: expanded.accent }]}>
                  {expanded.delta}
                </Text>
              ) : null}
            </View>
            <Text style={[styles.expandedBody, { color: theme.colors.text }]}>
              {expanded.body}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </View>
  )
}

function PillChip({
  pill,
  isExpanded,
  onPress,
}: {
  pill: {
    id: string
    label: string
    icon: 'trending-up' | 'event-busy' | 'pie-chart' | 'whatshot' | 'check-circle'
    accent: string
    chipBg: string
    chipBorder: string
    delta?: string
  }
  isExpanded: boolean
  onPress: () => void
}) {
  const press = usePressScale({ pressedScale: 0.94 })
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`Aviso ${pill.label}${pill.delta ? `, ${pill.delta}` : ''}`}
      accessibilityState={{ expanded: isExpanded }}
    >
      <Animated.View
        style={[
          styles.pill,
          {
            backgroundColor: pill.chipBg,
            borderColor: isExpanded ? pill.accent : pill.chipBorder,
            borderWidth: isExpanded ? 1.5 : 1,
          },
          press.animatedStyle,
        ]}
      >
        <MaterialIcons name={pill.icon} size={12} color={pill.accent} />
        <Text
          style={[styles.pillLabel, { color: pill.accent }]}
          numberOfLines={1}
        >
          {pill.label}
        </Text>
        {pill.delta ? (
          <Text style={[styles.pillDelta, { color: pill.accent }]}>
            {pill.delta}
          </Text>
        ) : null}
      </Animated.View>
    </Pressable>
  )
}

function shortLabelForSignal(kind: HeroState['alerts']['signals'][number]['kind']): string {
  if (kind === 'streak') return 'Logro'
  if (kind === 'stress-week') return 'Semana cargada'
  if (kind === 'fijos-ratio') return 'Ratio alto'
  return 'Tendencia'
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
    fontSize: 10,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  pillsRow: {
    gap: 8,
    paddingRight: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  pillLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
    maxWidth: 140,
  },
  pillDelta: {
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginLeft: 2,
  },
  emptyPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  emptyPillText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  expandedWrap: {
    overflow: 'hidden',
  },
  expandedCard: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  expandedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  expandedTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  expandedDelta: {
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  expandedBody: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
})
