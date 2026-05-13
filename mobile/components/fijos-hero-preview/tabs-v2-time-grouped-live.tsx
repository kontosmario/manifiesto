import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import { RiseRow } from './smart-alerts-helpers'
import { FijoRowMini } from './fijo-row-mini'
import { buildFijoList, type FijoItem } from './fijo-list-sample'
import type { HeroState } from './hero-states'

interface TabsV2TimeGroupedLiveProps {
  state: HeroState
}

/**
 * Variant D · Time-grouped. SIN TABS de status. Agrupa por TIEMPO:
 *   · VENCIDO         (past due, not paid)
 *   · HOY · MAÑANA    (urgency immediate)
 *   · ESTA SEMANA     (1-7 days)
 *   · DESPUÉS         (8+ days)
 *   · PAGADOS         (status=paid)
 *
 * El usuario no piensa "filtros" → piensa "qué tengo que pagar HOY?
 * qué viene esta semana?". El time-grouping refleja la pregunta real.
 *
 * Las secciones vacías se omiten. Cada sección tiene su own eyebrow
 * + count + suma.
 */
export function TabsV2TimeGroupedLive({ state }: TabsV2TimeGroupedLiveProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const items = buildFijoList(state)

  const groups = groupByTime(items)

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
      {groups.length === 0 ? (
        <RiseRow delay={0}>
          <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
            Sin fijos cargados todavía.
          </Text>
        </RiseRow>
      ) : (
        groups.map((g, gIdx) => (
          <View
            key={g.id}
            style={[styles.group, gIdx > 0 ? styles.groupGap : null]}
          >
            <RiseRow delay={gIdx * 80}>
              <View style={styles.groupHeader}>
                <Text style={[styles.eyebrow, { color: g.eyebrowColor(palette, theme.isDark) }]}>
                  {g.label}
                </Text>
                <Text
                  style={[
                    styles.headerMeta,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  {g.items.length} · {formatBucketAmount(g.items.reduce((s, i) => s + i.amount, 0))}
                </Text>
              </View>
              <View
                style={[styles.rule, { backgroundColor: g.eyebrowColor(palette, theme.isDark) }]}
              />
            </RiseRow>
            <View style={styles.list}>
              {g.items.map((item, idx) => (
                <View key={item.id}>
                  <FijoRowMini
                    item={item}
                    dimmed={g.id === 'pagados'}
                    trailingLabel={g.trailingFor(item)}
                  />
                  {idx < g.items.length - 1 ? (
                    <View
                      style={[styles.divider, { backgroundColor: theme.colors.line }]}
                    />
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ))
      )}
    </View>
  )
}

interface TimeGroup {
  id: 'vencido' | 'hoy_manana' | 'esta_semana' | 'despues' | 'pagados'
  label: string
  items: FijoItem[]
  eyebrowColor: (
    palette: ReturnType<typeof buildProximosPalette>,
    isDark: boolean,
  ) => string
  trailingFor: (item: FijoItem) => string | undefined
}

function groupByTime(items: FijoItem[]): TimeGroup[] {
  const vencido = items.filter((i) => i.status === 'overdue')
  const hoyManana = items.filter(
    (i) => i.status === 'pending' && i.daysUntil >= 0 && i.daysUntil <= 1,
  )
  const semana = items.filter(
    (i) => i.status === 'pending' && i.daysUntil >= 2 && i.daysUntil <= 7,
  )
  const despues = items.filter((i) => i.status === 'pending' && i.daysUntil > 7)
  const pagados = items.filter((i) => i.status === 'paid')

  const groups: TimeGroup[] = []
  if (vencido.length > 0) {
    groups.push({
      id: 'vencido',
      label: 'VENCIDO',
      items: vencido.sort((a, b) => a.daysUntil - b.daysUntil),
      eyebrowColor: (p) => p.urgencyStrong,
      trailingFor: (i) =>
        `HACE ${Math.abs(i.daysUntil)}${Math.abs(i.daysUntil) === 1 ? ' DÍA' : ' DÍAS'}`,
    })
  }
  if (hoyManana.length > 0) {
    groups.push({
      id: 'hoy_manana',
      label: 'HOY · MAÑANA',
      items: hoyManana.sort((a, b) => a.daysUntil - b.daysUntil),
      eyebrowColor: (p) => p.urgency,
      trailingFor: (i) => (i.daysUntil === 0 ? 'HOY' : 'MAÑANA'),
    })
  }
  if (semana.length > 0) {
    groups.push({
      id: 'esta_semana',
      label: 'ESTA SEMANA',
      items: semana.sort((a, b) => a.daysUntil - b.daysUntil),
      eyebrowColor: (p) => p.barMid,
      trailingFor: (i) => `EN ${i.daysUntil}D`,
    })
  }
  if (despues.length > 0) {
    groups.push({
      id: 'despues',
      label: 'DESPUÉS',
      items: despues.sort((a, b) => a.daysUntil - b.daysUntil),
      eyebrowColor: (_p, isDark) => (isDark ? '#A6EF8F' : '#3B6D57'),
      trailingFor: (i) => `EN ${i.daysUntil}D`,
    })
  }
  if (pagados.length > 0) {
    groups.push({
      id: 'pagados',
      label: 'PAGADOS',
      items: pagados,
      eyebrowColor: (p) => p.success,
      trailingFor: () => undefined,
    })
  }
  return groups
}

function formatBucketAmount(n: number): string {
  return `$ ${Math.round(n).toLocaleString('es-AR')}`
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
  },
  empty: {
    fontSize: 13,
    fontStyle: 'italic',
    fontWeight: '500',
    paddingVertical: 12,
  },
  group: {},
  groupGap: {
    marginTop: 18,
  },
  groupHeader: {
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
    marginTop: 8,
    marginBottom: 8,
    opacity: 0.55,
  },
  list: {
    gap: 0,
  },
  divider: {
    height: 1,
    opacity: 0.35,
  },
})
