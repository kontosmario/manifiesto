import { useCallback, useState } from 'react'
import type { BillingPlan, BillingPlanId } from './billing-plans'

/**
 * Estado actual de la suscripción del hogar.
 *
 * Mientras no haya backend de billing wired (RevenueCat / Stripe /
 * StoreKit), este hook retorna el snapshot por defecto "free / sin
 * suscripción" y expone los handlers que el componente de UI
 * necesita. Cuando el provider real entre, la firma pública del
 * hook no cambia — solo la implementación interna.
 *
 * Razón de diseño: queremos que la pantalla y los componentes de
 * Plan se construyan ya con la forma final de los datos, así
 * cuando se enchufe RevenueCat el cambio sea local a este archivo.
 */

export interface BillingStatus {
  /** Plan activo o `null` si el hogar todavía no compró. */
  activePlanId: BillingPlanId | null
  /** ISO date al que vence la suscripción actual (renovación). */
  expiresAt: string | null
  /** El usuario está en el período de prueba gratis. */
  isInTrial: boolean
  /** Renovación automática activa (puede pausarse desde la store). */
  autoRenew: boolean
}

const DEFAULT_STATUS: BillingStatus = {
  activePlanId: null,
  expiresAt: null,
  isInTrial: false,
  autoRenew: true,
}

export function useBilling() {
  const [status, setStatus] = useState<BillingStatus>(DEFAULT_STATUS)
  const [isPurchasing, setIsPurchasing] = useState(false)

  const purchasePlan = useCallback(
    async (plan: BillingPlan): Promise<{ ok: true } | { ok: false; reason: string }> => {
      setIsPurchasing(true)
      try {
        // ─── INTEGRATION POINT ────────────────────────────────────
        // Aquí va la llamada real a RevenueCat / Stripe / StoreKit:
        //   const result = await Purchases.purchaseProduct(plan.productId)
        // y luego sincronizar el entitlement con el backend.
        //
        // Por ahora resolvemos optimista a los 600ms para que el
        // flujo de UI (loading → confirmación) sea testeable.
        await new Promise((resolve) => setTimeout(resolve, 600))
        const now = new Date()
        const expires = new Date(now)
        if (plan.cycle === 'yearly') expires.setFullYear(expires.getFullYear() + 1)
        else expires.setMonth(expires.getMonth() + 1)
        setStatus({
          activePlanId: plan.id,
          expiresAt: expires.toISOString(),
          isInTrial: false,
          autoRenew: true,
        })
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          reason:
            error instanceof Error
              ? error.message
              : 'No pudimos completar la compra. Reintentá en un momento.',
        }
      } finally {
        setIsPurchasing(false)
      }
    },
    [],
  )

  const startFreeTrial = useCallback(
    async (plan: BillingPlan): Promise<{ ok: true }> => {
      setIsPurchasing(true)
      await new Promise((resolve) => setTimeout(resolve, 400))
      const now = new Date()
      const expires = new Date(now)
      expires.setDate(expires.getDate() + 14)
      setStatus({
        activePlanId: plan.id,
        expiresAt: expires.toISOString(),
        isInTrial: true,
        autoRenew: false,
      })
      setIsPurchasing(false)
      return { ok: true }
    },
    [],
  )

  return {
    status,
    isPurchasing,
    purchasePlan,
    startFreeTrial,
  }
}
