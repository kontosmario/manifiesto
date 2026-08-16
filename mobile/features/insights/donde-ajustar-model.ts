import type { Category } from '@/features/categories/use-categories'
import type { Expense } from '@/features/expenses/use-expenses'

/**
 * Modelo PURO del sheet "Dónde ajustar" — el diagnóstico que abre el hero de
 * Control (estados ajustado/corto) y la alcancía sin sobrante.
 *
 * Nace de un pedido explícito del dueño (2026-08-16): esos CTAs prometían un
 * diagnóstico ("Dónde ajustar", "En qué recortar", "Ver en qué se fue") y
 * navegaban al ADMINISTRADOR del catálogo de categorías — cero montos, cero
 * respuesta. Este modelo responde las dos preguntas de verdad:
 *
 *   1. ¿Cuánto tengo que cambiar? → nuevo cupo por día para llegar al cierre.
 *   2. ¿Dónde está la plata? → top categorías VARIABLES del ciclo, por monto.
 *
 * Separado de la UI para que los números sean testeables sin renderer —
 * mismo patrón que `neo-control-view-model` y `review-validation`.
 */

export type DondeAjustarMode = 'corto' | 'ajustado' | 'sinSobrante'

export interface DondeAjustarInput {
  mode: DondeAjustarMode
  /** Gastos de la familia (el cache completo; el modelo recorta al ciclo). */
  expenses: readonly Expense[]
  categories: readonly Category[]
  /** Ventana del ciclo actual, `[start, end)`. */
  cycleStart: Date
  cycleEnd: Date
  /** Presupuesto variable que queda del ciclo (puede ser negativo). */
  restanteMes: number
  /** Proyección de sobrante al cierre (negativo = faltante proyectado). */
  sobrante: number
  diasRestantes: number
  /** Ritmo de gasto actual ($/día, promedio robusto del ciclo). */
  promedioDiario: number
  fijosMes: number
  ingresoMes: number
}

export interface DondeAjustarCategoryRow {
  id: string
  displayName: string
  amount: number
  /** Participación 0-100 sobre el gasto variable del ciclo. */
  sharePct: number
}

export interface DondeAjustarModel {
  mode: DondeAjustarMode
  /** |sobrante| — el faltante (corto) o el margen (ajustado). */
  headlineAmount: number
  /**
   * Cupo por día para llegar al cierre: `max(0, restanteMes)/diasRestantes`.
   * `null` cuando no hay días por delante (cierre hoy) — ahí no hay ritmo
   * que corregir, sólo el CTA de revisar los gastos.
   */
  nuevoCupo: number | null
  /** `true` cuando ya no queda presupuesto: todo gasto nuevo agranda el rojo. */
  cupoAgotado: boolean
  /** Ritmo actual, para contrastar con `nuevoCupo`. */
  ritmoActual: number
  /** Top categorías variables del ciclo por monto, mayor primero. */
  topCategories: DondeAjustarCategoryRow[]
  /** Suma de las categorías fuera del top (0 si entraron todas). */
  otherAmount: number
  /** Gasto variable total del ciclo. */
  totalVariable: number
  /** Participación de los fijos sobre el ingreso, 0-100 (0 si no hay ingreso). */
  fijosPct: number
  /** `true` cuando los fijos pesan ≥35% del ingreso — mismo umbral que el
   *  reparto de Control (`fijosAltos`). */
  showFijosWarning: boolean
}

/** Umbral compartido con `selectRepartoVariant` ('fijosAltos'). */
const FIJOS_WARNING_PCT = 35
const TOP_CATEGORIES = 4

export function buildDondeAjustarModel(input: DondeAjustarInput): DondeAjustarModel {
  const {
    mode,
    expenses,
    categories,
    cycleStart,
    cycleEnd,
    restanteMes,
    sobrante,
    diasRestantes,
    promedioDiario,
    fijosMes,
    ingresoMes,
  } = input

  const startMs = cycleStart.getTime()
  const endMs = cycleEnd.getTime()

  // Mismo criterio que `groupExpensesByCategory` de control-signals: los
  // fijos (commitment_id) quedan afuera —no son "ajustables" desde acá— y
  // los precios no finitos o negativos se descartan para no contaminar
  // los totales.
  const byId = new Map<string, number>()
  for (const expense of expenses) {
    if (expense.commitment_id) continue
    const price = Number(expense.price ?? 0)
    if (!Number.isFinite(price) || price < 0) continue
    const createdMs = new Date(expense.created_at).getTime()
    if (Number.isNaN(createdMs) || createdMs < startMs || createdMs >= endMs) continue
    byId.set(expense.category_id, (byId.get(expense.category_id) ?? 0) + price)
  }

  const totalVariable = Array.from(byId.values()).reduce((acc, v) => acc + v, 0)

  const ranked = Array.from(byId.entries())
    .map(([id, amount]) => {
      const cat = categories.find((c) => c.id === id)
      return {
        id,
        displayName: cat?.displayName ?? cat?.name ?? '',
        amount,
        sharePct:
          totalVariable > 0 ? Math.round((amount / totalVariable) * 100) : 0,
      }
    })
    .sort((a, b) => b.amount - a.amount)

  const topCategories = ranked.slice(0, TOP_CATEGORIES)
  const otherAmount = ranked
    .slice(TOP_CATEGORIES)
    .reduce((acc, row) => acc + row.amount, 0)

  const safeDias = Math.max(0, Math.floor(diasRestantes))
  const nuevoCupo =
    safeDias > 0 ? Math.max(0, restanteMes) / safeDias : null

  const fijosPct =
    ingresoMes > 0
      ? Math.round((Math.max(0, fijosMes) / ingresoMes) * 100)
      : 0

  return {
    mode,
    headlineAmount: Math.abs(sobrante),
    nuevoCupo,
    cupoAgotado: restanteMes <= 0,
    ritmoActual: Math.max(0, promedioDiario),
    topCategories,
    otherAmount,
    totalVariable,
    fijosPct,
    showFijosWarning: fijosPct >= FIJOS_WARNING_PCT,
  }
}
