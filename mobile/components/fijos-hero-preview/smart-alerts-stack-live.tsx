import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionEasings } from '@/lib/motion/tokens'
import { formatMoney } from '@/utils/money'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import { RiseRow, RuleScale } from './smart-alerts-helpers'
import type { HeroState } from './hero-states'

const ENTER = motionEasings.enterSmooth

interface SmartAlertsStackLiveProps {
  state: HeroState
}

/**
 * Variant B · Stack of notes. Cada alerta es una "nota" (rectángulo
 * con tinte sutil) apilada con leve rotación + offset Y. La de arriba
 * es la más urgente. Animation de entrada: las notas hacen un "fan"
 * (spread) saliendo desde el centro con stagger 100ms, settle a su
 * posición final con un spring pequeño. Cero emojis, sin chip-soup.
 */
export function SmartAlertsStackLive({ state }: SmartAlertsStackLiveProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)

  const items: NoteItem[] = [
    ...state.alerts.hikes.map((h) => ({
      kind: 'hike' as const,
      id: h.id,
      title: h.name,
      body: `${formatMoney(h.previousPrice)} → ${formatMoney(h.currentPrice)}`,
      delta: `+${h.deltaPct}%`,
      accent: palette.urgency,
    })),
    ...state.alerts.signals.map((s) => ({
      kind: 'signal' as const,
      id: s.id,
      title: s.title,
      body: s.body,
      signalKind: s.kind,
      accent:
        s.kind === 'streak'
          ? palette.success
          : s.urgency === 'alta'
          ? palette.urgencyStrong
          : palette.urgency,
    })),
  ]

  const total = items.length

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
            {total === 0 ? 'TODO EN ORDEN' : 'NOTAS DE LA SEMANA'}
          </Text>
          <Text style={[styles.headerCount, { color: theme.colors.textMuted }]}>
            {total === 0
              ? 'sin novedades'
              : `${total} ${total === 1 ? 'nota' : 'notas'}`}
          </Text>
        </View>
      </RiseRow>

      <RuleScale color={theme.colors.text} delay={80} />

      {total === 0 ? (
        <RiseRow delay={160}>
          <View style={styles.emptyRow}>
            <MaterialIcons name="check-circle" size={20} color={palette.success} />
            <Text style={[styles.emptyText, { color: theme.colors.text }]}>
              Sin notas pendientes. Tus fijos están estables.
            </Text>
          </View>
        </RiseRow>
      ) : (
        <View style={[styles.stack, { minHeight: 84 + (total - 1) * 26 }]}>
          {items.map((item, idx) => (
            <Note
              key={item.id}
              item={item}
              index={idx}
              total={total}
            />
          ))}
        </View>
      )}
    </View>
  )
}

type NoteItem =
  | {
      kind: 'hike'
      id: string
      title: string
      body: string
      delta: string
      accent: string
    }
  | {
      kind: 'signal'
      id: string
      title: string
      body: string
      signalKind: HeroState['alerts']['signals'][number]['kind']
      accent: string
    }

function Note({
  item,
  index,
  total,
}: {
  item: NoteItem
  index: number
  total: number
}) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const press = usePressScale({ pressedScale: 0.98 })

  // Stack visual: la más urgente (index 0) está al frente y abajo.
  // Las siguientes están detrás con offset Y negativo + rotation +/-.
  const finalOffsetY = index * 26 // cada nota se ofrece 26pt abajo de la anterior
  const finalRotation = index % 2 === 0 ? -0.8 : 0.8 // alternating tilt
  const targetScale = 1 - index * 0.015

  const y = useSharedValue(reduced ? finalOffsetY : -10)
  const rotation = useSharedValue(reduced ? finalRotation : 0)
  const opacity = useSharedValue(reduced ? 1 : 0)
  const scale = useSharedValue(reduced ? targetScale : 0.94)

  useEffect(() => {
    if (reduced) return
    const delay = 160 + index * 110
    opacity.value = withDelay(delay, withTiming(1, { duration: 360, easing: ENTER }))
    y.value = withDelay(
      delay,
      withSpring(finalOffsetY, { damping: 14, stiffness: 200, mass: 0.7 }),
    )
    rotation.value = withDelay(
      delay,
      withSpring(finalRotation, { damping: 18, stiffness: 200, mass: 0.7 }),
    )
    scale.value = withDelay(
      delay,
      withSpring(targetScale, { damping: 16, stiffness: 200, mass: 0.7 }),
    )
    return () => {
      cancelAnimation(y)
      cancelAnimation(rotation)
      cancelAnimation(opacity)
      cancelAnimation(scale)
    }
  }, [reduced, finalOffsetY, finalRotation, targetScale, index, y, rotation, opacity, scale])

  const noteStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: y.value },
      { rotate: `${rotation.value}deg` },
      { scale: scale.value },
    ],
  }))

  return (
    <Animated.View
      style={[
        styles.noteAbs,
        {
          zIndex: total - index,
          // Tint border based on alert accent
          borderColor: theme.isDark
            ? 'rgba(242,234,211,0.22)'
            : 'rgba(18,33,26,0.12)',
          backgroundColor: theme.isDark ? '#3A4640' : '#FFFDF6',
        },
        noteStyle,
      ]}
    >
      <Pressable
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}: ${item.body}`}
      >
        <Animated.View style={[styles.noteContent, press.animatedStyle]}>
          <View style={[styles.noteStripe, { backgroundColor: item.accent }]} />
          <View style={styles.noteBody}>
            <View style={styles.noteTopRow}>
              <Text style={[styles.noteLabel, { color: item.accent }]}>
                {labelFor(item)}
              </Text>
              {item.kind === 'hike' ? (
                <Text style={[styles.noteDelta, { color: item.accent }]}>
                  {item.delta}
                </Text>
              ) : null}
            </View>
            <Text
              style={[styles.noteTitle, { color: theme.colors.text }]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text
              style={[styles.noteText, { color: theme.colors.textMuted }]}
              numberOfLines={2}
            >
              {item.body}
            </Text>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

function labelFor(item: NoteItem): string {
  if (item.kind === 'hike') return 'PRECIO SUBIÓ'
  if (item.signalKind === 'streak') return 'LOGRO'
  if (item.signalKind === 'stress-week') return 'SEMANA CARGADA'
  if (item.signalKind === 'fijos-ratio') return 'RATIO ALTO'
  return 'TENDENCIA'
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
    overflow: 'hidden',
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
    fontWeight: '600',
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
  stack: {
    position: 'relative',
  },
  noteAbs: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  noteContent: {
    flexDirection: 'row',
    minHeight: 80,
  },
  noteStripe: {
    width: 4,
  },
  noteBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  noteTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  noteLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  noteDelta: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  noteTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  noteText: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 15,
  },
})
