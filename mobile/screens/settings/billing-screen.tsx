import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AppState, Modal, RefreshControl, StyleSheet, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { DARK_TAB_CANVAS } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { triggerHaptic } from '@/lib/haptics'
import {
  useBilling,
  CANCELLED_REASON,
  DEFERRED_REASON,
  type PurchaseResult,
} from '@/features/billing/use-billing'
import { useEntitlement } from '@/features/billing/use-entitlement'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { logoutSession } from '@/features/auth/logout'
import { getErrorMessage } from '@/utils/error-message'
import { useImportWizardContext } from '@/features/import-review/use-import-wizard-context'
import { PaywallView } from '@/components/billing/paywall-view'
import { ManageView } from '@/components/billing/manage-view'
import { DeleteAccountScreen } from '@/screens/settings/delete-account-screen'
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
 * Naturaleza de la compra — determina el timeout/feedback:
 *   'new'       alta desde el paywall (sheet de éxito celebratorio).
 *   'upgrade'   mensual→anual: inmediato, emite transacción (sheet planChanged).
 *   'downgrade' anual→mensual: DIFERIDO, sin transacción (banner, sin sheet).
 */
type PurchaseKind = 'new' | 'upgrade' | 'downgrade'

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

export function BillingScreen({
  lockMode = false,
  welcomeMode = false,
  onContinue,
}: {
  lockMode?: boolean
  /** Modo bienvenida post-onboarding: oculta el back-button y, en período
   *  libre, agrega el CTA "Empezar con N días de acceso completo" → Home
   *  (`onContinue`). El resto (planes + disclosure 3.1.2 + footer) intacto. */
  welcomeMode?: boolean
  onContinue?: () => void
} = {}) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const billing = useBilling()
  const userId = useAuthSession().data?.user.id
  const { familyId } = useImportWizardContext()
  const entQuery = useEntitlement(userId)
  const snap = entQuery.data ?? BLOCKED_ENTITLEMENT

  // Copy del CTA de bienvenida (welcomeMode), con los días reales del período
  // libre. Compliance: "acceso completo", nunca "prueba/gratis".
  const welcomeContinueLabel =
    snap.daysLeft != null
      ? t('billing:screen.welcomeCta', { count: snap.daysLeft })
      : t('billing:screen.welcomeCtaFallback')

  const [sheet, setSheet] = useState<SheetState | null>(null)
  // Guardamos el `kind` junto al plan: el retry desde el sheet de error debe
  // re-disparar la MISMA naturaleza de compra (un upgrade no debe reintentarse
  // como alta 'new', o mostraría el sheet equivocado).
  const [retryState, setRetryState] = useState<{
    plan: BillingPlan
    kind: PurchaseKind
  } | null>(null)
  const [changeOpen, setChangeOpen] = useState(false)
  // Eliminar cuenta desde el paywall lockMode (ver el Modal anidado abajo).
  const [showDelete, setShowDelete] = useState(false)
  const [changeSelected, setChangeSelected] =
    useState<BillingPlanId>('hogar-anual')
  // Cambio agendado de forma OPTIMISTA: un downgrade no emite evento de
  // StoreKit, así que mostramos el banner al instante y dejamos que el server
  // (webhook → pending_product_id) tome la posta en la reconciliación.
  const [optimisticPending, setOptimisticPending] =
    useState<BillingPlanId | null>(null)

  // Vista de gestión = acceso pagado/cubierto (familia), cortesía o MVP.
  const isManage =
    snap.source === 'family' ||
    snap.source === 'comped' ||
    snap.source === 'mvp'

  // Plan al que renovaría hoy → default del selector de "Cambiar de plan".
  // Prioridad: pending del server > pending optimista (downgrade recién
  // confirmado, aún sin webhook) > plan actual. Así, si reabrís el selector
  // durante la ventana optimista, ya aparece el plan agendado (no el actual),
  // consistente con el banner.
  const scheduledProductId =
    snap.pendingProductId ??
    (optimisticPending ? BILLING_PLANS[optimisticPending].productId : null)
  const scheduledPlanId: BillingPlanId =
    (scheduledProductId
      ? Object.values(BILLING_PLANS).find(
          (p) => p.productId === scheduledProductId,
        )?.id
      : undefined) ?? (snap.plan === 'yearly' ? 'hogar-anual' : 'hogar-mensual')

  // kind: 'new' (alta desde paywall) · 'upgrade' (mensual→anual, inmediato) ·
  // 'downgrade' (anual→mensual, DIFERIDO: Apple ya confirma de forma nativa y
  // no emite transacción, así que NO abrimos otro modal — el banner lo cubre).
  const doPurchase = useCallback(
    async (
      plan: BillingPlan,
      kind: PurchaseKind = 'new',
    ): Promise<PurchaseResult> => {
      void triggerHaptic('selection')
      setRetryState({ plan, kind })
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
  // Guardamos los timers para cancelarlos si la pantalla se desmonta antes
  // (evita refetch huérfano).
  const reconcileTimers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const scheduleReconcile = useCallback(() => {
    reconcileTimers.current.forEach(clearTimeout)
    reconcileTimers.current = [
      setTimeout(() => void entQuery.refetch(), 4000),
      setTimeout(() => void entQuery.refetch(), 9000),
    ]
  }, [entQuery])
  useEffect(
    () => () => reconcileTimers.current.forEach(clearTimeout),
    [],
  )

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
      // Limpieza del banner optimista según cómo resolvió:
      //  · CANCELLED → cerró la hoja nativa sin confirmar → el cambio no
      //    ocurrió → limpiamos.
      //  · DEFERRED → downgrade CONFIRMADO (sin transacción) → MANTENEMOS el
      //    banner hasta que el server reconcilie (es el objetivo del fix; no lo
      //    limpiamos aquí o desaparecería antes de tiempo en sandbox/prod-lag).
      // Edge raro: un cancel >8s resuelve por timeout como DEFERRED y deja el
      // banner pegado; se auto-cura al remontar la pantalla (refetch del server).
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
    if (retryState) void doPurchase(retryState.plan, retryState.kind)
  }, [retryState, doPurchase])

  // Salida del gate duro (lockMode): un usuario con trial vencido que no
  // quiere pagar puede cerrar sesión en vez de quedar atrapado en el paywall.
  // logoutSession dispara SIGNED_OUT → AppEntryGate → welcome, lo que
  // desmonta el Modal del SubscriptionGate (sin sesión no hay gate).
  const handleLogout = useCallback(() => {
    Alert.alert(
      t('billing:logout.confirmTitle'),
      t('billing:logout.confirmMessage'),
      [
        { text: t('billing:logout.cancel'), style: 'cancel' },
        {
          text: t('billing:logout.confirm'),
          style: 'destructive',
          onPress: () => {
            void logoutSession({
              onError: (e) =>
                Alert.alert(
                  t('billing:logout.errorTitle'),
                  getErrorMessage(e, t('billing:logout.errorFallback')),
                ),
              onSuccess: () => {},
            })
          },
        },
      ],
    )
  }, [t])

  const isErrorSheet =
    sheet?.variant === 'error' || sheet?.variant === 'restoreError'

  return (
    <Screen
      // Mismo fondo que Ajustes: canvas casi-negro DARK_TAB_CANVAS + halos
      // ambientales, para que "Plan del hogar" pertenezca a la misma paleta.
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      canGoBack={!lockMode && !welcomeMode}
      title={t('billing:screen.title')}
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
      {!theme.isDark ? <AmbientBackdrop variant="home" /> : null}
      <AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />
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
            productPrices={billing.productPrices}
            pricesLoading={billing.pricesLoading}
            onPurchase={doPurchase}
            onRestore={doRestore}
            onLogout={handleLogout}
            onDeleteAccount={
              userId && familyId ? () => setShowDelete(true) : undefined
            }
            onContinueFree={welcomeMode ? onContinue : undefined}
            continueLabel={welcomeMode ? welcomeContinueLabel : undefined}
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

      {/* Eliminar cuenta desde el paywall lockMode (Guideline 5.1.1(v)): el
          SubscriptionGate es un Modal nativo top-most, así que navegar a la
          ruta /settings/delete-account quedaría DEBAJO. En su lugar montamos la
          pantalla de baja como Modal anidado (se apila por encima del gate).
          onClose la descarta; tras agendar la baja, logoutSession dispara
          SIGNED_OUT y desmonta todo. Solo se abre con userId + familyId. */}
      {userId && familyId ? (
        <Modal
          visible={showDelete}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setShowDelete(false)}
        >
          <DeleteAccountScreen
            userId={userId}
            familyId={familyId}
            onClose={() => setShowDelete(false)}
          />
        </Modal>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({ body: { paddingBottom: 12 } })
