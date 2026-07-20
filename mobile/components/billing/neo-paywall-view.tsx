import { memo, useCallback, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, type RefreshControlProps } from 'react-native'
import { AuthLiveChrome } from '@/components/redesign/auth/auth-kit'
import { AuthPlanHogar } from '@/components/redesign/auth/auth-plan-hogar'
import {
  BILLING_PLANS,
  type BillingPlan,
  type BillingPlanId,
} from '@/features/billing/billing-plans'
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/lib/legal-urls'
import { useThemeMode } from '@/theme/theme-provider'
import type { PaywallViewProps } from './paywall-view'

/**
 * Paywall REDISEÑADO (Estado A) — mismo contrato de props que
 * PaywallView (el billing-screen le pasa exactamente lo mismo), pero
 * renderiza la réplica aprobada 4m/4mo (AuthPlanHogar) cableada a los
 * valores reales:
 *
 *  · Precios: displayPrice localizado de StoreKit por productId
 *    (productPrices), con skeleton mientras cargan y fallback al
 *    hardcode de billing-plans si la store falló — mismo criterio que
 *    PlanTiles. El CTA "Suscribirme" omite el monto hasta resolver
 *    (nunca flashea el hardcode para corregirlo después).
 *  · Trial: días reales del snapshot (source 'trial'); fuera del
 *    período libre la trial card no se dibuja (lockMode incluido).
 *  · welcomeMode: onContinueFree + continueLabel vienen del
 *    billing-screen; la réplica ya trae la emphasis invertida (continuar
 *    = primario verde, suscribir = inset). Sin continue (Ajustes fuera
 *    del welcome / lockMode) el componente vuelve a la emphasis del
 *    paywall real: suscribir ES el primario. Gate por inFreePeriod
 *    idéntico al del PaywallView (continue solo en período libre).
 *  · Compra: onSubscribe entrega el plan elegido y acá se traduce al
 *    BillingPlan para el doPurchase REAL del billing-screen (sheet de
 *    resultado incluido — no está rediseñado y se mantiene). El háptico
 *    del tap lo pone el botón del kit; no se agrega otro acá.
 *  · Disclosure Apple 3.1.2 + links legales REALES (compliance): los
 *    literales demo del componente quedan solo para el preview dev.
 *  · lockMode: salidas "Cerrar sesión"/"Eliminar cuenta" como AuthLink
 *    muted (gap de diseño permitido: mismo lenguaje del kit); el
 *    componente solo las dibuja en lockMode, igual que PaywallView.
 *  · Expo Go: use-billing entrega productPrices vacío con
 *    pricesLoading=false → fallback hardcode sin skeleton; purchasePlan
 *    resuelve { ok:false, EXPO_GO_REASON } → sheet de error del flujo
 *    actual. Misma degradación que el paywall anterior.
 *
 * Chrome: AuthLiveChrome conmuta la status bar / home indicator
 * dibujados de la réplica a insets reales + StatusBar del sistema.
 * Layout: TAKEOVER full-bleed (decisión documentada en billing-screen).
 * Extras sobre PaywallViewProps, propios del takeover: onBack (el back
 * de Ajustes que antes aportaba el header del Screen) y refreshControl
 * (el pull-to-refresh del entitlement que antes vivía en el Screen).
 */
export interface NeoPaywallViewProps extends PaywallViewProps {
  /** Back de la entrada desde Ajustes; sin él no se dibuja el header. */
  onBack?: () => void
  /** Pull-to-refresh del entitlement (antes lo aportaba el Screen). */
  refreshControl?: ReactElement<RefreshControlProps>
}

const MONTHLY = BILLING_PLANS['hogar-mensual']
const YEARLY = BILLING_PLANS['hogar-anual']

export const NeoPaywallView = memo(function NeoPaywallView({
  snap,
  lockMode = false,
  isPurchasing,
  onPurchase,
  onRestore,
  onLogout,
  onDeleteAccount,
  productPrices,
  pricesLoading = false,
  onContinueFree,
  continueLabel,
  onBack,
  refreshControl,
}: NeoPaywallViewProps) {
  const { t } = useTranslation()
  const mode = useThemeMode().resolvedMode
  const inFreePeriod = snap.source === 'trial' && snap.daysLeft != null

  // Label del CTA de suscripción por plan — misma receta que PaywallView:
  // displayPrice de StoreKit > hardcode; sin monto mientras StoreKit
  // carga ("Suscribirme" a secas, para no flashear el hardcode).
  const subscribeLabelFor = (plan: BillingPlan) => {
    const storePrice = productPrices?.[plan.productId]
    if (!storePrice && pricesLoading) return t('billing:paywall.subscribe')
    const price = storePrice ?? `$${plan.priceUsd.toFixed(2)}`
    const period =
      plan.cycle === 'yearly' ? t('billing:paywall.perYear') : t('billing:paywall.perMonth')
    return t('billing:paywall.subscribeWithPrice', { price, period })
  }

  const handleSubscribe = useCallback(
    (planId: BillingPlanId) => {
      onPurchase(BILLING_PLANS[planId])
    },
    [onPurchase],
  )

  const openTerms = useCallback(() => {
    void Linking.openURL(TERMS_OF_SERVICE_URL)
  }, [])
  const openPrivacy = useCallback(() => {
    void Linking.openURL(PRIVACY_POLICY_URL)
  }, [])

  return (
    <AuthLiveChrome>
      <AuthPlanHogar
        mode={mode}
        monthlyPrice={productPrices?.[MONTHLY.productId]}
        yearlyPrice={productPrices?.[YEARLY.productId]}
        pricesLoading={pricesLoading}
        trialDays={inFreePeriod ? (snap.daysLeft as number) : null}
        busy={isPurchasing}
        lockMode={lockMode}
        // Gate duro: mensaje de acceso pausado (no la pantalla de venta).
        lockHeadline={lockMode ? t('billing:paywall.headlineLocked') : undefined}
        lockChip={lockMode ? t('billing:paywall.lockChip') : undefined}
        continueLabel={continueLabel ?? t('billing:paywall.start')}
        subscribeMonthlyLabel={subscribeLabelFor(MONTHLY)}
        subscribeYearlyLabel={subscribeLabelFor(YEARLY)}
        disclosureText={t('billing:paywall.disclosure')}
        restoreLabel={t('billing:paywall.restorePurchases')}
        termsLabel={t('billing:paywall.terms')}
        privacyLabel={t('billing:paywall.privacy')}
        logoutLabel={t('billing:paywall.logout')}
        deleteAccountLabel={t('billing:paywall.deleteAccount')}
        onBack={onBack}
        onContinueFree={inFreePeriod ? onContinueFree : undefined}
        onSubscribe={handleSubscribe}
        onRestore={onRestore}
        onLogout={onLogout}
        onDeleteAccount={onDeleteAccount}
        onTerms={openTerms}
        onPrivacy={openPrivacy}
        refreshControl={refreshControl}
      />
    </AuthLiveChrome>
  )
})
