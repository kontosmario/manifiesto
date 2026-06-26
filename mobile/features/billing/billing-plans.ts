/**
 * Billing — fuente de verdad de los planes de Manifiesto.
 *
 * Pricing reasoning (2026-05-06):
 * - Manifiesto entrega coordinación financiera familiar real (familia
 *   como unidad operativa, no per-user), motor de presupuesto diario
 *   con buffer, ciclo de cobro, asistente con señales ranqueadas,
 *   metas de ahorro, push contextuales y dual-currency USD/ARS.
 * - Comparables: YNAB USD 14.99 / Monarch USD 14.99 / Goodbudget USD 8.
 *   En LatAm ese rango es prohibitivo. Sweet spot: "lo pago para mi
 *   hogar sin pensarlo" → ~USD 4-5 / mes.
 * - Anual con ahorro ~33% es el anchor; el cap 2 vs 4 cuentas no es
 *   solo precio: el anual habilita familia extendida (abuelos, hijos
 *   mayores). Eso lo vuelve un upgrade emocional, no solo monetario.
 *
 * Si más adelante se conecta RevenueCat/Stripe, estos `productId`
 * son los que el SDK debe mapear (App Store Connect / Play Console).
 *
 * i18n: los campos user-facing (`name`, `tagline`, `effectiveCopy`,
 * `highlights`) se resuelven vía `i18n.t` con getters, así reflejan el idioma
 * activo en cada acceso (los consumidores siguen leyendo `plan.name`).
 */
import i18n from '@/lib/i18n'

export type BillingCycle = 'monthly' | 'yearly'

export type BillingPlanId = 'hogar-mensual' | 'hogar-anual'

export interface BillingPlan {
  id: BillingPlanId
  cycle: BillingCycle
  /** Producto en App Store Connect / Play Console (placeholder hasta wiring). */
  productId: string
  /** Etiqueta visible (ES). */
  name: string
  /** Subtítulo corto que aparece bajo el nombre. */
  tagline: string
  /** Precio nominal en USD (sin redondear). */
  priceUsd: number
  /** Precio sugerido en ARS — referencial; el listing real lo decide la store. */
  priceArs: number
  /** Cantidad máxima de cuentas activas en el hogar. */
  memberCap: number
  /** % de ahorro vs mensual (0 para mensual). */
  savingsPercent: number
  /** Ahorro absoluto vs 12 × mensual en USD (0 para mensual). */
  savingsUsd: number
  /** Texto debajo del precio mostrando el costo efectivo. */
  effectiveCopy?: string
  /** Lista de features destacadas para esta tier. */
  highlights: readonly string[]
  /** Marca el plan como recomendado para resaltarlo en la UI. */
  recommended: boolean
}

/** Features base (compartidas por ambos planes), resueltas en el idioma activo. */
function featuresBase(): string[] {
  return i18n.t('billing:features.base', { returnObjects: true }) as string[]
}

export const BILLING_PLANS: Readonly<Record<BillingPlanId, BillingPlan>> = {
  'hogar-mensual': {
    id: 'hogar-mensual',
    cycle: 'monthly',
    productId: 'com.manifiesto.app.subscription.monthly',
    get name() {
      return i18n.t('billing:plans.hogar-mensual.name')
    },
    get tagline() {
      return i18n.t('billing:plans.hogar-mensual.tagline')
    },
    priceUsd: 4.99,
    priceArs: 5490,
    memberCap: 2,
    savingsPercent: 0,
    savingsUsd: 0,
    get highlights() {
      return [
        i18n.t('billing:features.monthlyMembers'),
        ...featuresBase(),
        i18n.t('billing:features.monthlyCancel'),
      ]
    },
    recommended: false,
  },
  'hogar-anual': {
    id: 'hogar-anual',
    cycle: 'yearly',
    productId: 'com.manifiesto.app.subscription.yearly',
    get name() {
      return i18n.t('billing:plans.hogar-anual.name')
    },
    get tagline() {
      return i18n.t('billing:plans.hogar-anual.tagline')
    },
    priceUsd: 39.99,
    priceArs: 43990,
    memberCap: 4,
    savingsPercent: 33,
    savingsUsd: 19.89,
    get effectiveCopy() {
      return i18n.t('billing:plans.hogar-anual.effectiveCopy')
    },
    get highlights() {
      return [
        i18n.t('billing:features.annualMembers'),
        ...featuresBase(),
        i18n.t('billing:features.annualPriority'),
        i18n.t('billing:features.annualEarlyAccess'),
      ]
    },
    recommended: true,
  },
}

export const BILLING_TRIAL_DAYS = 30

export function getBillingPlan(cycle: BillingCycle): BillingPlan {
  return cycle === 'yearly'
    ? BILLING_PLANS['hogar-anual']
    : BILLING_PLANS['hogar-mensual']
}
