import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { ProgressBar } from '@/components/ui/progress-bar'
import { withAlpha } from '@/theme/color-utils'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter } from '@/utils/money'

interface BreakdownEntry {
  color: string
  label: string
  total: number
}

interface ExpenseHistoryHeroCardProps {
  filteredTotal: number
  heroSubtitle: string
  title: string
  rows: BreakdownEntry[]
}

function BreakdownRow({
  color,
  label,
  total,
  value,
}: {
  color: string
  label: string
  total: number
  value: number
}) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const share = total > 0 ? value / total : 0

  return (
    <View style={styles.breakdownRow}>
      <View style={styles.breakdownRowHeader}>
        <View style={styles.breakdownRowTitleWrap}>
          <View style={[styles.breakdownRowDot, { backgroundColor: color }]} />
          <Text numberOfLines={1} style={[styles.breakdownRowTitle, { color: theme.colors.text }]}>
            {label}
          </Text>
        </View>
        <Text style={[styles.breakdownRowValue, { color: theme.colors.text }]}>
          {currencyFormatter.format(value)}
        </Text>
      </View>
      <ProgressBar color={color} total={Math.max(total, 1)} value={value} />
      <Text style={[styles.breakdownRowShare, { color: theme.colors.textMuted }]}>
        {t('home:historyHero.shareOfTotal', { pct: Math.round(share * 100) })}
      </Text>
    </View>
  )
}

export function ExpenseHistoryHeroCard({
  filteredTotal,
  heroSubtitle,
  rows,
  title,
}: ExpenseHistoryHeroCardProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()

  return (
    <BrandedPanel elevated style={styles.heroCard} variant="hero">
      <View style={styles.heroCopy}>
        <Text style={[styles.eyebrow, { color: theme.colors.primaryStrong }]}>{t('home:historyHero.eyebrow')}</Text>
        <Text style={[styles.heroValue, { color: theme.colors.text }]}>
          {currencyFormatter.format(filteredTotal)}
        </Text>
        <Text style={[styles.heroSubtitle, theme.typography.bodySmall, { color: theme.colors.textMuted }]}>{heroSubtitle}</Text>
      </View>

      {rows.length > 0 ? (
        <View style={styles.breakdownCard}>
          <Text style={[styles.breakdownTitle, { color: theme.colors.text }]}>{title}</Text>
          <View style={styles.breakdownList}>
            {rows.map((entry) => (
              <BreakdownRow
                color={entry.color}
                key={entry.label}
                label={entry.label}
                total={Math.max(filteredTotal, 1)}
                value={entry.total}
              />
            ))}
          </View>
        </View>
      ) : (
        <View
          style={[
            styles.heroEmptyState,
            {
              backgroundColor: theme.isDark
                ? theme.colors.surfaceMuted
                : withAlpha(theme.colors.backgroundElevated, 0.78),
              borderColor: theme.isDark ? theme.colors.border : withAlpha(theme.colors.text, 0.08),
            },
          ]}
        >
          <Text style={[styles.heroEmptyTitle, { color: theme.colors.text }]}>
            {t('home:historyHero.emptyTitle')}
          </Text>
        </View>
      )}
    </BrandedPanel>
  )
}

const styles = StyleSheet.create({
  heroCard: {
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  heroCopy: {
    gap: 6,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  heroValue: {
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -1,
  },
  heroSubtitle: {},
  heroEmptyState: {
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  heroEmptyTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  breakdownCard: {
    gap: 12,
  },
  breakdownTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  breakdownList: {
    gap: 12,
  },
  breakdownRow: {
    gap: 6,
  },
  breakdownRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  breakdownRowTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  breakdownRowDot: {
    width: 10,
    height: 10,
    borderRadius: radii.pill,
  },
  breakdownRowTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  breakdownRowValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  breakdownRowShare: {
    fontSize: 11,
  },
})
