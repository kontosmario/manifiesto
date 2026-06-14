import { memo, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/theme/theme-provider'
import { getStateTokens } from '@/theme/state-tokens'
import { RiseView } from '@/components/home/animated/rise-view'
import { AppButton } from '@/components/ui/button'
import { BrandLockup } from '@/components/billing/brand-lockup'
import { PlanTiles } from '@/components/billing/plan-tiles'
import { SavingsRibbon } from '@/components/billing/savings-ribbon'
import { FreePeriodBanner } from '@/components/billing/free-period-banner'
import {
  BILLING_PLANS,
  type BillingPlan,
  type BillingPlanId,
} from '@/features/billing/billing-plans'
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/lib/legal-urls'
import type { EntitlementSnapshot } from '@/features/billing/entitlement-snapshot'

/**
 * Paywall (Estado A). Lo ven los no-suscriptos. Si están en período libre
 * (source==='trial') muestra el banner "Acceso completo · N días" — NUNCA
 * lenguaje de "prueba/gratis" en el CTA (el botón cobra de inmediato; no hay
 * intro offer de StoreKit que disclosear). `lockMode` = gate de bloqueo.
 */
export interface PaywallViewProps {
  snap: EntitlementSnapshot
  lockMode?: boolean
  isPurchasing: boolean
  onPurchase: (plan: BillingPlan) => void
  onRestore: () => void
  productPrices?: Record<string, string>
}

export const PaywallView = memo(function PaywallView({
  snap,
  lockMode = false,
  isPurchasing,
  onPurchase,
  onRestore,
  productPrices,
}: PaywallViewProps) {
  const { theme } = useAppTheme()
  const [selected, setSelected] = useState<BillingPlanId>('hogar-anual')
  const plan = BILLING_PLANS[selected]
  const priceText = `$${plan.priceUsd.toFixed(2)}${plan.cycle === 'yearly' ? '/año' : '/mes'}`
  const inFreePeriod = snap.source === 'trial' && snap.daysLeft != null
  const caution = getStateTokens('caution', theme)
  const linkStyle = [theme.typography.caption, { color: theme.colors.textMuted }]

  return (
    <View style={styles.root}>
      {lockMode ? (
        <RiseView delay={0}>
          <View style={[styles.lockChip, { backgroundColor: caution.bg }]}>
            <MaterialIcons name="lock" size={12} color={caution.fg} />
            <Text style={[styles.lockText, { color: caution.fg }]}>
              ACCESO PAUSADO
            </Text>
          </View>
        </RiseView>
      ) : null}

      {inFreePeriod ? (
        <RiseView delay={20}>
          <FreePeriodBanner daysLeft={snap.daysLeft as number} />
        </RiseView>
      ) : null}

      <RiseView delay={40}>
        <BrandLockup />
      </RiseView>

      <RiseView delay={60}>
        <Text style={[styles.headline, { color: theme.colors.text }]}>
          {lockMode ? 'Tu mes gratis\nterminó.' : 'Todo tu hogar,\nen una cuenta.'}
        </Text>
      </RiseView>

      <RiseView delay={80}>
        <PlanTiles
          selected={selected}
          onSelect={setSelected}
          productPrices={productPrices}
        />
      </RiseView>

      <RiseView delay={100}>
        <SavingsRibbon
          savingsUsd={plan.savingsUsd}
          savingsPercent={plan.savingsPercent}
        />
      </RiseView>

      <RiseView delay={120}>
        <View style={styles.features}>
          {plan.highlights.slice(0, 3).map((h, i) => (
            <View key={i} style={styles.feat}>
              <MaterialIcons name="check" size={14} color={theme.colors.primary} />
              <Text
                style={[theme.typography.bodySmall, { color: theme.colors.text, flex: 1 }]}
              >
                {h}
              </Text>
            </View>
          ))}
        </View>
      </RiseView>

      <RiseView delay={140}>
        <AppButton
          label={`Suscribirme por ${priceText}`}
          variant="primary"
          fullWidth
          loading={isPurchasing}
          onPress={() => onPurchase(plan)}
        />
        <Text style={[theme.typography.caption, styles.micro, { color: theme.colors.textMuted }]}>
          Renovación automática · cancelás cuando quieras
        </Text>
      </RiseView>

      <RiseView delay={160}>
        <View style={styles.footer}>
          <Pressable onPress={onRestore}>
            <Text style={linkStyle}>Restaurar compras</Text>
          </Pressable>
          <Text style={linkStyle}> · </Text>
          <Pressable onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}>
            <Text style={linkStyle}>Términos</Text>
          </Pressable>
          <Text style={linkStyle}> · </Text>
          <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
            <Text style={linkStyle}>Privacidad</Text>
          </Pressable>
        </View>
      </RiseView>
    </View>
  )
})

const styles = StyleSheet.create({
  root: { gap: 14 },
  lockChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  lockText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  headline: { fontSize: 23, fontWeight: '900', letterSpacing: -0.9, lineHeight: 26 },
  features: { gap: 7 },
  feat: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  micro: { textAlign: 'center', marginTop: 9 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
  },
})
