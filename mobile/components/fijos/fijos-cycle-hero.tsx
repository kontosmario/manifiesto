import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  Easing,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
import { ShineOverlay } from '@/components/home/animated/shine-overlay'
import { FijosCycleRing } from '@/components/fijos/fijos-cycle-ring'
import type { FijosCycleSummary } from '@/features/fijos/fijos-aggregates.model'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { formatMoney } from '@/utils/money'

interface FijosCycleHeroProps {
  summary: FijosCycleSummary
  monthlyIncome: number
  freeAfterFijos: number
  pctOfIncome: number
  monthLabel: string
}

/**
 * Hero card for the Fijos screen — dark-green gradient surface with
 * the orbital cycle ring on the left, paid/pending/overdue stats
 * stacked on the right, and a "quedás libre" footer with a mini
 * gradient bar showing the % of monthly income eaten up by fijos.
 */
export function FijosCycleHero({
  summary,
  monthlyIncome,
  freeAfterFijos,
  pctOfIncome,
  monthLabel,
}: FijosCycleHeroProps) {
  return (
    <RiseView delay={100}>
      <Animated.View layout={LinearTransition.duration(260)}>
        <LinearGradient
          colors={['#0F2A1E', '#143B2A'] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <ShineOverlay
            width={430}
            height={320}
            tint="rgba(255,255,255,0.08)"
            delayMs={1000}
            periodMs={4200}
          />

          <View style={styles.topRow}>
            <Text style={styles.eyebrow}>{`CICLO DE ${monthLabel.toUpperCase()}`}</Text>
            <View style={styles.dayChip}>
              <Text style={styles.dayChipText}>
                día {summary.todayDay} · {summary.daysRemaining}d restantes
              </Text>
            </View>
          </View>

          <View style={styles.ringRow}>
            <View style={styles.ringWrap}>
              <FijosCycleRing
                paidPct={summary.paidPct}
                pendingPct={summary.pendingPct}
                overduePct={summary.overduePct}
                size={180}
                thickness={16}
              />
              <View style={styles.ringCenter} pointerEvents="none">
                <Text style={styles.ringEyebrow}>{`FIJOS · ${monthLabel.toUpperCase()}`}</Text>
                <CountUpText
                  value={summary.total}
                  duration={1200}
                  format={(n) => formatMoney(n)}
                  style={styles.ringAmount}
                />
                <Text style={styles.ringCovered}>
                  <CountPct pct={summary.paidPct} /> cubierto
                </Text>
              </View>
            </View>

            <View style={styles.sideStack}>
              <SideTile
                tint="#C7EE9C"
                icon="✓"
                value={formatShortAmount(summary.paidAmount)}
                label={`${summary.paidItems.length} ${summary.paidItems.length === 1 ? 'pagado' : 'pagados'}`}
              />
              <SideTile
                tint="#F2B58A"
                icon="◷"
                value={
                  summary.daysToNextPayment != null
                    ? `en ${summary.daysToNextPayment}d`
                    : '—'
                }
                label={`${summary.pendingItems.length} ${summary.pendingItems.length === 1 ? 'pendiente' : 'pendientes'}`}
                highlight
              />
              {summary.overdueAmount > 0 ? (
                <SideTile
                  tint="#E88A70"
                  icon="!"
                  value={formatShortAmount(summary.overdueAmount)}
                  label={`${summary.overdueItems.length} vencido${summary.overdueItems.length === 1 ? '' : 's'}`}
                  danger
                />
              ) : null}
            </View>
          </View>

          {monthlyIncome > 0 ? (
            <View style={styles.footer}>
              <View>
                <Text style={styles.footerEyebrow}>QUEDA LIBRE (tras fijos)</Text>
                <Text style={styles.footerAmount}>{formatMoney(freeAfterFijos)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.footerEyebrow}>DE TU SUELDO</Text>
                <Text style={styles.footerPct}>{pctOfIncome}% en fijos</Text>
                <View style={styles.footerBarTrack}>
                  <GrowBar percent={pctOfIncome} />
                </View>
              </View>
            </View>
          ) : null}
        </LinearGradient>
      </Animated.View>
    </RiseView>
  )
}

function CountPct({ pct }: { pct: number }) {
  return <>{`${pct}%`}</>
}

function formatShortAmount(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1000) return `$${Math.round(abs / 1000)}k`
  return `$${Math.round(abs)}`
}

function SideTile({
  tint,
  icon,
  value,
  label,
  highlight,
  danger,
}: {
  tint: string
  icon: string
  value: string
  label: string
  highlight?: boolean
  danger?: boolean
}) {
  const alpha = danger ? 0.2 : highlight ? 0.16 : 0.12
  return (
    <View style={[styles.sideTile, { backgroundColor: hexToRgba(tint, alpha), borderColor: hexToRgba(tint, 0.3) }]}>
      <View style={[styles.sideTileIcon, { backgroundColor: hexToRgba(tint, 0.28) }]}>
        <Text style={[styles.sideTileIconText, { color: tint }]}>{icon}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.sideTileValue} numberOfLines={1}>
          {value}
        </Text>
        <Text style={styles.sideTileLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  )
}

function GrowBar({ percent }: { percent: number }) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    scale.value = withDelay(
      800,
      withTiming(Math.min(1, Math.max(0, percent / 100)), {
        duration: 1000,
        easing: Easing.bezier(0.2, 0.9, 0.2, 1),
      }),
    )
  }, [percent, reduced, scale])
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleX: scale.value }],
    transformOrigin: 'left' as const,
  }))
  return (
    <Animated.View style={[styles.footerBar, style]}>
      <LinearGradient
        colors={['#F2B58A', '#E8976A'] as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  )
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized.split('').map((c) => c + c).join('')
      : normalized
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(199,238,156,0.12)',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 11, letterSpacing: 1.6, fontWeight: '700', color: '#C7EE9C' },
  dayChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  dayChipText: { fontSize: 10, fontWeight: '600', color: 'rgba(246,251,239,0.65)' },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 },
  ringWrap: { width: 180, height: 180, position: 'relative' },
  ringCenter: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringEyebrow: { fontSize: 9, letterSpacing: 1.4, fontWeight: '700', color: 'rgba(246,251,239,0.6)' },
  ringAmount: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 24,
    marginTop: 4,
    color: '#F6FBEF',
  },
  ringCovered: { fontSize: 11, fontWeight: '700', color: '#C7EE9C', marginTop: 4 },
  sideStack: { flex: 1, gap: 8 },
  sideTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  sideTileIcon: { width: 24, height: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  sideTileIconText: { fontSize: 13, fontWeight: '800' },
  sideTileValue: { fontSize: 13, fontWeight: '800', color: '#F6FBEF' },
  sideTileLabel: { fontSize: 10, fontWeight: '600', color: 'rgba(246,251,239,0.65)' },
  footer: {
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(246,251,239,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(246,251,239,0.08)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerEyebrow: { fontSize: 9, letterSpacing: 1.4, fontWeight: '700', color: 'rgba(246,251,239,0.55)' },
  footerAmount: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5, color: '#F6FBEF', marginTop: 2 },
  footerPct: { fontSize: 13, fontWeight: '700', color: '#F2B58A', marginTop: 4 },
  footerBarTrack: {
    marginTop: 4,
    width: 90,
    height: 5,
    backgroundColor: 'rgba(246,251,239,0.12)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  footerBar: { position: 'absolute', inset: 0, borderRadius: 3, overflow: 'hidden' },
})
