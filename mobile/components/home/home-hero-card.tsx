import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
import { ShineOverlay } from '@/components/home/animated/shine-overlay'
import { HeroAurora } from '@/components/home/hero-aurora'
import type { HomeHeroMetrics } from '@/features/home/use-home-metrics'
import { formatMoney, formatMoneyShort } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

interface HomeHeroCardProps {
  data: HomeHeroMetrics
}

/**
 * Redesigned Home hero. Same visual language as FijosHeroCard — gradient
 * shell, diagonal shine, breathing status dot, CountUpText for money.
 * The two side tiles split the single "available today" figure into
 * "podés gastar por día" (accent) and "vas a cerrar con" (neutral).
 */
export function HomeHeroCard({ data }: HomeHeroCardProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const projPositive = data.projectedClose >= 0
  const projColor = projPositive ? theme.colors.heroAccent : '#F2B58A'

  // Day chip swaps to a warning state when the user hasn't confirmed
  // their cobro after payday. The neutral "día N de M" copy is
  // replaced by either "Cobrá hoy" (payday is today) or "+N {día/días}
  // sin cobrar" with a warm peach tint. The chip is informational
  // only — taps live on the FamilyStrip pill — so it pulses gently
  // to communicate the warning without inviting interaction.
  const dayChipLabel = data.paydayPending
    ? data.paydayDaysOverdue <= 0
      ? 'Cobrá hoy'
      : `+${data.paydayDaysOverdue} ${data.paydayDaysOverdue === 1 ? 'día' : 'días'} sin cobrar`
    : `día ${data.cycleDay} de ${data.cycleTotalDays}`

  // Subtle scale pulse for the warning chip. Only animates when
  // pending; gets parked at 1 with reduced motion. Layout-safe
  // because we transform via scale (no width/height changes).
  const pulseScale = useSharedValue(1)
  useEffect(() => {
    if (!data.paydayPending || reduceMotion) {
      pulseScale.value = 1
      return
    }
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    )
  }, [data.paydayPending, reduceMotion, pulseScale])
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }))

  return (
    <RiseView delay={60}>
      <LinearGradient
        colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.card, { borderColor: 'rgba(199,238,156,0.12)' }]}
      >
        <HeroAurora radius={24} />
        <ShineOverlay
          width={430}
          height={320}
          tint={theme.colors.shineOverlay}
          delayMs={1000}
          periodMs={4200}
        />

        <RiseView>
          {/*
            Top row: label on the left, compact day-counter chip on
            the right (mirrors the GastosHeroCard pattern). The
            cycle-month range was dropped — it added noise without
            any decision-making value; users navigate to "Insights"
            for the full cycle context.
          */}
          <View style={styles.labelRow}>
            <View style={styles.labelLeft}>
              <BreatheDot
                size={8}
                color={theme.colors.heroAccent}
                glow={theme.colors.heroAccent}
              />
              <Text style={[styles.label, { color: theme.colors.heroAccent }]}>
                Disponible hoy
              </Text>
            </View>
            {data.paydayPending ? (
              // Warning chip — peach tint, breathing dot, slow scale
              // pulse. Read-only by design: tap-to-confirm lives on
              // the FamilyStrip pill so we don't double up on
              // interactive surfaces in the same row.
              <Animated.View
                accessibilityRole="text"
                accessibilityLabel={dayChipLabel}
                style={[
                  styles.dayChip,
                  styles.dayChipPending,
                  {
                    backgroundColor: 'rgba(232,151,106,0.18)',
                    borderColor: 'rgba(232,151,106,0.55)',
                  },
                  pulseStyle,
                ]}
              >
                <BreatheDot size={6} color="#F2B58A" glow="#F2B58A" />
                <Text style={[styles.dayChipText, { color: '#F2B58A' }]}>
                  {dayChipLabel}
                </Text>
              </Animated.View>
            ) : (
              <View
                style={[
                  styles.dayChip,
                  {
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    borderColor: 'rgba(255,255,255,0.12)',
                  },
                ]}
              >
                <Text style={[styles.dayChipText, { color: theme.colors.heroMuted }]}>
                  {dayChipLabel}
                </Text>
              </View>
            )}
          </View>
        </RiseView>

        <RiseView delay={80}>
          <CountUpText
            value={data.availableToday}
            format={(n) => formatMoney(n)}
            style={[
              styles.amount,
              {
                color: theme.colors.heroText,
                // Tighter gap when the override pill is present so the
                // amount/chip read as a single block, otherwise keep
                // the original generous spacing before the tiles.
                marginBottom: data.cycleAdjusted ? 8 : 18,
              },
            ]}
          />
        </RiseView>

        {data.cycleAdjusted ? (
          // Read-only marker — tells the user why the daily cap looks
          // different this cycle. Editing the override only happens
          // via the recurring "Confirmá tu cobro" flow on payday, so
          // there's no tap action here on purpose.
          <RiseView delay={120}>
            <View
              accessibilityRole="text"
              accessibilityLabel="Disponible ajustado para este ciclo"
              style={[
                styles.adjustedChip,
                {
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  borderColor: 'rgba(255,255,255,0.16)',
                },
              ]}
            >
              <Text
                style={[styles.adjustedChipDot, { color: theme.colors.heroAccent }]}
              >
                •
              </Text>
              <Text
                style={[styles.adjustedChipText, { color: theme.colors.heroMuted }]}
              >
                Ajustado para este ciclo
              </Text>
            </View>
          </RiseView>
        ) : null}

        <View style={styles.tilesRow}>
          <RiseView delay={160} style={styles.tileFlex}>
            <View
              style={[
                styles.tile,
                {
                  backgroundColor: 'rgba(199,238,156,0.10)',
                  borderColor: 'rgba(199,238,156,0.22)',
                },
              ]}
            >
              <Text style={[styles.tileLabel, { color: theme.colors.heroAccent }]}>
                Podés gastar por día
              </Text>
              <Text style={[styles.tileValue, { color: theme.colors.heroText }]}>
                {formatMoneyShort(data.dailyBudget)}
              </Text>
              <Text style={[styles.tileSub, { color: theme.colors.heroMuted2 }]}>
                hasta fin de ciclo
              </Text>
            </View>
          </RiseView>

          <RiseView delay={240} style={styles.tileFlex}>
            <View
              style={[
                styles.tile,
                {
                  backgroundColor: 'rgba(246,251,239,0.05)',
                  borderColor: 'rgba(255,255,255,0.08)',
                },
              ]}
            >
              <Text style={[styles.tileLabel, { color: theme.colors.heroMuted2 }]}>
                Vas a cerrar con
              </Text>
              <Text style={[styles.tileValue, { color: projColor }]}>
                {projPositive ? '+' : ''}
                {formatMoneyShort(data.projectedClose)}
              </Text>
              <Text style={[styles.tileSub, { color: theme.colors.heroMuted2 }]}>
                si seguís este ritmo
              </Text>
            </View>
          </RiseView>
        </View>
      </LinearGradient>
    </RiseView>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    paddingTop: 18,
    overflow: 'hidden',
    borderWidth: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
    zIndex: 2,
  },
  labelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  dayChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  dayChipPending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dayChipText: {
    fontSize: 10,
    fontWeight: '600',
  },
  amount: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1.8,
    lineHeight: 48,
  },
  adjustedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 14,
  },
  adjustedChipDot: {
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 14,
  },
  adjustedChipText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  tilesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tileFlex: { flex: 1 },
  tile: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  tileLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  tileValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tileSub: {
    fontSize: 11,
    marginTop: 3,
  },
})
