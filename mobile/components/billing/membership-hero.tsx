import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { NeoSurface } from '@/components/ui/neo-surface'
import {
  BillingStatusChip,
  useRaisedFallback,
} from '@/components/billing/billing-neo-kit'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
import type { MembershipVariant } from '@/features/billing/membership-state'

/**
 * Hero de "Mi suscripción": card protagonista del vocabulario neumórfico
 * (`raisedXl`, la receta 10/22 con línea de luz superior) al radio de card.
 * El estado lo lleva el chip hundido y el `heroLine` matiza la nuance
 * (renovación / grace / cortesía / miembro cubierto).
 */
export interface MembershipHeroProps {
  planName: string
  variant: MembershipVariant
}

export const MembershipHero = memo(function MembershipHero({
  planName,
  variant,
}: MembershipHeroProps) {
  const neo = neoTokens(useThemeTokens().mode)
  const { t } = useTranslation()
  const flatFallback = useRaisedFallback()

  return (
    <NeoSurface
      radius={neoRadii.card}
      style={[styles.card, flatFallback]}
      variant="raisedXl"
    >
      <View style={styles.headerRow}>
        <Text style={[styles.eyebrow, { color: neo.textMuted }]}>
          {t('billing:membershipHero.eyebrow')}
        </Text>
        <BillingStatusChip label={variant.statusLabel} tone={variant.tone} />
      </View>

      <Text style={[styles.planName, { color: neo.text }]}>{planName}</Text>
      <Text style={[styles.heroLine, { color: neo.textMuted }]}>
        {variant.heroLine}
      </Text>
    </NeoSurface>
  )
})

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  eyebrow: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  planName: {
    fontSize: 24,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.6,
    marginTop: 12,
  },
  heroLine: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginTop: 3,
  },
})
