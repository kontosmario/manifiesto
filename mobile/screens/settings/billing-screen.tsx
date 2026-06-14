import { useCallback, useState } from 'react'
import { AppState, RefreshControl, StyleSheet, View } from 'react-native'
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

/**
 * Presenta el sheet DESPUÉS de que se cierre la UI nativa de StoreKit (hoja de
 * compra + alert "Suscrito"). Esa UI corre en una `UIWindow` por encima del
 * `Modal` de RN, así que `InteractionManager` no la detecta y nuestro sheet
 * aparecía DETRÁS. Cuando la UI nativa se descarta, la app vuelve a AppState
 * 'active' — ese es el momento. Fallback a un delay por si nunca dejó 'active'.
 */
function presentAfterNativeUI(show: () => void) {
  let fired = false
  const fire = () => {
    if (fired) return
    fired = true
    sub.remove()
    clearTimeout(timer)
    setTimeout(show, 250) // respiro tras cerrarse la UI nativa
  }
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') fire()
  })
  const timer = setTimeout(fire, 1500)
}

export function BillingScreen({ lockMode = false }: { lockMode?: boolean } = {}) {
  const billing = useBilling()
  const userId = useAuthSession().data?.user.id
  const { familyId } = useImportWizardContext()
  const entQuery = useEntitlement(userId)
  const snap = entQuery.data ?? BLOCKED_ENTITLEMENT

  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [retryPlan, setRetryPlan] = useState<BillingPlan | null>(null)

  const isManage =
    snap.source === 'subscription' ||
    snap.source === 'family' ||
    snap.source === 'comped'

  const doPurchase = useCallback(
    async (plan: BillingPlan, isChange = false) => {
      void triggerHaptic('selection')
      setRetryPlan(plan)
      const result = await billing.purchasePlan(plan)
      if (result.ok) {
        void triggerHaptic('success')
        // Un "Cambiar de plan" es un crossgrade DIFERIDO (no inmediato): el
        // sheet lo comunica como "programado", no como "¡Bienvenido!".
        presentAfterNativeUI(() =>
          setSheet({
            variant: isChange ? 'planScheduled' : 'success',
            planName: plan.name,
          }),
        )
      } else if (result.reason === CANCELLED_REASON) {
        // Cancelar NO es error → sin sheet (toast opcional, fuera de scope).
      } else {
        void triggerHaptic('error')
        presentAfterNativeUI(() =>
          setSheet({ variant: 'error', reason: result.reason }),
        )
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
    void doPurchase(BILLING_PLANS[otherId], true)
  }, [snap.plan, doPurchase])

  const closeSheet = useCallback(() => setSheet(null), [])
  const retry = useCallback(() => {
    setSheet(null)
    if (retryPlan) void doPurchase(retryPlan)
  }, [retryPlan, doPurchase])

  const isErrorSheet =
    sheet?.variant === 'error' || sheet?.variant === 'restoreError'

  return (
    <Screen
      canGoBack={!lockMode}
      title="Plan del hogar"
      scrollable
      refreshControl={
        <RefreshControl
          refreshing={entQuery.isFetching}
          onRefresh={() => {
            void entQuery.refetch()
          }}
        />
      }
    >
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
