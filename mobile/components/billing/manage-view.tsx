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
import { BILLING_PLANS, type BillingPlanId } from '@/features/billing/billing-plans'
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
  /**
   * Cambio agendado de forma OPTIMISTA por el host (downgrade recién
   * confirmado, antes de que el webhook escriba `pending_product_id`). El
   * server es la fuente de verdad: si trae `pendingProductId`, manda él.
   */
  optimisticPendingPlanId?: BillingPlanId | null
  onChangePlan: () => void
  onRestore: () => void
}

export const ManageView = memo(function ManageView({
  snap,
  familyId,
  optimisticPendingPlanId,
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
  // downgrades). El server lo registra en pending_product_id vía el webhook;
  // hasta que llega, usamos el plan optimista para mostrar el banner al
  // instante. El server, si lo trae, tiene prioridad.
  // Guard: si el pendiente es el plan ACTUAL (p.ej. cancelaste un downgrade
  // volviendo a tu plan), no hay cambio real → no mostramos banner.
  const pendingProductId =
    snap.pendingProductId ??
    (optimisticPendingPlanId
      ? BILLING_PLANS[optimisticPendingPlanId].productId
      : null)
  // El banner de cambio pendiente es del COMPRADOR; un miembro cubierto no lo ve
  // (no puede accionar el cambio de plan del hogar).
  const pendingPlanName =
    variant.canManage && pendingProductId && pendingProductId !== plan.productId
      ? (Object.values(BILLING_PLANS).find(
          (p) => p.productId === pendingProductId,
        )?.name ?? null)
      : null
  // "Cuándo" pasa el cambio: la fecha de renovación (cuando vence el ciclo
  // actual). Da el aviso concreto que el banner antes no comunicaba.
  const renewDateLabel = formatDate(snap.expiresAt)

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
            accessible
            accessibilityRole="text"
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
              {renewDateLabel === '—'
                ? `Cambia a ${pendingPlanName} en tu próxima renovación`
                : `Cambia a ${pendingPlanName} el ${renewDateLabel}`}
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
          priceLabel={variant.canManage ? priceLabel : undefined}
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
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Términos de uso"
            hitSlop={8}
            onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}
          >
            <Text style={linkStyle}>Términos de uso</Text>
          </Pressable>
          <Text style={linkStyle}> · </Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Política de privacidad"
            hitSlop={8}
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
          >
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
