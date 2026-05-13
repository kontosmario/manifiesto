import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import { RiseRow } from './smart-alerts-helpers'
import { buildTabBuckets, type TabId } from './tabs-helpers'
import type { HeroState } from './hero-states'

interface TabsBigCountsLiveProps {
  state: HeroState
}

/**
 * Variant C · Big count segments. Re-pesa la jerarquía visual: el
 * COUNT pasa a ser el dato dominante (24pt 900) y el label es eyebrow
 * tiny abajo. Filas de 3 columnas (Todos / Pendientes / Pagados) +
 * dot color por columna. Activa se highlights con scale spring +
 * color del count que cambia a accent.
 *
 * Aporta señal: viendo de un vistazo "10 / 5 / 5" entendés la
 * composición del ciclo sin leer labels. Reduce friction cognitive.
 */
export function TabsBigCountsLive({ state }: TabsBigCountsLiveProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const reduced = useReducedMotion()
  const [active, setActive] = useState<TabId>('todos')

  const buckets = buildTabBuckets(state).filter((b) => b.id !== 'zombis')

  const handlePress = useCallback((id: TabId) => {
    void triggerHaptic('selection')
    setActive(id)
  }, [])

  const colorFor = (id: TabId): string => {
    if (id === 'pagados') return palette.success
    if (id === 'pendientes') {
      return state.cantidadVencidos > 0 ? palette.urgency : palette.barMid
    }
    return theme.colors.text
  }

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
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
          MOSTRAR
        </Text>
      </RiseRow>
      <View
        style={[styles.rule, { backgroundColor: theme.colors.text }]}
      />
      <View style={styles.row}>
        {buckets.map((b) => (
          <BigCountColumn
            key={b.id}
            bucket={b}
            active={active === b.id}
            color={colorFor(b.id)}
            onPress={() => handlePress(b.id)}
            reduced={reduced}
            textColor={theme.colors.text}
            textMuted={theme.colors.textMuted}
            isFirst={b.id === buckets[0].id}
            divider={theme.colors.line}
          />
        ))}
      </View>
    </View>
  )
}

function BigCountColumn({
  bucket,
  active,
  color,
  onPress,
  reduced,
  textColor,
  textMuted,
  isFirst,
  divider,
}: {
  bucket: { id: TabId; label: string; count: number }
  active: boolean
  color: string
  onPress: () => void
  reduced: boolean
  textColor: string
  textMuted: string
  isFirst: boolean
  divider: string
}) {
  const scale = useSharedValue(active ? 1.04 : 1)
  if (!reduced) {
    scale.value = withSpring(active ? 1.04 : 1, {
      damping: 14,
      stiffness: 200,
      mass: 0.7,
    })
  }

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  return (
    <Pressable
      onPress={onPress}
      style={styles.colPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${bucket.label}, ${bucket.count} ítems`}
    >
      {!isFirst ? <View style={[styles.colDivider, { backgroundColor: divider }]} /> : null}
      <Animated.View style={[styles.col, style]}>
        <Text
          style={[
            styles.count,
            {
              color: active ? color : textColor,
              opacity: active ? 1 : 0.55,
            },
          ]}
        >
          {bucket.count}
        </Text>
        <Text
          style={[
            styles.label,
            {
              color: active ? color : textMuted,
              fontWeight: active ? '800' : '600',
            },
          ]}
        >
          {bucket.label.toUpperCase()}
        </Text>
      </Animated.View>
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
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  rule: {
    width: 28,
    height: 2,
    marginTop: 10,
    marginBottom: 16,
    opacity: 0.55,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colPress: {
    flex: 1,
    flexDirection: 'row',
  },
  col: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  colDivider: {
    width: 1,
    alignSelf: 'stretch',
    opacity: 0.45,
  },
  count: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
    lineHeight: 32,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.4,
    marginTop: 4,
  },
})
