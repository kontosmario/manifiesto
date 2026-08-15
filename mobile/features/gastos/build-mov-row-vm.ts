// Builder puro del view-model de una fila de movimiento (gasto o ingreso).
//
// Extraído de `MovementRow` (neo-gastos-screen.tsx) para que el feed vivo
// y el feed de solo lectura de una edición cerrada construyan EXACTAMENTE
// el mismo `MovRowVM` que consume `GastosMovRow` — sin duplicar
// emoji/tile/title/sub/amount/catName en dos lugares. Sin side effects:
// `t` se recibe por parámetro en vez de importar i18n adentro.
import type { TFunction } from 'i18next'
import { formatMoney } from '@/utils/money'
import { INCOME_KIND_BY_KEY } from '@/features/income/income-kinds'
import { incomeKindFallback, type MovementItem } from '@/features/gastos/gastos-helpers'
import type { CategoryLite } from '@/features/gastos/gastos-aggregates.model'
import type { MovRowVM } from '@/components/redesign/gastos/gastos-screen'

// Signo menos "real" (U+2212) — mismo carácter que usa el resto del feed
// (total del día, resumen del ciclo) en vez del guion ASCII.
const MINUS = '−'

/** Forma exacta del value de `memberById` que hoy recibe `MovementRow`
 *  (antes un tipo anónimo inline en `neo-gastos-screen.tsx`). */
export interface MovementRowMemberLite {
  id: string
  name: string
  color: string
}

export interface BuildMovRowVMInput {
  item: MovementItem
  categoriesById: Map<string, CategoryLite>
  memberById: Map<string, MovementRowMemberLite>
  t: TFunction
}

export function buildMovRowVM({
  item,
  categoriesById,
  memberById,
  t,
}: BuildMovRowVMInput): MovRowVM {
  if (item.kind === 'expense') {
    const e = item.expense
    const cat = categoriesById.get(e.category_id)
    const who = memberById.get(e.created_by)
    const whoName = who?.name || t('gastos:movementRow.someone')
    const catLabel = cat?.name || t('gastos:movementRow.noCategory')
    return {
      kind: 'expense',
      emoji: '🧾',
      tile: 'mint',
      title: e.description?.trim() || cat?.name || t('common:terms.expense'),
      sub: `${whoName} · ${catLabel}`,
      amount: `${MINUS}${formatMoney(e.price)}`,
      // rawName CRUDO para el sticker real (CategoryIcon del kit).
      catName: cat?.rawName ?? cat?.name,
      // `note` NO va acá: `GastosMovRow` la pintaría DENTRO del SwipeRow
      // (overflow:hidden, radio 22) y la esquina redondeada le comía la
      // primera letra. La arma el caller, como hermana de la tarjeta.
    }
  }
  const income = item.income
  const who = memberById.get(income.created_by)
  const whoName = who?.name || t('gastos:movementRow.someone')
  const kindLabel = incomeKindFallback(income.kind)
  return {
    kind: 'income',
    emoji: INCOME_KIND_BY_KEY[income.kind]?.emoji ?? '💵',
    tile: 'mint',
    title: income.description?.trim() || kindLabel,
    sub: `${whoName} · ${kindLabel}`,
    amount: `+${formatMoney(income.amount)}`,
    // Sin categoría → el kit cae al emoji del kind.
    catName: undefined,
  }
}
