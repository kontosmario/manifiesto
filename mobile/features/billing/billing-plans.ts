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
 */

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

const FEATURES_BASE = [
  'Una sola fuente de números, contigo y con quien sumes',
  'Te avisamos cuánto puedes gastar cada día',
  'Gastos fijos y cuotas ordenados en un solo lugar',
  'Metas de ahorro con seguimiento automático',
  'Avisos y recordatorios cuando algo importa',
  'Ves los gastos en pesos y en dólares',
  'Modo claro y modo oscuro, tus datos protegidos',
] as const

export const BILLING_PLANS: Readonly<Record<BillingPlanId, BillingPlan>> = {
  'hogar-mensual': {
    id: 'hogar-mensual',
    cycle: 'monthly',
    productId: 'com.manifiesto.app.subscription.monthly',
    name: 'Plan Mensual',
    tagline: 'Para empezar sin compromisos.',
    priceUsd: 4.99,
    priceArs: 5490,
    memberCap: 2,
    savingsPercent: 0,
    savingsUsd: 0,
    highlights: [
      'Hasta 2 personas en tu plan',
      ...FEATURES_BASE,
      'Cancelas cuando quieras',
    ],
    recommended: false,
  },
  'hogar-anual': {
    id: 'hogar-anual',
    cycle: 'yearly',
    productId: 'com.manifiesto.app.subscription.yearly',
    name: 'Plan Anual',
    tagline: 'El plan más elegido.',
    priceUsd: 39.99,
    priceArs: 43990,
    memberCap: 4,
    savingsPercent: 33,
    savingsUsd: 19.89,
    effectiveCopy: 'Te sale como USD 3.33 al mes',
    highlights: [
      'Hasta 4 personas, ideal para tu grupo familiar',
      ...FEATURES_BASE,
      'Atención prioritaria por correo',
      'Estrenas las nuevas funciones antes que nadie',
    ],
    recommended: true,
  },
}

export const BILLING_TRIAL_DAYS = 14

export function getBillingPlan(cycle: BillingCycle): BillingPlan {
  return cycle === 'yearly'
    ? BILLING_PLANS['hogar-anual']
    : BILLING_PLANS['hogar-mensual']
}
