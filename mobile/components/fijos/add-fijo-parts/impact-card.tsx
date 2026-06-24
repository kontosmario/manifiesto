// Cards de "Impacto en el presupuesto" del wizard add-fijo: ImpactRow
// (label + value + delta), ImpactBar (before vs after gradient bar) y
// HealthBadge (alto/medio/sano). Extraído de `add-fijo-v2-screen.tsx`.
import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { useAppTheme } from '@/theme/theme-provider'

interface ImpactRowProps {
  label: string
  value: string
  sub: string
  emphasis?: boolean
  deltaPct?: number
}

export function ImpactRow({
  label,
  value,
  sub,
  emphasis,
  deltaPct,
}: ImpactRowProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.impactRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.impactLabel, { color: theme.colors.textMuted }]}>{label}</Text>
        <Text
          style={[
            styles.impactValue,
            { color: theme.colors.text, fontSize: emphasis ? 22 : 18 },
          ]}
        >
          {value}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.impactSub, { color: theme.colors.textMuted }]}>{sub}</Text>
        {deltaPct != null && deltaPct !== 0 ? (
          <Text
            style={[
              styles.impactDelta,
              {
                color: theme.isDark
                  ? deltaPct > 0
                    ? '#F8D1C3'  // V1 accent-200
                    : '#A6EF8F'  // V1 primary-300
                  : deltaPct > 0
                    ? '#B84014'  // V1 accent-600
                    : '#297811',  // V1 primary-800
              },
            ]}
          >
            {deltaPct > 0 ? '+' : ''}
            {deltaPct}pp
          </Text>
        ) : null}
      </View>
    </View>
  )
}

export function HealthBadge({ pct }: { pct: number }) {
  const { theme } = useAppTheme()
  const tone: 'alto' | 'medio' | 'sano' = pct > 70 ? 'alto' : pct > 50 ? 'medio' : 'sano'
  // V1 health badge palette — alto/medio/sano = high/mid/healthy fijos
  // ratio. AA verified for fg-on-bg en ambos modos.
  const palette = theme.isDark
    ? {
        alto:  { bg: '#5C200A', fg: '#F8D1C3' },  // accent-900 / accent-200
        medio: { bg: '#7C2B0E', fg: '#FCEAE3' },  // accent-800 / accent-100
        sano:  { bg: '#244235', fg: '#A6EF8F' },  // surface-900 / primary-300
      }
    : {
        alto:  { bg: '#F8D1C3', fg: '#5C200A' },  // accent-200 / accent-900 — AAA
        medio: { bg: '#FCEAE3', fg: '#973511' },  // accent-100 / accent-700 — AA
        sano:  { bg: '#EAFBE4', fg: '#297811' },  // primary-100 / primary-800 — AA
      }
  const { bg, fg } = palette[tone]
  const label = tone === 'alto' ? 'Alto' : tone === 'medio' ? 'Medio' : 'Sano'
  return (
    <View style={[styles.healthBadge, { backgroundColor: bg }]}>
      <Text style={[styles.healthBadgeText, { color: fg }]}>{label}</Text>
    </View>
  )
}

export function ImpactBar({
  beforePct,
  afterPct,
}: {
  beforePct: number
  afterPct: number
}) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const clampedBefore = Math.max(0, Math.min(100, beforePct))
  const clampedAfter = Math.max(0, Math.min(100, afterPct))
  const deltaWidth = Math.max(0, clampedAfter - clampedBefore)

  // La barra LLEGA en vez de aparecer pintada: el fill "antes" crece, y el
  // segmento "delta" (lo que agregás) se suma DESPUÉS con un stagger → el ojo
  // ve "esto es lo que sumás". reduceMotion → directo al valor final.
  const beforeProgress = useSharedValue(reduced ? 1 : 0)
  const deltaProgress = useSharedValue(reduced ? 1 : 0)

  useEffect(() => {
    if (reduced) return
    beforeProgress.value = withTiming(1, {
      duration: 520,
      easing: Easing.out(Easing.cubic),
    })
    deltaProgress.value = withDelay(
      120,
      withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
    )
  }, [beforeProgress, deltaProgress, reduced])

  const beforeStyle = useAnimatedStyle(() => ({
    width: `${clampedBefore * beforeProgress.value}%`,
  }))
  const deltaStyle = useAnimatedStyle(() => ({
    width: `${deltaWidth * deltaProgress.value}%`,
  }))

  return (
    <View
      style={[styles.impactBarTrack, { backgroundColor: theme.colors.pageBg }]}
    >
      <Animated.View style={[styles.impactBarFill, beforeStyle]}>
        <LinearGradient
          colors={['#49D61F', '#297811'] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        style={[styles.impactBarFill, { left: `${clampedBefore}%` }, deltaStyle]}
      >
        <LinearGradient
          colors={['#F2A78C', '#EC7A51'] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  impactRow: { flexDirection: 'row', alignItems: 'center' },
  impactLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  impactValue: { fontWeight: '800', letterSpacing: -0.4, marginTop: 2 },
  impactSub: { fontSize: 11, fontWeight: '600' },
  impactDelta: { fontSize: 11, fontWeight: '800', marginTop: 2 },
  impactBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
    position: 'relative',
  },
  impactBarFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 4,
    overflow: 'hidden',
  },
  healthBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  healthBadgeText: { fontSize: 11, fontWeight: '800' },
})
