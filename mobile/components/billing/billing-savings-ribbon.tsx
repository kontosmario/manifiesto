import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInLeft, FadeOutLeft } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'
import { BillingPriceDigits } from './billing-price-digits'

interface BillingSavingsRibbonProps {
  visible: boolean
  savingsUsd: number
  effectiveCopy?: string
}

export const BillingSavingsRibbon = memo(function BillingSavingsRibbon({
  visible,
  savingsUsd,
  effectiveCopy,
}: BillingSavingsRibbonProps) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  if (!visible) return null

  const enter = reduced ? undefined : FadeInLeft.duration(280).springify().damping(16)
  const exit = reduced ? undefined : FadeOutLeft.duration(180)

  return (
    <Animated.View
      entering={enter}
      exiting={exit}
      accessibilityRole="text"
      accessibilityLabel={`Ahorrás USD ${savingsUsd.toFixed(2)} al año${effectiveCopy ? `, ${effectiveCopy}` : ''}`}
      style={[
        styles.ribbon,
        {
          backgroundColor: theme.colors.primarySurface,
          borderColor: theme.colors.primary,
        },
      ]}
    >
      <MaterialIcons name="savings" size={16} color={theme.colors.primary} />
      <View style={styles.body}>
        <View style={styles.savingsLine}>
          <Text style={[styles.lead, { color: theme.colors.text }]}>Ahorrás USD </Text>
          <BillingPriceDigits
            value={savingsUsd}
            fractionDigits={2}
            digitStyle={{
              fontSize: 14,
              fontWeight: '900',
              color: theme.colors.text,
              fontVariant: ['tabular-nums'],
              letterSpacing: -0.2,
            }}
            separatorStyle={{
              fontSize: 14,
              fontWeight: '900',
              color: theme.colors.text,
            }}
            accessibilityLabel={`USD ${savingsUsd.toFixed(2)}`}
          />
          <Text style={[styles.lead, { color: theme.colors.text }]}> al año</Text>
        </View>
        {effectiveCopy ? (
          <Text style={[styles.effective, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {effectiveCopy}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  ribbon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  savingsLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'nowrap',
  },
  lead: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  effective: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.05,
  },
})
