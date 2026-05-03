import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { RiseView } from '@/components/home/animated/rise-view'
import { SwipeableRow, type SwipeAction } from '@/components/ui/swipeable-row'
import { GastoRow } from '@/components/gastos/gasto-row'
import type { GastosGroup, CategoryLite } from '@/features/gastos/gastos-aggregates.model'
import { motionStagger } from '@/lib/motion'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

export interface FamilyMemberLite {
  id: string
  name: string
  color: string
}

export type GastosEmptyStateKind = 'global' | 'cycle' | 'filtered'

export interface GastosEmptyStatePayload {
  kind: GastosEmptyStateKind
  primary: string
  secondary?: string
  /** When provided, renders an inline button with the action. */
  actionLabel?: string
  onAction?: () => void
}

interface GastosMovimientosProps {
  groups: GastosGroup[]
  categoriesById: Map<string, CategoryLite>
  familyMembers: FamilyMemberLite[]
  onDelete?: (expenseId: string) => void
  onEdit?: (expenseId: string) => void
  /** Expense id currently being mutated (delete or edit in flight). */
  pendingExpenseId?: string | null
  /** Empty-state payload shown only when `groups` is empty. Three
   *  semantically-distinct variants (audit §4.3):
   *    - `global`   → no expenses ever, CTA al add-expense flow.
   *    - `cycle`    → ciclo joven, sin acción, copy de "esperar".
   *    - `filtered` → filtros activos, CTA "Limpiar filtros".
   *  Cuando es `null` y la lista está vacía no se muestra nada (caso
   *  defensivo — el screen siempre debería pasar uno de los 3). */
  emptyState?: GastosEmptyStatePayload | null
}

/**
 * "Movimientos" section — title + swipe hint eyebrow, followed by
 * groups of expenses per day. Each expense row is a GastoRow wrapped
 * in the shared SwipeableRow so swipe-to-delete matches the Home
 * activity rows (same radius + outer clip).
 */
export function GastosMovimientos({
  groups,
  categoriesById,
  familyMembers,
  onDelete,
  onEdit,
  pendingExpenseId,
  emptyState,
}: GastosMovimientosProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Movimientos</Text>
        {groups.length > 0 ? (
          <Text
            style={[styles.swipeHint, { color: theme.colors.textMuted }]}
            accessibilityRole="text"
          >
            ‹ Desliza para acciones
          </Text>
        ) : null}
      </View>

      {groups.length === 0 && emptyState ? (
        <View
          style={[
            styles.emptyCard,
            {
              backgroundColor: theme.colors.creamCard,
              borderColor: theme.colors.line,
            },
          ]}
          accessibilityRole="text"
          accessibilityLabel={`${emptyState.primary}. ${emptyState.secondary ?? ''}`}
        >
          <View style={[styles.emptyIcon, { backgroundColor: theme.colors.primarySurface }]}>
            <MaterialIcons
              name={
                emptyState.kind === 'global'
                  ? 'add-circle-outline'
                  : emptyState.kind === 'filtered'
                    ? 'filter-alt-off'
                    : 'hourglass-empty'
              }
              size={20}
              color={theme.colors.primary}
            />
          </View>
          <View style={styles.emptyText}>
            <Text style={[styles.emptyPrimary, { color: theme.colors.text }]}>
              {emptyState.primary}
            </Text>
            {emptyState.secondary ? (
              <Text
                style={[styles.emptySecondary, { color: theme.colors.textMuted }]}
                maxFontSizeMultiplier={1.4}
              >
                {emptyState.secondary}
              </Text>
            ) : null}
          </View>
          {emptyState.actionLabel && emptyState.onAction ? (
            <Pressable
              onPress={emptyState.onAction}
              accessibilityRole="button"
              accessibilityLabel={emptyState.actionLabel}
              hitSlop={6}
              style={({ pressed }) => [
                styles.emptyAction,
                {
                  backgroundColor: theme.colors.primarySurface,
                  borderColor: theme.colors.line,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[styles.emptyActionText, { color: theme.colors.primary }]}>
                {emptyState.actionLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.groups}>
        {groups.map((group, gi) => (
          // Stagger by `motionStagger.listItem` (40ms) per group with a
          // base of 60ms — the first group lands fast, subsequent ones
          // cascade in a clear visual rhythm. Cap at 240ms (8 groups)
          // so long lists don't have a noticeably slow finish.
          <RiseView
            key={`${group.label}-${gi}`}
            delay={Math.min(60 + gi * motionStagger.listItem, 240)}
          >
            <View style={styles.group}>
              <View style={styles.groupHeader}>
                <View>
                  <Text style={[styles.groupLabel, { color: theme.colors.text }]}>{group.label}</Text>
                  <Text style={[styles.groupMeta, { color: theme.colors.textSoft }]}>
                    {group.items.length} movimiento{group.items.length === 1 ? '' : 's'}
                  </Text>
                </View>
                <Text style={[styles.groupTotal, { color: theme.colors.text }]}>
                  -{formatMoney(group.total)}
                </Text>
              </View>
              <View style={styles.groupList}>
                {group.items.map((expense) => {
                  const cat = categoriesById.get(expense.category_id)
                  const who = familyMembers.find((m) => m.id === expense.created_by)
                  const actions = buildActions(expense.id, onEdit, onDelete)
                  const isPending = pendingExpenseId === expense.id
                  // Compose a screen-reader label: title + amount +
                  // who-paid + category + time. VoiceOver reads it as
                  // a single sentence instead of fragmenting per text
                  // node.
                  const a11yLabel = composeRowA11yLabel({
                    title: expense.description || cat?.name || 'Gasto',
                    categoryName: cat?.name ?? 'Sin categoría',
                    whoName: who?.name ?? 'Alguien',
                    amount: Math.abs(Number(expense.price ?? 0)),
                    iso: expense.created_at,
                  })
                  // Pre-compute accessibilityActions so VoiceOver users
                  // can invoke delete/edit through the rotor instead of
                  // the gesture (which they can't perform).
                  const accessibilityActions = actions.map((a) => ({
                    name: a.tone === 'danger' ? 'delete' : 'edit',
                    label: a.label,
                  }))
                  return (
                    <SwipeableRow
                      key={expense.id}
                      accessibilityLabel={a11yLabel}
                      accessibilityHint="Desliza a la izquierda para editar o eliminar"
                      accessibilityActions={accessibilityActions}
                      onAccessibilityAction={(event) => {
                        const action = actions.find(
                          (a) =>
                            (event.nativeEvent.actionName === 'delete' && a.tone === 'danger') ||
                            (event.nativeEvent.actionName === 'edit' && a.tone === 'neutral'),
                        )
                        action?.onPress()
                      }}
                      rightActions={actions}
                      isProcessing={isPending}
                    >
                      <GastoRow
                        title={expense.description || cat?.name || 'Gasto'}
                        categoryName={cat?.name ?? 'Sin categoría'}
                        categoryColor={cat?.color ?? theme.colors.textMuted}
                        whoName={who?.name ?? 'Alguien'}
                        whoColor={who?.color ?? '#329315'}
                        amount={-Math.abs(Number(expense.price ?? 0))}
                        time={formatTime(expense.created_at)}
                      />
                    </SwipeableRow>
                  )
                })}
              </View>
            </View>
          </RiseView>
        ))}
      </View>
    </View>
  )
}

function buildActions(
  expenseId: string,
  onEdit?: (id: string) => void,
  onDelete?: (id: string) => void,
): SwipeAction[] {
  const actions: SwipeAction[] = []
  if (onEdit) {
    actions.push({
      label: 'Editar',
      tone: 'neutral',
      icon: 'edit',
      onPress: () => onEdit(expenseId),
    })
  }
  if (onDelete) {
    actions.push({
      label: 'Eliminar',
      tone: 'danger',
      icon: 'delete',
      onPress: () => onDelete(expenseId),
    })
  }
  return actions
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function composeRowA11yLabel(args: {
  title: string
  categoryName: string
  whoName: string
  amount: number
  iso: string
}): string {
  const time = formatTime(args.iso)
  return `${args.title}, ${args.amount} pesos en ${args.categoryName}, cargado por ${args.whoName} a las ${time}.`
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  swipeHint: { fontSize: 11 },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
  },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { flex: 1, gap: 2 },
  emptyPrimary: { fontSize: 14, fontWeight: '700' },
  emptySecondary: { fontSize: 12, lineHeight: 16 },
  emptyAction: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyActionText: { fontSize: 12, fontWeight: '700' },
  groups: { gap: 14 },
  group: {},
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 2,
    paddingBottom: 6,
  },
  groupLabel: { fontSize: 14, fontWeight: '700' },
  groupMeta: { fontSize: 11 },
  groupTotal: { fontSize: 14, fontWeight: '800' },
  groupList: { gap: 6 },
})
