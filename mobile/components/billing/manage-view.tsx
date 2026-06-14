import { memo } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/theme/theme-provider'
import { RiseView } from '@/components/home/animated/rise-view'
import { BrandLockup } from '@/components/billing/brand-lockup'
import { MembershipHero } from '@/components/billing/membership-hero'
import { SubscriptionDetailRows } from '@/components/billing/subscription-detail-rows'
import { MembershipActions } from '@/components/billing/membership-actions'
import {
  membershipVariant,
  formatDate,
} from '@/features/billing/membership-state'
import { useHouseholdInitials } from '@/features/billing/use-household-initials'
import { BILLING_PLANS } from '@/features/billing/billing-plans'
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/lib/legal-urls'
import type { EntitlementSnapshot } from '@/features/billing/entitlement-snapshot'

/**
 * "Mi suscripción" — lo que ve un suscriptor activo (Estado B). Hero de
 * membresía + info esencial + acciones. Compone las hojas; la lógica de
 * variante por estado vive en membership-state.ts.
 */
export interface ManageViewProps {
  snap: EntitlementSnapshot
  familyId?: string
  onChangePlan: () => void
  onRestore: () => void
}

export const ManageView = memo(function ManageView({
  snap,
  familyId,
  onChangePlan,
  onRestore,
}: ManageViewProps) {
  const { theme } = useAppTheme()
  const variant = membershipVariant(snap)
  const { initials } = useHouseholdInitials(familyId)
  const plan =
    snap.plan === 'yearly'
      ? BILLING_PLANS['hogar-anual']
      : BILLING_PLANS['hogar-mensual']
  const priceLabel = `$${plan.priceUsd.toFixed(2)} / ${plan.cycle === 'yearly' ? 'año' : 'mes'}`

  // Cambio de plan agendado para la próxima renovación (StoreKit difiere los
  // crossgrades). El server lo registra en pending_product_id vía el webhook.
  const pendingPlanName = snap.pendingProductId
    ? (Object.values(BILLING_PLANS).find(
        (p) => p.productId === snap.pendingProductId,
      )?.name ?? null)
    : null

  const linkStyle = [theme.typography.caption, { color: theme.colors.textMuted }]

  return (
    <View style={styles.root}>
      <RiseView delay={0}>
        <BrandLockup />
      </RiseView>
      <RiseView delay={40}>
        <MembershipHero planName={plan.name} variant={variant} />
      </RiseView>
      {pendingPlanName ? (
        <RiseView delay={60}>
          <View
            style={[
              styles.pending,
              {
                backgroundColor: theme.colors.primarySurface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <MaterialIcons
              name="schedule"
              size={16}
              color={theme.colors.primary}
            />
            <Text
              style={[
                theme.typography.bodySmall,
                { color: theme.colors.text, flex: 1 },
              ]}
            >
              Cambia a {pendingPlanName} en la próxima renovación
            </Text>
          </View>
        </RiseView>
      ) : null}
      <RiseView delay={80}>
        <SubscriptionDetailRows
          renewValue={formatDate(snap.expiresAt)}
          initials={initials}
          memberCount={snap.memberCount}
          memberCap={snap.memberCap}
          autoRenew={snap.autoRenew}
          priceLabel={priceLabel}
        />
      </RiseView>
      <RiseView delay={120}>
        <MembershipActions
          variant={variant}
          onChangePlan={onChangePlan}
          onRestore={onRestore}
        />
      </RiseView>
      <RiseView delay={160}>
        <View style={styles.footer}>
          <Pressable onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}>
            <Text style={linkStyle}>Términos de uso</Text>
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
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 11,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
})
