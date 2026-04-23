import { StyleSheet, Text, View } from 'react-native'
import { RiseView } from '@/components/home/animated/rise-view'
import { SwipeableRow, type SwipeAction } from '@/components/ui/swipeable-row'
import { GastoRow } from '@/components/gastos/gasto-row'
import type { GastosGroup, CategoryLite } from '@/features/gastos/gastos-aggregates.model'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

export interface FamilyMemberLite {
  id: string
  name: string
  color: string
}

interface GastosMovimientosProps {
  groups: GastosGroup[]
  categoriesById: Map<string, CategoryLite>
  familyMembers: FamilyMemberLite[]
  onDelete?: (expenseId: string) => void
  onEdit?: (expenseId: string) => void
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
}: GastosMovimientosProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Movimientos</Text>
        <Text style={[styles.swipeHint, { color: theme.colors.textMuted }]}>
          ‹ Desliza para acciones
        </Text>
      </View>

      {groups.length === 0 ? (
        <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
          No hay movimientos para este filtro.
        </Text>
      ) : null}

      <View style={styles.groups}>
        {groups.map((group, gi) => (
          <RiseView key={`${group.label}-${gi}`} delay={400 + gi * 60}>
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
                {group.items.map((expense, i) => {
                  const cat = categoriesById.get(expense.category_id)
                  const who = familyMembers.find((m) => m.id === expense.created_by)
                  const actions: SwipeAction[] = []
                  if (onEdit) {
                    actions.push({
                      label: 'Editar',
                      tone: 'neutral',
                      onPress: () => onEdit(expense.id),
                    })
                  }
                  if (onDelete) {
                    actions.push({
                      label: 'Eliminar',
                      tone: 'danger',
                      onPress: () => onDelete(expense.id),
                    })
                  }
                  return (
                    <SwipeableRow
                      key={expense.id}
                      accessibilityHint="Desliza a la izquierda para editar o eliminar"
                      rightActions={actions}
                    >
                      <GastoRow
                        title={expense.description || cat?.name || 'Gasto'}
                        categoryName={cat?.name ?? 'Sin categoría'}
                        categoryColor={cat?.color ?? theme.colors.textMuted}
                        whoName={who?.name ?? 'Alguien'}
                        whoColor={who?.color ?? '#2E7D5B'}
                        amount={-Math.abs(Number(expense.price ?? 0))}
                        time={formatTime(expense.created_at)}
                        delay={480 + i * 50}
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

function formatTime(iso: string): string {
  const d = new Date(iso)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  swipeHint: { fontSize: 11 },
  emptyText: { fontSize: 13, marginTop: 6 },
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
