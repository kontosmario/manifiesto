import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { RiseView } from '@/components/home/animated/rise-view'
import type { HomeMonthSummary } from '@/features/home/use-home-metrics'
import { formatMoneyShort } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

interface MonthSummaryCardProps {
  data: HomeMonthSummary
  onPressVariable: () => void
  onPressFixed: () => void
}

interface PanelTone {
  bg: string
  border: string
  iconBg: string
  fg: string
  pillBg: string
  pillFg: string
}

/**
 * Split summary card. Two side-by-side tinted panels — variables (warm
 * peach) and fijos (mint green) — sit inside a soft cream wrapper. The
 * panels carry the column identity via a category icon, a faint tint,
 * and the existing trend/status pill, which is enough structure to
 * stop the card reading as "two flat columns" without escalating into
 * the full hero treatment used by `MetaCard`.
 */
export function MonthSummaryCard({
  data,
  onPressVariable,
  onPressFixed,
}: MonthSummaryCardProps) {
  const { theme } = useAppTheme()
  const allPaid = data.fixedCount > 0 && data.fixedPaid === data.fixedCount
  const trendUp = (data.variableTrend ?? 0) > 0

  const variablesTone: PanelTone = {
    bg: theme.isDark ? 'rgba(242,181,138,0.10)' : 'rgba(232,151,106,0.10)',
    border: theme.isDark ? 'rgba(242,181,138,0.20)' : 'rgba(232,151,106,0.22)',
    iconBg: theme.isDark ? 'rgba(242,181,138,0.20)' : 'rgba(232,151,106,0.18)',
    fg: theme.isDark ? '#F2B58A' : '#C25A3E',
    pillBg: trendUp
      ? theme.isDark
        ? 'rgba(242,181,138,0.22)'
        : 'rgba(232,151,106,0.18)'
      : theme.isDark
        ? 'rgba(158,224,178,0.22)'
        : 'rgba(110,224,154,0.18)',
    pillFg: trendUp
      ? theme.isDark
        ? '#F2B58A'
        : '#C25A3E'
      : theme.isDark
        ? '#9EE0B2'
        : '#2E7D5B',
  }

  const fijosTone: PanelTone = {
    bg: theme.isDark ? 'rgba(158,224,178,0.10)' : 'rgba(110,224,154,0.10)',
    border: theme.isDark ? 'rgba(158,224,178,0.22)' : 'rgba(110,224,154,0.22)',
    iconBg: theme.isDark ? 'rgba(158,224,178,0.20)' : 'rgba(110,224,154,0.20)',
    fg: theme.isDark ? '#9EE0B2' : '#2E7D5B',
    pillBg: allPaid
      ? theme.isDark
        ? 'rgba(158,224,178,0.22)'
        : 'rgba(110,224,154,0.18)'
      : theme.isDark
        ? 'rgba(242,181,138,0.22)'
        : 'rgba(232,151,106,0.18)',
    pillFg: allPaid
      ? theme.isDark
        ? '#9EE0B2'
        : '#2E7D5B'
      : theme.isDark
        ? '#F2B58A'
        : '#C25A3E',
  }

  return (
    <RiseView delay={220}>
      <View style={styles.grid}>
        <SummaryPanel
          tone={variablesTone}
          label="Variables"
          value={formatMoneyShort(data.variableTotal)}
          sub={`${data.variableCount} ${data.variableCount === 1 ? 'movimiento' : 'movimientos'}`}
          iconName="receipt-long"
          onPress={onPressVariable}
          accessibilityLabel="Ver gastos variables"
          pillText={
            data.variableTrend != null
              ? `${trendUp ? '↑' : '↓'} ${Math.abs(Math.round(data.variableTrend * 100))}% vs mes anterior`
              : null
          }
        />

        <SummaryPanel
          tone={fijosTone}
          label="Fijos"
          value={formatMoneyShort(data.fixedTotal)}
          sub={
            data.fixedCount === 0
              ? 'Sin fijos cargados'
              : `${data.fixedPaid} de ${data.fixedCount} pagados`
          }
          iconName="event-repeat"
          onPress={onPressFixed}
          accessibilityLabel="Ver gastos fijos"
          pillText={
            data.fixedCount === 0
              ? null
              : allPaid
                ? '✓ Todos pagados'
                : `${data.fixedCount - data.fixedPaid} pendientes`
          }
        />
      </View>
    </RiseView>
  )
}

interface SummaryPanelProps {
  tone: PanelTone
  label: string
  value: string
  sub: string
  iconName: keyof typeof MaterialIcons.glyphMap
  onPress: () => void
  accessibilityLabel: string
  pillText: string | null
}

function SummaryPanel({
  tone,
  label,
  value,
  sub,
  iconName,
  onPress,
  accessibilityLabel,
  pillText,
}: SummaryPanelProps) {
  const { theme } = useAppTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.panel,
        {
          backgroundColor: tone.bg,
          borderColor: tone.border,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      <View style={styles.panelHead}>
        <View style={[styles.iconTile, { backgroundColor: tone.iconBg }]}>
          <MaterialIcons name={iconName} size={16} color={tone.fg} />
        </View>
        <View style={styles.panelHeadCenter}>
          <Text style={[styles.label, { color: tone.fg }]}>{label}</Text>
        </View>
        <MaterialIcons
          name="chevron-right"
          size={18}
          color={theme.colors.textMuted}
        />
      </View>

      <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
      <Text style={[styles.sub, { color: theme.colors.textMuted }]}>{sub}</Text>

      {pillText ? (
        <View style={[styles.pill, { backgroundColor: tone.pillBg }]}>
          <Text style={[styles.pillText, { color: tone.pillFg }]}>{pillText}</Text>
        </View>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    gap: 10,
  },
  panel: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  panelHeadCenter: {
    flex: 1,
  },
  iconTile: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: 11,
    marginTop: 4,
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 8,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
  },
})
