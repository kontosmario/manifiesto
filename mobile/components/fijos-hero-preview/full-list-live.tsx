import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import { RiseRow } from './smart-alerts-helpers'
import { RowDayMarker } from './row-d-day-marker'
import { buildFijoList, type FijoItem } from './fijo-list-sample'
import type { HeroState } from './hero-states'

interface FullListLiveProps {
  state: HeroState
}

/**
 * Lista completa de fijos · grouping por categoría + smart sort
 * por urgencia dentro de cada grupo.
 *
 *   1. Header "TODOS LOS FIJOS · N ítems" + breakdown chips
 *   2. Por cada CATEGORÍA (orden: la que tiene más urgencia primero):
 *        · Sub-header: nombre · count · suma del grupo
 *        · Rows ordenadas por urgencia (overdue → pending d→∞ → paid)
 *        · Cada row es RowDayMarker con tap-expand (pagar/editar/eliminar)
 *
 * Restaura las acciones por item + la separación por categorías que
 * el owner extrañaba del FijoRow + FijoCategoryGroups originales.
 */
export function FullListLive({ state }: FullListLiveProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const items = buildFijoList(state)

  if (items.length === 0) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.creamCard,
            borderColor: theme.colors.line,
          },
        ]}
      >
        <RiseRow delay={0}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
            TODOS LOS FIJOS
          </Text>
        </RiseRow>
        <View style={[styles.rule, { backgroundColor: theme.colors.text }]} />
        <RiseRow delay={160}>
          <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
            Sin fijos cargados todavía. Tocá el + arriba para empezar.
          </Text>
        </RiseRow>
      </View>
    )
  }

  const groups = groupByCategory(items)
  const pendingSum = items
    .filter((i) => i.status !== 'paid')
    .reduce((s, i) => s + i.amount, 0)

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <RiseRow delay={0}>
        <View style={styles.headerRow}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
            TODOS LOS FIJOS
          </Text>
          <Text style={[styles.headerMeta, { color: theme.colors.textMuted }]}>
            {items.length} {items.length === 1 ? 'ítem' : 'ítems'}
          </Text>
        </View>
      </RiseRow>
      <View style={[styles.rule, { backgroundColor: theme.colors.text }]} />

      {/* Breakdown chips informativos */}
      <RiseRow delay={80}>
        <View style={styles.breakdownRow}>
          {state.cantidadVencidos > 0 ? (
            <BreakdownChip
              icon="warning"
              color={palette.urgencyStrong}
              text={`${state.cantidadVencidos} vencidos`}
            />
          ) : null}
          {state.cantidadPendientes > 0 ? (
            <BreakdownChip
              icon="schedule"
              color={palette.urgency}
              text={`${state.cantidadPendientes} por pagar`}
            />
          ) : null}
          {state.cantidadPagados > 0 ? (
            <BreakdownChip
              icon="check-circle"
              color={palette.success}
              text={`${state.cantidadPagados} pagados`}
            />
          ) : null}
          {pendingSum > 0 ? (
            <Text style={[styles.sumText, { color: theme.colors.text }]}>
              {' · '}
              {formatMoney(pendingSum)} por pagar
            </Text>
          ) : null}
        </View>
      </RiseRow>

      {/* Groups por categoría — ordenados por urgencia */}
      {groups.map((g, gIdx) => (
        <View key={g.category} style={styles.group}>
          <RiseRow delay={160 + gIdx * 100}>
            <View style={styles.groupHeader}>
              <View style={styles.groupHeaderLeft}>
                <View
                  style={[
                    styles.groupCatDot,
                    { backgroundColor: g.categoryColor },
                  ]}
                />
                <Text
                  style={[styles.groupName, { color: theme.colors.text }]}
                >
                  {g.category}
                </Text>
                <Text
                  style={[styles.groupCount, { color: theme.colors.textMuted }]}
                >
                  · {g.items.length}
                </Text>
              </View>
              <Text
                style={[styles.groupTotal, { color: theme.colors.textMuted }]}
              >
                {formatMoney(g.items.reduce((s, i) => s + i.amount, 0))}
              </Text>
            </View>
          </RiseRow>

          <View style={styles.groupList}>
            {g.items.map((item, idx) => (
              <View key={item.id}>
                <RiseRow delay={200 + gIdx * 100 + idx * 50}>
                  <RowDayMarker item={item} />
                </RiseRow>
                {idx < g.items.length - 1 ? (
                  <View
                    style={[
                      styles.divider,
                      { backgroundColor: theme.colors.line },
                    ]}
                  />
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

function BreakdownChip({
  icon,
  color,
  text,
}: {
  icon: 'warning' | 'schedule' | 'check-circle'
  color: string
  text: string
}) {
  return (
    <View style={styles.chip}>
      <MaterialIcons name={icon} size={12} color={color} />
      <Text style={[styles.chipText, { color }]}>{text}</Text>
    </View>
  )
}

interface CategoryGroup {
  category: string
  categoryColor: string
  items: FijoItem[]
  urgencyScore: number // for sorting groups
}

function groupByCategory(items: FijoItem[]): CategoryGroup[] {
  const map = new Map<string, FijoItem[]>()
  const colorByCat = new Map<string, string>()
  for (const item of items) {
    const list = map.get(item.category) ?? []
    list.push(item)
    map.set(item.category, list)
    if (!colorByCat.has(item.category)) {
      colorByCat.set(item.category, item.categoryColor)
    }
  }

  // Sort items within each group by urgency (overdue → pending → paid)
  const groups: CategoryGroup[] = []
  for (const [category, list] of map) {
    const sorted = [...list].sort((a, b) => urgencyScore(a) - urgencyScore(b))
    // urgencyScore del grupo: min de items (más urgente)
    const groupScore = Math.min(...sorted.map(urgencyScore))
    groups.push({
      category,
      categoryColor: colorByCat.get(category) ?? '#9FC9E4',
      items: sorted,
      urgencyScore: groupScore,
    })
  }

  // Order groups: those with overdue/urgent items first, paid-only groups last
  groups.sort((a, b) => a.urgencyScore - b.urgencyScore)
  return groups
}

function urgencyScore(item: FijoItem): number {
  if (item.status === 'overdue') return -1000 + item.daysUntil
  if (item.status === 'pending') return item.daysUntil
  return 10_000 + item.dayOfMonth // paid al fondo
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  headerMeta: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  rule: {
    width: 28,
    height: 2,
    marginTop: 10,
    marginBottom: 12,
    opacity: 0.55,
  },
  breakdownRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  sumText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  group: {
    marginBottom: 10,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 6,
    marginBottom: 2,
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  groupCatDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  groupName: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  groupCount: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  groupTotal: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  groupList: {
    gap: 0,
  },
  divider: {
    height: 1,
    opacity: 0.35,
  },
  empty: {
    fontSize: 13,
    fontStyle: 'italic',
    fontWeight: '500',
    paddingVertical: 12,
  },
})
