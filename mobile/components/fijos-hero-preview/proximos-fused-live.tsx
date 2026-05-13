import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import { RiseRow, RuleScale, getSignalIcon } from './smart-alerts-helpers'
import type { HeroState } from './hero-states'

interface ProximosFusedLiveProps {
  state: HeroState
}

/**
 * Próximos a pagar (fusión SmartAlerts + Próximos).
 *
 * Reemplaza las dos cards separadas que tenían demasiado footprint
 * vertical y conceptualmente eran "lo mismo": qué se viene + qué
 * notar al respecto.
 *
 * Estructura:
 *   1. Header "PRÓXIMOS A PAGAR · N ítems"
 *   2. Rule
 *   3. Up to 3 rows: días + nombre + amount (sin acciones — solo info)
 *   4. Sub-divider con label "AVISOS"
 *   5. Inline list de hikes + signals (cuando existen)
 *
 * Cuando no hay avisos, el sub-divider + sub-label no se renderea.
 * Cuando no hay próximos (empty/all-paid) se muestra el estado calmo.
 */
export function ProximosFusedLive({ state }: ProximosFusedLiveProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const items = state.upcoming.slice(0, 3)
  const alerts = [...state.alerts.hikes, ...state.alerts.signals]
  const hasAlerts = alerts.length > 0
  const hasUpcoming = items.length > 0

  // Empty
  if (state.isEmpty) {
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
            PRÓXIMOS A PAGAR
          </Text>
        </RiseRow>
        <RuleScale color={theme.colors.text} delay={80} />
        <RiseRow delay={160}>
          <Text style={[styles.emptyLine1, { color: theme.colors.text }]}>
            Sin fijos cargados.
          </Text>
          <Text style={[styles.emptyLine2, { color: theme.colors.textMuted }]}>
            Una vez los configures, este lugar te dice qué se viene en
            los próximos días.
          </Text>
        </RiseRow>
      </View>
    )
  }

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
            PRÓXIMOS A PAGAR
          </Text>
          <Text style={[styles.headerMeta, { color: theme.colors.textMuted }]}>
            {hasUpcoming
              ? `${items.length} ${items.length === 1 ? 'ítem' : 'ítems'}`
              : 'al día'}
          </Text>
        </View>
      </RiseRow>
      <RuleScale color={theme.colors.text} delay={80} />

      {/* Top section — upcoming rows (sin acciones, solo info) */}
      {hasUpcoming ? (
        <View style={styles.upcomingList}>
          {items.map((item, idx) => (
            <View key={item.id}>
              <UpcomingRow
                item={item}
                delay={160 + idx * 80}
                palette={palette}
              />
              {idx < items.length - 1 ? (
                <View
                  style={[styles.divider, { backgroundColor: theme.colors.line }]}
                />
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <RiseRow delay={160}>
          <View style={styles.allPaidRow}>
            <MaterialIcons
              name="check-circle"
              size={18}
              color={palette.success}
            />
            <Text style={[styles.allPaidText, { color: theme.colors.text }]}>
              No queda nada por pagar este ciclo.
            </Text>
          </View>
        </RiseRow>
      )}

      {/* Sub-section divider — solo si hay avisos */}
      {hasAlerts ? (
        <>
          <RiseRow delay={160 + items.length * 80 + 60}>
            <View style={styles.alertsBreak}>
              <Text style={[styles.alertsLabel, { color: theme.colors.textMuted }]}>
                AVISOS
              </Text>
              <View
                style={[styles.alertsLine, { backgroundColor: theme.colors.line }]}
              />
            </View>
          </RiseRow>

          <View style={styles.alertsList}>
            {state.alerts.hikes.map((h, idx) => (
              <RiseRow
                key={h.id}
                delay={160 + items.length * 80 + 140 + idx * 60}
              >
                <View style={styles.alertRow}>
                  <View
                    style={[
                      styles.alertIcon,
                      {
                        backgroundColor: palette.urgencyBadgeBg,
                        borderColor: palette.urgencyBadgeBorder,
                      },
                    ]}
                  >
                    <MaterialIcons
                      name="trending-up"
                      size={11}
                      color={palette.urgency}
                    />
                  </View>
                  <Text
                    style={[styles.alertText, { color: theme.colors.text }]}
                    numberOfLines={2}
                  >
                    <Text style={[styles.alertName, { color: palette.urgency }]}>
                      {h.name}
                    </Text>{' '}
                    subió {h.deltaPct}% · {formatMoney(h.previousPrice)} →{' '}
                    {formatMoney(h.currentPrice)}
                  </Text>
                </View>
              </RiseRow>
            ))}
            {state.alerts.signals.map((s, idx) => {
              const isPositive = s.kind === 'streak'
              const tint = isPositive
                ? palette.success
                : s.urgency === 'alta'
                ? palette.urgencyStrong
                : palette.urgency
              const tintBg = isPositive
                ? palette.successSubtle
                : palette.urgencyBadgeBg
              const tintBorder = isPositive
                ? palette.success
                : palette.urgencyBadgeBorder
              return (
                <RiseRow
                  key={s.id}
                  delay={
                    160 +
                    items.length * 80 +
                    140 +
                    (state.alerts.hikes.length + idx) * 60
                  }
                >
                  <View style={styles.alertRow}>
                    <View
                      style={[
                        styles.alertIcon,
                        { backgroundColor: tintBg, borderColor: tintBorder },
                      ]}
                    >
                      <MaterialIcons
                        name={getSignalIcon(s.kind)}
                        size={11}
                        color={tint}
                      />
                    </View>
                    <Text
                      style={[styles.alertText, { color: theme.colors.text }]}
                      numberOfLines={2}
                    >
                      <Text style={[styles.alertName, { color: tint }]}>
                        {s.title}
                      </Text>{' '}
                      · {s.body.split('.')[0]}
                    </Text>
                  </View>
                </RiseRow>
              )
            })}
          </View>
        </>
      ) : null}
    </View>
  )
}

function UpcomingRow({
  item,
  delay,
  palette,
}: {
  item: HeroState['upcoming'][number]
  delay: number
  palette: ReturnType<typeof buildProximosPalette>
}) {
  const { theme } = useAppTheme()
  const labelText = item.isOverdue
    ? `VENCIÓ HACE ${Math.abs(item.days)}D`
    : item.days === 0
    ? 'HOY'
    : item.days === 1
    ? 'MAÑANA'
    : `EN ${item.days} DÍAS`
  const labelColor = item.isOverdue
    ? palette.urgencyStrong
    : item.days <= 1
    ? palette.urgency
    : theme.colors.textMuted

  return (
    <RiseRow delay={delay}>
      <View style={styles.upcomingRow}>
        <View style={styles.rowLeft}>
          <Text style={[styles.rowLabel, { color: labelColor }]}>
            {labelText}
          </Text>
          <View style={styles.rowNameWrap}>
            <View
              style={[styles.categoryDot, { backgroundColor: item.categoryColor }]}
            />
            <Text
              style={[styles.rowName, { color: theme.colors.text }]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            {item.hikeDeltaPct ? (
              <View
                style={[
                  styles.hikeBadge,
                  {
                    borderColor: palette.urgencyBadgeBorder,
                    backgroundColor: palette.urgencyBadgeBg,
                  },
                ]}
              >
                <Text style={[styles.hikeBadgeText, { color: palette.urgency }]}>
                  +{item.hikeDeltaPct}%
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <Text
          style={[
            styles.rowAmount,
            {
              color: item.isOverdue ? palette.urgency : theme.colors.text,
            },
          ]}
        >
          {formatMoney(item.amount)}
        </Text>
      </View>
    </RiseRow>
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
  },
  upcomingList: { gap: 0 },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  rowLeft: { flex: 1, gap: 4 },
  rowLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  rowNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  hikeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
  },
  hikeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  rowAmount: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
    marginLeft: 12,
  },
  divider: {
    height: 1,
    opacity: 0.35,
  },
  allPaidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  allPaidText: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  // Sub-section: AVISOS
  alertsBreak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    marginBottom: 8,
  },
  alertsLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  alertsLine: {
    flex: 1,
    height: 1,
    opacity: 0.6,
  },
  alertsList: { gap: 8 },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 4,
  },
  alertIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginTop: 1,
  },
  alertText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  alertName: {
    fontWeight: '800',
  },
  emptyLine1: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  emptyLine2: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
})
