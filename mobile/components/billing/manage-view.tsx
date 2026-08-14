import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { MaterialIcons } from '@expo/vector-icons'
import { RiseView } from '@/components/home/animated/rise-view'
import { BrandLockup } from '@/components/billing/brand-lockup'
import { MembershipHero } from '@/components/billing/membership-hero'
import { SubscriptionDetailRows } from '@/components/billing/subscription-detail-rows'
import { HouseholdMembersList } from '@/components/billing/household-members-list'
import { MembershipActions } from '@/components/billing/membership-actions'
import {
  BillingLink,
  BillingLinkSeparator,
  useWellStyle,
} from '@/components/billing/billing-neo-kit'
import {
  membershipVariant,
  formatDate,
} from '@/features/billing/membership-state'
import { useHouseholdInitials } from '@/features/billing/use-household-initials'
import { BILLING_PLANS, type BillingPlanId } from '@/features/billing/billing-plans'
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/lib/legal-urls'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
import type { EntitlementSnapshot } from '@/features/billing/entitlement-snapshot'

/**
 * "Mi suscripción" — lo que ve un suscriptor activo (Estado B). Hero de
 * membresía + info esencial + acciones, en el material neumórfico del
 * rediseño (el mismo que ya usan Ajustes y el paywall). Compone las hojas;
 * la lógica de variante por estado vive en membership-state.ts.
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
  const mode = useThemeTokens().mode
  const neo = neoTokens(mode)
  const ink = neoInk(mode)
  const well = useWellStyle('insetSm')
  const { t } = useTranslation()
  const variant = membershipVariant(snap)
  // MVP (super cuenta) no tiene sub: ocultamos renovación/precio/auto-renovación.
  const isMvp = snap.source === 'mvp'
  const { initials } = useHouseholdInitials(familyId)
  const plan =
    snap.plan === 'yearly'
      ? BILLING_PLANS['hogar-anual']
      : BILLING_PLANS['hogar-mensual']
  const priceLabel = t('billing:priceLabel', {
    amount: plan.priceUsd.toFixed(2),
    period:
      plan.cycle === 'yearly'
        ? t('billing:period.year')
        : t('billing:period.month'),
  })

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
            style={[styles.pending, well]}
          >
            <MaterialIcons color={ink.accent} name="schedule" size={17} />
            <Text style={[styles.pendingText, { color: neo.text }]}>
              {renewDateLabel === '—'
                ? t('billing:manage.pendingChangeNextRenewal', {
                    plan: pendingPlanName,
                  })
                : t('billing:manage.pendingChangeOnDate', {
                    plan: pendingPlanName,
                    date: renewDateLabel,
                  })}
            </Text>
          </View>
        </RiseView>
      ) : null}
      {!isMvp ? (
        <RiseView delay={80}>
          <SubscriptionDetailRows
            autoRenew={snap.autoRenew}
            initials={initials}
            memberCap={snap.memberCap}
            memberCount={snap.memberCount}
            priceLabel={variant.canManage ? priceLabel : undefined}
            renewValue={formatDate(snap.expiresAt)}
          />
        </RiseView>
      ) : null}
      <RiseView delay={100}>
        <HouseholdMembersList familyId={familyId} />
      </RiseView>
      <RiseView delay={120}>
        <MembershipActions
          onChangePlan={onChangePlan}
          onRestore={onRestore}
          variant={variant}
        />
      </RiseView>
      <RiseView delay={160}>
        <View style={styles.footer}>
          <BillingLink
            accessibilityLabel={t('billing:manage.termsA11y')}
            label={t('billing:manage.terms')}
            onPress={() => {
              void Linking.openURL(TERMS_OF_SERVICE_URL)
            }}
          />
          <BillingLinkSeparator />
          <BillingLink
            accessibilityLabel={t('billing:manage.privacyA11y')}
            label={t('billing:manage.privacy')}
            onPress={() => {
              void Linking.openURL(PRIVACY_POLICY_URL)
            }}
          />
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
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: neoRadii.tile,
  },
  pendingText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
})
