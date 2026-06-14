import { useCallback, useState } from 'react'
import { InteractionManager, StyleSheet, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { triggerHaptic } from '@/lib/haptics'
import { useBilling, CANCELLED_REASON } from '@/features/billing/use-billing'
import { useEntitlement } from '@/features/billing/use-entitlement'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useImportWizardContext } from '@/features/import-review/use-import-wizard-context'
import { PaywallView } from '@/components/billing/paywall-view'
import { ManageView } from '@/components/billing/manage-view'
import {
  PurchaseResultSheet,
  type PurchaseResultVariant,
} from '@/components/billing/purchase-result-sheet'
import {
  BILLING_PLANS,
  type BillingPlan,
  type BillingPlanId,
} from '@/features/billing/billing-plans'
import { BLOCKED_ENTITLEMENT } from '@/features/billing/entitlement-snapshot'

/**
 * Pantalla "Plan del hogar" — contenedor adaptativo. Según el entitlement
 * resuelto server-side, muestra:
 *   - ManageView (Estado B): suscriptos / cobertura de hogar / cortesía.
 *   - PaywallView (Estado A): trial o sin acceso. `lockMode` = gate duro.
 * El back-button (chevron en el header de `Screen`) se oculta en lockMode.
 */
interface SheetState {
  variant: PurchaseResultVariant
  planName?: string
  reason?: string
}

export function BillingScreen({ lockMode = false }: { lockMode?: boolean } = {}) {
  const billing = useBilling()
  const userId = useAuthSession().data?.user.id
  const { familyId } = useImportWizardContext()
  const snap = useEntitlement(userId).data ?? BLOCKED_ENTITLEMENT

  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [retryPlan, setRetryPlan] = useState<BillingPlan | null>(null)

  const isManage =
    snap.source === 'subscription' ||
    snap.source === 'family' ||
    snap.source === 'comped'

  const doPurchase = useCallback(
    async (plan: BillingPlan) => {
      void triggerHaptic('selection')
      setRetryPlan(plan)
      const result = await billing.purchasePlan(plan)
      if (result.ok) {
        void triggerHaptic('success')
        // Gotcha modal-chain iOS: la hoja de StoreKit se está cerrando;
        // presentar nuestro sheet sin esperar lo descarta en silencio.
        InteractionManager.runAfterInteractions(() => {
          setSheet({ variant: 'success', planName: plan.name })
        })
      } else if (result.reason === CANCELLED_REASON) {
        // Cancelar NO es error → sin sheet (toast opcional, fuera de scope).
      } else {
        void triggerHaptic('error')
        setSheet({ variant: 'error', reason: result.reason })
      }
    },
    [billing],
  )

  const doRestore = useCallback(async () => {
    void triggerHaptic('selection')
    const result = await billing.restore()
    if (result.ok) {
      void triggerHaptic('success')
      setSheet({ variant: 'restored' })
    } else {
      void triggerHaptic('error')
      setSheet({ variant: 'restoreError', reason: result.reason })
    }
  }, [billing])

  // "Cambiar de plan": compra el OTRO plan; StoreKit maneja la proration
  // dentro del grupo de suscripción.
  const onChangePlan = useCallback(() => {
    const otherId: BillingPlanId =
      snap.plan === 'yearly' ? 'hogar-mensual' : 'hogar-anual'
    void doPurchase(BILLING_PLANS[otherId])
  }, [snap.plan, doPurchase])

  const closeSheet = useCallback(() => setSheet(null), [])
  const retry = useCallback(() => {
    setSheet(null)
    if (retryPlan) void doPurchase(retryPlan)
  }, [retryPlan, doPurchase])

  const isErrorSheet =
    sheet?.variant === 'error' || sheet?.variant === 'restoreError'

  return (
    <Screen canGoBack={!lockMode} title="Plan del hogar" scrollable>
      <View style={styles.body}>
        {isManage ? (
          <ManageView
            snap={snap}
            familyId={familyId}
            onChangePlan={onChangePlan}
            onRestore={doRestore}
          />
        ) : (
          <PaywallView
            snap={snap}
            lockMode={lockMode}
            isPurchasing={billing.isPurchasing}
            onPurchase={doPurchase}
            onRestore={doRestore}
          />
        )}
      </View>

      <PurchaseResultSheet
        visible={sheet != null}
        variant={sheet?.variant ?? 'success'}
        planName={sheet?.planName}
        reason={sheet?.reason}
        onClose={closeSheet}
        onRetry={isErrorSheet ? retry : undefined}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({ body: { paddingBottom: 12 } })
