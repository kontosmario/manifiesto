import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import { RiseRow } from './smart-alerts-helpers'
import { RowDayMarker } from './row-d-day-marker'
import { buildFijoList } from './fijo-list-sample'
import type { HeroState } from './hero-states'

interface FullListLiveProps {
  state: HeroState
}

/**
 * Lista completa de fijos. Une los dos winners finales:
 *   Tabs v2 · E · Smart sort      → orden por urgencia, sin filtros
 *   FijoRow · D · Calendar marker → cada row con día del mes en caja
 *
 * Este componente reemplaza conceptualmente FijosTabs + FijoCategoryGroups
 * + FijoRow del screen viejo. Vive después del Próximos en la vista
 * completa orquestada.
 */
export function FullListLive({ state }: FullListLiveProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const items = buildFijoList(state)

  const sorted = [...items].sort((a, b) => {
    if (a.status === 'overdue' && b.status !== 'overdue') return -1
    if (b.status === 'overdue' && a.status !== 'overdue') return 1
    if (a.status === 'paid' && b.status !== 'paid') return 1
    if (b.status === 'paid' && a.status !== 'paid') return -1
    return a.daysUntil - b.daysUntil
  })

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

      {items.length > 0 ? (
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
      ) : null}

      <View style={styles.list}>
        {sorted.length === 0 ? (
          <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
            Sin fijos cargados todavía. Tocá el + arriba para empezar.
          </Text>
        ) : (
          sorted.map((item, idx) => (
            <View key={item.id}>
              <RiseRow delay={160 + idx * 40}>
                <RowDayMarker item={item} />
              </RiseRow>
              {idx < sorted.length - 1 ? (
                <View
                  style={[styles.divider, { backgroundColor: theme.colors.line }]}
                />
              ) : null}
            </View>
          ))
        )}
      </View>
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
    marginBottom: 12,
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
  list: {
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
    paddingVertical: 16,
  },
})
