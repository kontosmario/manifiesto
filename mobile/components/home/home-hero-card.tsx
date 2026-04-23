import { useEffect, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { AnimatedAmount } from '@/components/ui/animated-amount'
import { PaydayPill } from '@/components/home/payday-pill'
import { terms } from '@/lib/copy/glossary'
import { motionDurations, motionEasings } from '@/lib/motion'
import { brand, radii } from '@/theme/palette'
import { typography } from '@/theme/typography'

interface HomeHeroCardProps {
  availableToday: number
  projectedMargin: number
  savedAmount: number
  fixedAmount: number
  cycleProgress?: number | null
  cycleDaysElapsed?: number | null
  cycleTotalDays?: number | null
  daysUntilPayday?: number | null
  isPaydayPending?: boolean
  onPressPaydayConfirm?: () => void
  burnHint?: string | null
}

const currencyFormatter = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 0,
})

export function HomeHeroCard({
  availableToday,
  projectedMargin,
  savedAmount,
  fixedAmount,
  cycleProgress,
  cycleDaysElapsed,
  cycleTotalDays,
  daysUntilPayday,
  isPaydayPending = false,
  onPressPaydayConfirm,
  burnHint,
}: HomeHeroCardProps) {
  const reduceMotion = useReducedMotion()
  const progressValue = useSharedValue(0)
  const target = useMemo(
    () => Math.min(1, Math.max(0, cycleProgress ?? 0)),
    [cycleProgress],
  )

  useEffect(() => {
    if (reduceMotion) {
      progressValue.value = target
      return
    }
    progressValue.value = withDelay(
      160,
      withTiming(target, {
        duration: motionDurations.deliberate,
        easing: motionEasings.decelerate,
      }),
    )
  }, [target, reduceMotion, progressValue])

  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${progressValue.value * 100}%`,
  }))

  const marginSign = projectedMargin >= 0 ? '+' : ''
  const marginText = `${marginSign}$${currencyFormatter.format(Math.abs(Math.round(projectedMargin)))}`
  const hasCycle =
    cycleProgress != null &&
    Number.isFinite(cycleProgress) &&
    cycleDaysElapsed != null &&
    cycleTotalDays != null
  const showPill = isPaydayPending || daysUntilPayday != null

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={[typography.eyebrow, styles.eyebrow]}>Disponible hoy</Text>
        {showPill ? (
          <PaydayPill
            daysUntilPayday={daysUntilPayday ?? null}
            cycleProgress={cycleProgress ?? null}
            isPending={isPaydayPending}
            onPressConfirm={() => onPressPaydayConfirm?.()}
          />
        ) : null}
      </View>

      <AnimatedAmount
        value={availableToday}
        variant="hero"
        hapticOnChange
        color="#FFFFFF"
        style={styles.value}
      />

      {hasCycle ? (
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, progressBarStyle]} />
        </View>
      ) : null}

      <Text style={[typography.bodySmall, styles.context]}>
        {terms.margin} del mes{' '}
        <Text style={[styles.contextEmphasis, { color: brand.bright }]}>{marginText}</Text>
      </Text>

      {burnHint ? (
        <Text
          style={[typography.caption, styles.burn]}
          accessibilityLabel={burnHint}
        >
          {burnHint}
        </Text>
      ) : null}

      <View style={styles.statsRow}>
        <HeroStat label="Ahorro" value={savedAmount} />
        <View style={styles.statDivider} />
        <HeroStat label="Fijos" value={fixedAmount} />
      </View>
    </View>
  )
}

function HeroStat({ label, value }: { label: string; value: number }) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: $${Math.round(value).toLocaleString('es-AR')} del mes`}
      style={styles.stat}
    >
      <Text style={[typography.fieldLabel, styles.statLabel]}>{label}</Text>
      <AnimatedAmount value={value} variant="metricValue" color="#FFFFFF" />
      <Text style={[typography.caption, styles.statSublabel]}>del mes</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: brand.deep,
    borderRadius: radii['2xl'],
    paddingHorizontal: 20,
    paddingVertical: 22,
    shadowColor: brand.deep,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: brand.bright,
  },
  value: {
    marginTop: 4,
    color: '#FFFFFF',
  },
  progressTrack: {
    marginTop: 12,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: brand.bright,
    borderRadius: radii.pill,
  },
  context: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.78)',
  },
  contextEmphasis: {
    fontWeight: '700',
  },
  burn: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.72)',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 20,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
    gap: 16,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  statLabel: {
    color: brand.bright,
  },
  statSublabel: {
    color: 'rgba(255,255,255,0.6)',
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
})
