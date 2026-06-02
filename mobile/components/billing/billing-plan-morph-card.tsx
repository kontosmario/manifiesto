import { memo, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'
import { BILLING_PLANS, type BillingPlan } from '@/features/billing/billing-plans'
import { BillingPriceDigits } from './billing-price-digits'
import { BillingSavingsRibbon } from './billing-savings-ribbon'

interface BillingPlanMorphCardProps {
  plan: BillingPlan
  isCurrentPlan: boolean
}

const STAGGER_MS = 35

// Annual-only highlights are those present in 'hogar-anual' but not in 'hogar-mensual'.
const _monthly = BILLING_PLANS['hogar-mensual']
const _annual = BILLING_PLANS['hogar-anual']
const ANNUAL_ONLY_SET: ReadonlySet<string> = new Set(
  _annual.highlights.filter((h) => !(_monthly.highlights as readonly string[]).includes(h)),
)

export const BillingPlanMorphCard = memo(function BillingPlanMorphCard({
  plan,
  isCurrentPlan,
}: BillingPlanMorphCardProps) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const isAnnual = plan.cycle === 'yearly'

  const gradientColors = useMemo<readonly [string, string]>(() => {
    return theme.isDark
      ? [theme.colors.surfaceMuted, theme.colors.surfaceMuted]
      : [theme.colors.creamCard, theme.colors.creamSoft]
  }, [theme])

  const cycleSuffix = isAnnual ? '/año' : '/mes'
  const memberCapCopy = plan.memberCap === 4 ? 'Suma a abuelos o hijos.' : 'Para ti y una persona más.'

  const fade = (delayMs: number) =>
    reduced ? undefined : FadeInDown.duration(220).delay(delayMs)
  const headerFade = reduced ? undefined : FadeIn.duration(200)

  return (
    <View style={[styles.card, { borderColor: theme.colors.line }]}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {isCurrentPlan ? (
        <View style={[styles.currentBadge, { backgroundColor: theme.colors.primary }]}>
          <Text style={styles.currentBadgeText}>TU PLAN</Text>
        </View>
      ) : null}

      {/* Header */}
      <Animated.View key={`header-${plan.id}`} entering={headerFade} style={styles.header}>
        <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
          {plan.name}
        </Text>
        <Text style={[styles.tagline, { color: theme.colors.textMuted }]} numberOfLines={2}>
          {plan.tagline}
        </Text>
      </Animated.View>

      {/* Price block */}
      <View style={styles.priceBlock}>
        <Text style={[styles.currency, { color: theme.colors.textMuted }]}>USD</Text>
        <View style={styles.priceLine}>
          <BillingPriceDigits
            value={plan.priceUsd}
            fractionDigits={2}
            digitStyle={{
              fontSize: 64,
              fontWeight: '900',
              color: theme.colors.text,
              letterSpacing: -2.4,
              fontVariant: ['tabular-nums'],
              lineHeight: 70,
            }}
            separator=","
            separatorStyle={{
              fontSize: 36,
              fontWeight: '900',
              color: theme.colors.text,
              lineHeight: 70,
            }}
            accessibilityLabel={`USD ${plan.priceUsd.toFixed(2)} ${isAnnual ? 'al año' : 'al mes'}`}
          />
          <Text style={[styles.suffix, { color: theme.colors.textMuted }]}>{cycleSuffix}</Text>
        </View>
        {plan.effectiveCopy ? (
          <Animated.Text
            key={`eff-${plan.id}`}
            entering={headerFade}
            style={[styles.effective, { color: theme.colors.textMuted }]}
          >
            {plan.effectiveCopy}
          </Animated.Text>
        ) : null}
      </View>

      {/* Savings ribbon */}
      <BillingSavingsRibbon
        visible={isAnnual && plan.savingsUsd > 0}
        savingsUsd={plan.savingsUsd}
        effectiveCopy={undefined}
      />

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: theme.colors.line }]} />

      {/* Member cap */}
      <Animated.View key={`cap-${plan.id}`} entering={headerFade} style={styles.capRow}>
        <MaterialIcons name="group" size={16} color={theme.colors.primary} />
        <Text style={[styles.capText, { color: theme.colors.text }]} numberOfLines={1}>
          Hasta {plan.memberCap} personas
        </Text>
        <Text style={[styles.capSub, { color: theme.colors.textMuted }]}> · {memberCapCopy}</Text>
      </Animated.View>

      {/* Eyebrow */}
      <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>QUÉ INCLUYE</Text>

      {/* Features */}
      <View style={styles.features}>
        {plan.highlights.map((feature, idx) => {
          const exclusive = isAnnual && ANNUAL_ONLY_SET.has(feature)
          return (
            <Animated.View
              key={`${plan.id}-${feature}`}
              entering={fade(idx * STAGGER_MS)}
              style={styles.featureRow}
            >
              <MaterialIcons
                name={exclusive ? 'star' : 'check-circle'}
                size={16}
                color={theme.colors.primary}
              />
              <Text style={[styles.featureText, { color: theme.colors.text }]}>{feature}</Text>
            </Animated.View>
          )
        })}
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 14,
    overflow: 'hidden',
    shadowColor: '#0F2D06',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
  },
  currentBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    zIndex: 1,
  },
  currentBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#0F2D06',
    letterSpacing: 0.6,
  },
  header: {
    gap: 4,
    paddingRight: 64, // leave room for the "TU PLAN" badge
  },
  name: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  tagline: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  priceBlock: {
    gap: 2,
  },
  currency: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  suffix: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.1,
    marginBottom: 8,
  },
  effective: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  capRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  capText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.1,
    flexShrink: 0,
  },
  capSub: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  features: {
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    letterSpacing: -0.05,
  },
})
