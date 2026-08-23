import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { NeoButton } from '@/components/ui/neo-button'
import { BillingLink } from '@/components/billing/billing-neo-kit'
import { neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
import { MANAGE_SUBSCRIPTIONS_URL } from '@/lib/legal-urls'
import type { MembershipVariant } from '@/features/billing/membership-state'

/**
 * Acciones de "Mi suscripción". Columna de botones del vocabulario neo +
 * link de restaurar. La variante decide si arriba aparece un CTA primario
 * (reactivar / arreglar pago); "Cambiar de plan" y "Administrar en App Store"
 * están siempre.
 */
export interface MembershipActionsProps {
  variant: MembershipVariant
  onChangePlan(): void
  onRestore(): void
}

// Path compliant: las tiendas exigen que cancelar/gestionar la suscripción
// se haga por el sistema, no dentro de la app. La URL (y por qué hoy es
// SIEMPRE la de Apple, incluso en Android) vive en legal-urls.ts.
const openManage = () => {
  void Linking.openURL(MANAGE_SUBSCRIPTIONS_URL)
}

export const MembershipActions = memo(function MembershipActions({
  variant,
  onChangePlan,
  onRestore,
}: MembershipActionsProps) {
  const neo = neoTokens(useThemeTokens().mode)
  const { t } = useTranslation()

  return (
    <View style={styles.stack}>
      {/* CTA primario contextual según el estado del entitlement. */}
      {variant.primaryAction === 'reactivate' ? (
        <NeoButton
          fullWidth
          label={t('billing:actions.reactivate')}
          onPress={onChangePlan}
          variant="primary"
        />
      ) : variant.primaryAction === 'fixPayment' ? (
        <NeoButton
          fullWidth
          label={t('billing:actions.fixPayment')}
          onPress={openManage}
          variant="primary"
        />
      ) : null}

      {/* Cambiar/administrar SOLO para quien contrató la sub. Un miembro
          cubierto por el hogar (o cortesía) no gestiona un plan ajeno. */}
      {variant.canManage ? (
        <>
          <NeoButton
            fullWidth
            label={t('billing:actions.changePlan')}
            onPress={onChangePlan}
            variant="ghost"
          />
          <NeoButton
            fullWidth
            label={t('billing:actions.manageOrCancel')}
            onPress={openManage}
            variant="ghost"
          />
        </>
      ) : variant.note ? (
        <Text style={[styles.note, { color: neo.text }]}>{variant.note}</Text>
      ) : null}

      {/* Link discreto — recupera compras previas sin volver a pagar. */}
      <BillingLink
        label={t('billing:actions.restorePurchases')}
        onPress={onRestore}
        style={styles.restore}
      />
    </View>
  )
})

const styles = StyleSheet.create({
  stack: { gap: 10 },
  restore: { alignSelf: 'center', paddingVertical: 6 },
  note: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
})
