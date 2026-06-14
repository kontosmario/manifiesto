import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isExpoGo } from '@/lib/runtime-environment'
import { useEntitlement, entitlementQueryKey } from '@/features/billing/use-entitlement'
import { useImportWizardContext } from '@/features/import-review/use-import-wizard-context'
import type { BillingPlan, BillingPlanId } from './billing-plans'

/**
 * Billing — integración real de StoreKit 2 vía expo-iap (suscripciones).
 *
 * Reglas de diseño (spec docs/superpowers/specs/2026-06-12-apple-subscriptions-design.md):
 *
 *  • LA FUENTE DE VERDAD DEL ENTITLEMENT ES EL SERVER. `status.activePlanId`
 *    NO sale de StoreKit local sino del snapshot de `useEntitlement(userId)`
 *    (RPC `family_entitlement_snapshot`, cascada comped > familia > trial >
 *    bloqueado). StoreKit acá solo DISPARA la compra/restore; el acceso lo
 *    resuelve el backend tras verificar el JWS en la edge `validate-purchase`.
 *
 *  • appAccountToken = familyId. Atamos la transacción de Apple al hogar para
 *    que el server pueda acreditarla a la familia correcta (autoritativo SOLO
 *    en la compra nueva — en restore se rutea por original_transaction_id).
 *
 *  • Flujo event-based de expo-iap: `requestPurchase` NO devuelve el recibo;
 *    el resultado llega por `purchaseUpdatedListener`. Por eso la compra es
 *    una promesa single-flight: `purchasePlan` registra la pendiente, dispara
 *    requestPurchase, y el listener (o el errorListener) la resuelve.
 *
 *  • GUARD Expo Go: expo-iap es módulo nativo (como expo-share-intent / ML
 *    Kit). En Expo Go no está linkeado → require lazy detrás de `isExpoGo`
 *    para que el bundle ni siquiera lo cargue; todas las funciones quedan en
 *    no-op seguro.
 */

export interface BillingStatus {
  /** Plan activo o `null` si el hogar todavía no tiene sub activa. */
  activePlanId: BillingPlanId | null
  /** ISO date al que vence la suscripción actual (renovación). */
  expiresAt: string | null
  /** El usuario está en el período de prueba gratis (source==='trial'). */
  isInTrial: boolean
  /** Renovación automática activa. Fase 1: no lo expone el snapshot → true. */
  autoRenew: boolean
}

const DEFAULT_STATUS: BillingStatus = {
  activePlanId: null,
  expiresAt: null,
  isInTrial: false,
  autoRenew: true,
}

export type PurchaseResult = { ok: true } | { ok: false; reason: string }
export type RestoreResult = { ok: true } | { ok: false; reason: string }

// ─── Tipos mínimos de expo-iap que consumimos ──────────────────────────────
// Replicamos solo los campos que tocamos (subset verificado de PurchaseIOS /
// Product / PurchaseError). El require lazy devuelve `any`, así que estos
// tipos son nuestro contrato de borde, no los del paquete.

/** Subset de `Purchase` (PurchaseIOS) que usa este módulo. */
interface IapPurchase {
  /** Unified purchase token = el JWS de StoreKit 2. Es lo que va al server. */
  purchaseToken?: string | null
  transactionId: string
  productId: string
  appAccountToken?: string | null
  originalTransactionIdentifierIOS?: string | null
  id: string
}

interface IapPurchaseError {
  message?: string
  code?: string
}

/** Subset de `Product` (suscripción) — lo justo para precios localizados. */
export interface IapSubscriptionProduct {
  id: string
  title?: string
  displayPrice?: string
  price?: number
  currency?: string
}

interface ExpoIapModule {
  initConnection: () => Promise<unknown>
  endConnection: () => Promise<unknown>
  fetchProducts: (args: {
    skus: string[]
    type: 'subs'
  }) => Promise<IapSubscriptionProduct[]>
  requestPurchase: (args: {
    request: { apple: { sku: string; appAccountToken?: string } }
    type: 'subs'
  }) => Promise<unknown>
  purchaseUpdatedListener: (
    listener: (purchase: IapPurchase) => void,
  ) => { remove: () => void }
  purchaseErrorListener: (
    listener: (error: IapPurchaseError) => void,
  ) => { remove: () => void }
  finishTransaction: (args: {
    purchase: IapPurchase
    isConsumable: boolean
  }) => Promise<unknown>
  restorePurchases: () => Promise<unknown>
  getAvailablePurchases: () => Promise<IapPurchase[]>
}

// require lazy: NO top-level. En Expo Go ni se evalúa el require, así que el
// bundle de Expo Go no truena por el módulo nativo faltante.
const iap: ExpoIapModule | null = (() => {
  if (isExpoGo) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-iap') as ExpoIapModule
  } catch {
    return null
  }
})()

const EXPO_GO_REASON = 'IAP no disponible en Expo Go'

// Mensajes accionables (ES, sin tecnicismos) por código de la edge function.
const PURCHASE_FALLBACK_REASON =
  'No pudimos confirmar tu compra. Reintentá en un momento.'
export const CANCELLED_REASON = 'Cancelaste la compra.'
// Centinela INTERNO (no se muestra): un cambio de plan DIFERIDO (downgrade)
// confirmado no emite transacción → no llega purchaseUpdated/purchaseError.
// Lo resolvemos con este motivo para distinguirlo de un cancel real y NO
// mostrar sheet de error. El feedback lo da el banner optimista + el server.
export const DEFERRED_REASON = '__deferred_change__'
const BOUND_TO_OTHER_FAMILY_REASON =
  'Tu suscripción está asociada a otro hogar. Contactanos.'

/** Promesa pendiente de una compra en curso (single-flight). */
interface PendingPurchase {
  resolve: (result: PurchaseResult) => void
  /** Safety timer: limpia la pendiente si nunca llega un resultado. */
  timer?: ReturnType<typeof setTimeout>
}

/**
 * Mapea un código de error de StoreKit (PurchaseError.code) a un texto
 * amigable. `user-cancelled` es el caso esperado al tocar "Cancelar" en la
 * hoja de Apple — no es un fallo.
 */
function reasonForPurchaseError(error: IapPurchaseError): string {
  if (error?.code === 'user-cancelled') return CANCELLED_REASON
  return error?.message?.trim() || PURCHASE_FALLBACK_REASON
}

/**
 * Lee el body JSON de un error de `functions.invoke`. En supabase-js un
 * status no-2xx llega como `FunctionsHttpError` cuyo `.context` es el
 * `Response` crudo: de ahí sacamos `{ error: 'CÓDIGO' }` y el status.
 */
async function readEdgeError(
  error: unknown,
): Promise<{ code: string | null; status: number | null }> {
  const ctx = (error as { context?: unknown })?.context
  if (ctx && typeof (ctx as Response).json === 'function') {
    const response = ctx as Response
    try {
      const body = (await response.json()) as { error?: string }
      return { code: body?.error ?? null, status: response.status ?? null }
    } catch {
      return { code: null, status: response.status ?? null }
    }
  }
  return { code: null, status: null }
}

/**
 * POSTea el JWS a la edge `validate-purchase`. Devuelve el resultado
 * normalizado: ok, o el código de error de la function (p.ej.
 * `SUBSCRIPTION_BOUND_TO_OTHER_FAMILY`) + el status HTTP.
 */
async function validatePurchaseOnServer(jws: string): Promise<{
  ok: boolean
  code: string | null
  status: number | null
}> {
  // Pasamos el bearer explícito (mismo patrón que register-push-subscription):
  // la edge exige el JWT del usuario para resolver su identidad.
  const session = await supabase.auth.getSession()
  const accessToken = session.data.session?.access_token
  const { error } = await supabase.functions.invoke('validate-purchase', {
    body: { jws },
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  })
  if (!error) return { ok: true, code: null, status: 200 }
  const { code, status } = await readEdgeError(error)
  return { ok: false, code, status }
}

export function useBilling() {
  const queryClient = useQueryClient()
  const { familyId, userId } = useImportWizardContext()
  const entitlementQuery = useEntitlement(userId)

  const [isPurchasing, setIsPurchasing] = useState(false)

  // Single-flight: solo permitimos una compra en vuelo. El listener resuelve
  // esta ref (no estado, para no re-suscribir el listener en cada compra).
  const pendingRef = useRef<PendingPurchase | null>(null)

  // El listener de StoreKit se registra UNA sola vez (deps []), pero
  // handlePurchaseUpdate depende de userId. Para no invalidar el query del
  // usuario EQUIVOCADO si la sesión cambió, el listener llama siempre la última
  // versión a través de este ref (se mantiene actualizado abajo).
  const handlePurchaseUpdateRef = useRef<
    ((purchase: IapPurchase) => Promise<void>) | null
  >(null)

  // ─── status DERIVADO del snapshot del server (no de StoreKit) ────────────
  const status = useMemo<BillingStatus>(() => {
    const snap = entitlementQuery.data
    if (!snap) return DEFAULT_STATUS

    // Hay sub activa (pago propio o cobertura de hogar) cuando la cascada
    // resuelve a 'subscription' o 'family'. plan: 'monthly'→mensual,
    // 'yearly'→anual. Cualquier otra cosa → sin plan activo.
    // Una sub propia o cobertura de hogar resuelven ambas como 'family' (la
    // familia es la unidad de facturación; no hay source 'subscription').
    const hasActiveSub = snap.source === 'family'
    let activePlanId: BillingPlanId | null = null
    if (hasActiveSub) {
      if (snap.plan === 'monthly') activePlanId = 'hogar-mensual'
      else if (snap.plan === 'yearly') activePlanId = 'hogar-anual'
    }

    return {
      activePlanId,
      expiresAt: snap.expiresAt,
      isInTrial: snap.source === 'trial',
      // El snapshot no expone autoRenew en Fase 1; lo dejamos true (default).
      autoRenew: true,
    }
  }, [entitlementQuery.data])

  // ─── Conexión + listeners (montaje/desmontaje del hook) ──────────────────
  useEffect(() => {
    if (!iap) return

    let active = true
    const subscriptions: Array<{ remove: () => void }> = []

    // initConnection puede tirar si ya hay conexión; lo absorbemos. El guard
    // `active` evita registrar listeners si el hook se desmontó mientras tanto.
    iap
      .initConnection()
      .catch(() => {
        // No-fatal: si falla, la primera compra resolverá con error claro.
      })
      .finally(() => {
        if (!active || !iap) return

        // Compra OK desde StoreKit → validamos en el server, y SOLO con el OK
        // del server hacemos finishTransaction + invalidamos el entitlement.
        const updated = iap.purchaseUpdatedListener((purchase) => {
          void handlePurchaseUpdateRef.current?.(purchase)
        })
        const failed = iap.purchaseErrorListener((error) => {
          if (__DEV__) console.log('[billing] purchaseError', error)
          // Resolvemos la compra pendiente (si la hay) con un motivo amigable.
          resolvePending({ ok: false, reason: reasonForPurchaseError(error) })
        })
        subscriptions.push(updated, failed)
      })

    return () => {
      active = false
      subscriptions.forEach((s) => s.remove())
      // Resolvemos cualquier pendiente para no dejar una promesa colgada.
      resolvePending({ ok: false, reason: PURCHASE_FALLBACK_REASON })
      iap.endConnection().catch(() => {
        // No-fatal en teardown.
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Resuelve la compra pendiente (si existe) y limpia la ref. */
  const resolvePending = useCallback((result: PurchaseResult) => {
    const pending = pendingRef.current
    if (!pending) return
    if (pending.timer) clearTimeout(pending.timer)
    pendingRef.current = null
    setIsPurchasing(false)
    pending.resolve(result)
  }, [])

  /**
   * Handler del purchaseUpdatedListener: toma el JWS (purchaseToken), lo valida
   * server-side, y con el OK cierra la transacción + refresca el entitlement.
   */
  const handlePurchaseUpdate = useCallback(
    async (purchase: IapPurchase) => {
      if (!iap) return
      const jws = purchase.purchaseToken
      if (__DEV__) {
        console.log('[billing] purchaseUpdated', {
          productId: purchase.productId,
          otx: purchase.originalTransactionIdentifierIOS,
          txId: purchase.transactionId,
          hasJws: Boolean(jws),
        })
      }
      if (!jws) {
        resolvePending({ ok: false, reason: PURCHASE_FALLBACK_REASON })
        return
      }

      const result = await validatePurchaseOnServer(jws)
      if (__DEV__) console.log('[billing] validate result', result)
      if (!result.ok) {
        // Compra bound a otro hogar: falla PERMANENTE (la sub pertenece a otra
        // familia; reintentar no cambia nada). Cerramos la transacción para que
        // NO se re-dispare en cada reconexión (replay leak). El acceso real lo
        // decide el server vía el snapshot, no esta transacción.
        if (result.code === 'SUBSCRIPTION_BOUND_TO_OTHER_FAMILY') {
          try {
            await iap.finishTransaction({ purchase, isConsumable: false })
          } catch {
            // no-fatal: si falla, reaparecerá y se cerrará en el próximo intento.
          }
          resolvePending({ ok: false, reason: BOUND_TO_OTHER_FAMILY_REASON })
          return
        }
        // No hacemos finishTransaction: el recibo queda en la cola y se
        // reintentará en el próximo arranque (replay de StoreKit).
        resolvePending({ ok: false, reason: PURCHASE_FALLBACK_REASON })
        return
      }

      // Server OK → cerramos la transacción (no consumible: es una sub) e
      // invalidamos el snapshot para que `status` refleje el acceso nuevo.
      try {
        await iap.finishTransaction({ purchase, isConsumable: false })
      } catch {
        // Si finishTransaction falla, el server ya acreditó: el recibo
        // reaparecerá y se cerrará luego. El usuario igual tiene acceso.
      }
      await queryClient.invalidateQueries({
        queryKey: entitlementQueryKey(userId),
      })
      resolvePending({ ok: true })
    },
    [queryClient, userId, resolvePending],
  )

  // Mantenemos el ref apuntando a la última versión de handlePurchaseUpdate
  // (captura el userId actual) sin tener que re-registrar el listener nativo.
  useEffect(() => {
    handlePurchaseUpdateRef.current = handlePurchaseUpdate
  }, [handlePurchaseUpdate])

  // ─── purchasePlan: dispara la compra y espera la resolución del listener ──
  const purchasePlan = useCallback(
    async (
      plan: BillingPlan,
      opts?: { deferred?: boolean },
    ): Promise<PurchaseResult> => {
      if (!iap) return { ok: false, reason: EXPO_GO_REASON }
      if (!familyId) {
        return {
          ok: false,
          reason: 'No pudimos identificar tu hogar. Reintentá en un momento.',
        }
      }
      // Single-flight: si ya hay una compra en vuelo, no abrimos otra.
      if (pendingRef.current) {
        return { ok: false, reason: 'Ya hay una compra en curso.' }
      }

      setIsPurchasing(true)
      // Un cambio diferido (downgrade) NO dispara purchaseUpdated ni
      // purchaseError al confirmarse: la pendiente solo la cierra el timer.
      // Por eso usamos un timeout corto + motivo DEFERRED (libera el
      // single-flight rápido para poder re-cambiar, y lo distingue de un
      // cancel real). Una compra/upgrade normal sí resuelve por el listener;
      // su timer largo (30s) es solo red de seguridad → motivo CANCELLED.
      const deferred = opts?.deferred === true
      return new Promise<PurchaseResult>((resolve) => {
        const timer = setTimeout(
          () =>
            resolvePending({
              ok: false,
              reason: deferred ? DEFERRED_REASON : CANCELLED_REASON,
            }),
          deferred ? 8_000 : 30_000,
        )
        pendingRef.current = { resolve, timer }
        if (__DEV__) {
          console.log('[billing] requestPurchase', {
            sku: plan.productId,
            appAccountToken: familyId,
          })
        }
        // requestPurchase NO devuelve el recibo: el resultado llega por el
        // listener (o el errorListener) → no esperamos su return.
        iap
          .requestPurchase({
            request: { apple: { sku: plan.productId, appAccountToken: familyId } },
            type: 'subs',
          })
          .catch((error: unknown) => {
            if (__DEV__) console.log('[billing] requestPurchase rejected', error)
            // Rechazo sincrónico de la store (p.ej. no preparada): resolvemos
            // la pendiente acá; el errorListener puede no disparar.
            const reason =
              error instanceof Error && error.message
                ? error.message
                : PURCHASE_FALLBACK_REASON
            resolvePending({ ok: false, reason })
          })
      })
    },
    [familyId, resolvePending],
  )

  // ─── restore: re-valida cada compra disponible en el server ──────────────
  const restore = useCallback(async (): Promise<RestoreResult> => {
    if (!iap) return { ok: false, reason: EXPO_GO_REASON }

    try {
      await iap.restorePurchases()
      const purchases = await iap.getAvailablePurchases()
      const withTokens = purchases.filter((p) => Boolean(p.purchaseToken))

      if (withTokens.length === 0) {
        return {
          ok: false,
          reason: 'No encontramos compras para restaurar con esta cuenta.',
        }
      }

      let anyValidated = false
      for (const purchase of withTokens) {
        const result = await validatePurchaseOnServer(purchase.purchaseToken as string)
        if (result.ok) {
          anyValidated = true
          continue
        }
        // 409 SUBSCRIPTION_BOUND_TO_OTHER_FAMILY: distinguible, mensaje
        // accionable. Cortamos acá — no tiene sentido seguir.
        if (
          result.code === 'SUBSCRIPTION_BOUND_TO_OTHER_FAMILY' ||
          result.status === 409
        ) {
          await queryClient.invalidateQueries({
            queryKey: entitlementQueryKey(userId),
          })
          return { ok: false, reason: BOUND_TO_OTHER_FAMILY_REASON }
        }
        // Otros errores: seguimos probando las demás compras.
      }

      // Refrescamos el snapshot pase lo que pase (puede haber cambiado).
      await queryClient.invalidateQueries({
        queryKey: entitlementQueryKey(userId),
      })

      if (!anyValidated) {
        return {
          ok: false,
          reason: 'No pudimos restaurar tu suscripción. Reintentá en un momento.',
        }
      }
      return { ok: true }
    } catch {
      return {
        ok: false,
        reason: 'No pudimos restaurar tus compras. Reintentá en un momento.',
      }
    }
  }, [queryClient, userId])

  // ─── getProducts: precios localizados (opcional para la UI) ──────────────
  const getProducts = useCallback(async (): Promise<IapSubscriptionProduct[]> => {
    if (!iap) return []
    try {
      const skus = [
        'com.manifiesto.app.subscription.monthly',
        'com.manifiesto.app.subscription.yearly',
      ]
      return await iap.fetchProducts({ skus, type: 'subs' })
    } catch {
      return []
    }
  }, [])

  return {
    status,
    isPurchasing,
    purchasePlan,
    restore,
    getProducts,
  }
}
