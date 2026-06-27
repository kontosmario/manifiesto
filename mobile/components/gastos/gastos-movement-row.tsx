// Row del SectionList del feed de Gastos. Maneja los dos kinds en una
// sola sola superficie: income (chrome = IncomeRow, color verde, pill
// según kind) y expense (chrome = GastoRow, who-paid avatar, category
// pill). Ambos van wrapeados en SwipeRow para swipe-to-delete con la
// misma a11y/haptics.
//
// Extraído del `renderItem` inline de `gastos-v2-screen.tsx` para que la
// screen quede como orquestador y la lógica de presentación de cada row
// viva con el resto de los componentes de Gastos. El gate de animación
// (`rowAnimationEnabled`) se pasa como prop así la screen lo controla
// con el flag local que se prende solo en filter changes / mutations.
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { GastoRow } from '@/components/gastos/gasto-row'
import { IncomeRow } from '@/components/gastos/income-row'
import { SwipeRow, type SwipeAction } from '@/components/ui/swipe-row'
import {
  composeRowA11yLabel,
  formatTime,
  incomeKindFallback,
  type MovementItem,
} from '@/features/gastos/gastos-helpers'
import { useAppTheme } from '@/theme/theme-provider'
import type { CategoryLite } from '@/features/gastos/gastos-aggregates.model'

interface MemberLike {
  id: string
  name: string
  color: string
}

export interface GastosMovementRowProps {
  movement: MovementItem
  categoriesById: Map<string, CategoryLite>
  memberById: Map<string, MemberLike>
  /** Whether the entering/layout animation drivers should fire. Flipped
   *  on for ~500ms after filter / mutation, off the rest of the time so
   *  cold mount + virtualized scroll recycle don't contend with the
   *  240ms native tab-switch. */
  animationEnabled: boolean
  /** Whether the expense delete mutation for THIS item is in flight.
   *  Already de-duped by the screen against `mutation.variables`. */
  isExpenseDeleting: boolean
  /** Whether the income delete mutation for THIS item is in flight. */
  isIncomeDeleting: boolean
  onDeleteExpense: (id: string) => void
  onDeleteIncome: (id: string) => void
}

export function GastosMovementRow({
  movement,
  categoriesById,
  memberById,
  animationEnabled,
  isExpenseDeleting,
  isIncomeDeleting,
  onDeleteExpense,
  onDeleteIncome,
}: GastosMovementRowProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()

  if (movement.kind === 'income') {
    const income = movement.income
    const who = memberById.get(income.created_by)
    const title = income.description?.trim() || incomeKindFallback(income.kind)
    const incomeActions: SwipeAction[] = [
      {
        label: t('common:actions.delete'),
        tone: 'danger',
        icon: 'delete',
        onPress: () => onDeleteIncome(income.id),
      },
    ]
    return (
      <Animated.View
        style={styles.rowWrap}
        entering={animationEnabled ? FadeIn.duration(180) : undefined}
        exiting={FadeOut.duration(140)}
        layout={animationEnabled ? LinearTransition.duration(220) : undefined}
      >
        <SwipeRow
          accessibilityLabel={t('gastos:movementRow.incomeA11yLabel', { title })}
          accessibilityHint={t('gastos:movementRow.swipeToDeleteHint')}
          accessibilityActions={[{ name: 'delete', label: t('common:actions.delete') }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'delete') {
              onDeleteIncome(income.id)
            }
          }}
          rightActions={incomeActions}
          isProcessing={isIncomeDeleting}
        >
          <IncomeRow
            title={title}
            kind={income.kind}
            whoName={who?.name ?? t('gastos:movementRow.someone')}
            whoColor={who?.color ?? '#329315'}
            amount={Math.round(Math.abs(Number(income.amount ?? 0)))}
            time={formatTime(income.created_at)}
          />
        </SwipeRow>
      </Animated.View>
    )
  }

  const item = movement.expense
  const cat = categoriesById.get(item.category_id)
  const who = memberById.get(item.created_by)
  const actions: SwipeAction[] = [
    {
      label: t('common:actions.delete'),
      tone: 'danger',
      icon: 'delete',
      onPress: () => onDeleteExpense(item.id),
    },
  ]
  const a11yLabel = composeRowA11yLabel({
    title: item.description || cat?.name || t('common:terms.expense'),
    categoryName: cat?.name ?? t('gastos:movementRow.noCategory'),
    whoName: who?.name ?? t('gastos:movementRow.someone'),
    amount: Math.abs(Number(item.price ?? 0)),
    iso: item.created_at,
  })
  return (
    // Wrapping en Animated.View con entering/exiting + layout hace que
    // los filter changes (category pill, day selection) se sientan
    // smooth en vez de snap. `entering` + `layout` están gated por
    // `animationEnabled` así cold mount + virtualized scroll recycle
    // no firen worklets que contiendan con la tab transition.
    // `exiting` queda on unconditionally porque FlatList sólo unmountea
    // una cell cuando su key sale del `data` (filter change o real
    // delete) — recycle reusa el mismo mount, así el cost queda bounded
    // a real removals.
    <Animated.View
      style={styles.rowWrap}
      entering={animationEnabled ? FadeIn.duration(180) : undefined}
      exiting={FadeOut.duration(140)}
      layout={animationEnabled ? LinearTransition.duration(220) : undefined}
    >
      <SwipeRow
        accessibilityLabel={a11yLabel}
        accessibilityHint={t('gastos:movementRow.swipeToDeleteHint')}
        accessibilityActions={[{ name: 'delete', label: t('common:actions.delete') }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'delete') {
            onDeleteExpense(item.id)
          }
        }}
        rightActions={actions}
        isProcessing={isExpenseDeleting}
      >
        <GastoRow
          title={item.description || cat?.name || t('common:terms.expense')}
          categoryName={cat?.name ?? t('gastos:movementRow.noCategory')}
          // Ícono por crudo (no localizado); el display sigue en `cat.name`.
          categoryRawName={cat?.rawName}
          categoryColor={cat?.color ?? theme.colors.textMuted}
          whoName={who?.name ?? t('gastos:movementRow.someone')}
          whoColor={who?.color ?? '#329315'}
          amount={-Math.abs(Number(item.price ?? 0))}
          time={formatTime(item.created_at)}
          notes={item.notes}
        />
      </SwipeRow>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  rowWrap: { paddingTop: 6 },
})
