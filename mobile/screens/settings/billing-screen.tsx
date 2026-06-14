import { useCallback, useState } from 'react'
import { AppState, RefreshControl, StyleSheet, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { triggerHaptic } from '@/lib/haptics'
import {
  useBilling,
  CANCELLED_REASON,
  DEFERRED_REASON,
  type PurchaseResult,
} from '@/features/billing/use-billing'
import { useEntitlement } from '@/features/billing/use-entitlement'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useImportWizardContext } from '@/features/import-review/use-import-wizard-context'
import { PaywallView } from '@/components/billing/paywall-view'
import { ManageView } from '@/components/billing/manage-view'
import {
  PurchaseResultSheet,
  type PurchaseResultVariant,
} from '@/components/billing/purchase-result-sheet'
import { ChangePlanSheet } from '@/components/billing/change-plan-sheet'
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
  const [changeOpen, setChangeOpen] = useState(false)
  const [changeSelected, setChangeSelected] =
    useState<BillingPlanId>('hogar-anual')
  // Cambio agendado de forma OPTIMISTA: un downgrade no emite evento de
  // StoreKit, así que mostramos el banner al instante y dejamos que el server
  // (webhook → pending_product_id) tome la posta en la reconciliación.
  const [optimisticPending, setOptimisticPending] =
    useState<BillingPlanId | null>(null)

  const isManage =
    snap.source === 'subscription' ||
    snap.source === 'family' ||
    snap.source === 'comped'

  // Plan al que renovaría hoy (pending si hay, si no el actual) → default del
  // selector de "Cambiar de plan".
  const scheduledPlanId: BillingPlanId =
    (snap.pendingProductId
      ? Object.values(BILLING_PLANS).find(
          (p) => p.productId === snap.pendingProductId,
        )?.id
      : undefined) ?? (snap.plan === 'yearly' ? 'hogar-anual' : 'hogar-mensual')

  // kind: 'new' (alta desde paywall) · 'upgrade' (mensual→anual, inmediato) ·
  // 'downgrade' (anual→mensual, DIFERIDO: Apple ya confirma de forma nativa y
  // no emite transacción, así que NO abrimos otro modal — el banner lo cubre).
  const doPurchase = useCallback(
    async (
      plan: BillingPlan,
      kind: 'new' | 'upgrade' | 'downgrade' = 'new',
    ): Promise<PurchaseResult> => {
      void triggerHaptic('selection')
      setRetryPlan(plan)
      const result = await billing.purchasePlan(plan, {
        deferred: kind === 'downgrade',
      })
      if (result.ok) {
        void triggerHaptic('success')
        if (kind !== 'downgrade') {
          presentAfterNativeUI(() =>
            setSheet({
              variant: kind === 'new' ? 'success' : 'planChanged',
              planName: plan.name,
            }),
          )
        }
      } else if (result.reason === CANCELLED_REASON) {
        // Cancelar (incl. cerrar la hoja nativa de un cambio) → sin sheet.
      } else if (result.reason === DEFERRED_REASON) {
        // Downgrade confirmado sin transacción: el banner optimista + la
        // reconciliación con el server comunican el cambio. Sin sheet.
      } else {
        void triggerHaptic('error')
        presentAfterNativeUI(() =>
          setSheet({ variant: 'error', reason: result.reason }),
        )
      }
      return result
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

  // "Cambiar de plan": abre el selector. Confirmar compra el plan elegido
  // (StoreKit maneja upgrade inmediato / downgrade diferido / cancelar un
  // downgrade pendiente al volver al plan actual).
  const onChangePlan = useCallback(() => {
    setChangeSelected(scheduledPlanId)
    setChangeOpen(true)
  }, [scheduledPlanId])

  // El downgrade lo registra el webhook (pending_product_id) unos segundos
  // después de confirmarlo. Refrescamos el entitlement para que el banner pase
  // a venir del server (no del estado optimista) sin pull-to-refresh manual.
  const scheduleReconcile = useCallback(() => {
    setTimeout(() => void entQuery.refetch(), 4000)
    setTimeout(() => void entQuery.refetch(), 9000)
  }, [entQuery])

  const onConfirmChange = useCallback(
    async (planId: BillingPlanId) => {
      setChangeOpen(false)
      const target = BILLING_PLANS[planId]
      // Anual está por encima de mensual (Niveles en App Store Connect): bajar a
      // mensual es DIFERIDO; subir a anual es inmediato.
      const kind: 'upgrade' | 'downgrade' =
        snap.plan === 'yearly' && target.cycle === 'monthly'
          ? 'downgrade'
          : 'upgrade'
      if (kind === 'downgrade') {
        setOptimisticPending(planId) // feedback inmediato
        scheduleReconcile()
      } else {
        // Upgrade, o cancelar un downgrade pendiente volviendo al plan mayor:
        // el banner de "cambio agendado" ya no aplica.
        setOptimisticPending(null)
      }
      const result = await doPurchase(target, kind)
      // Si cerró la hoja nativa sin confirmar, el cambio no ocurrió → limpiamos
      // el banner optimista. Un downgrade confirmado resuelve con DEFERRED.
      if (
        kind === 'downgrade' &&
        !result.ok &&
        result.reason === CANCELLED_REASON
      ) {
        setOptimisticPending(null)
      }
    },
    [doPurchase, snap.plan, scheduleReconcile],
  )

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
            optimisticPendingPlanId={optimisticPending}
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

      <ChangePlanSheet
        visible={changeOpen}
        selected={changeSelected}
        onSelect={setChangeSelected}
        scheduledPlanId={scheduledPlanId}
        isPurchasing={billing.isPurchasing}
        onConfirm={onConfirmChange}
        onClose={() => setChangeOpen(false)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({ body: { paddingBottom: 12 } })
