import { StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/ui/button'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { FinancialSummaryRadial } from '@/components/home/financial-summary-radial'
import { withAlpha } from '@/theme/color-utils'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter, formatSignedCurrency, formatUsdFromArs } from '@/utils/money'
import { type FamilyDashboard } from '@/hooks/use-family-dashboard'

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(value, max))
}

interface HomeOverviewCardProps {
  balanceFontSize: number
  balanceLineHeight: number
  dashboard: FamilyDashboard
  isCompactWidth: boolean
  isSaving: boolean
  onConfirmSalary: () => void
}

export function HomeOverviewCard({
  balanceFontSize,
  balanceLineHeight,
  dashboard,
  isCompactWidth,
  isSaving,
  onConfirmSalary,
}: HomeOverviewCardProps) {
  const { theme } = useAppTheme()
  const cycleDurationMs = Math.max(
    dashboard.payCycle.end.getTime() - dashboard.payCycle.start.getTime(),
    1,
  )
  const elapsedCycleProgress = clamp(
    (dashboard.todayDate.getTime() - dashboard.payCycle.start.getTime()) / cycleDurationMs,
  )
  const payCountdownHue = dashboard.isSalaryPendingConfirmation
    ? 4
    : Math.round(6 + elapsedCycleProgress * 126)
  const paydayChipPalette = dashboard.isSalaryPendingConfirmation
      ? {
        backgroundColor: theme.isDark
          ? withAlpha(theme.colors.danger, 0.2)
          : withAlpha(theme.colors.danger, 0.1),
        borderColor: withAlpha(theme.colors.danger, theme.isDark ? 0.62 : 0.34),
        labelColor: theme.isDark ? withAlpha(theme.colors.backgroundElevated, 0.72) : theme.colors.danger,
        valueColor: theme.isDark ? withAlpha(theme.colors.backgroundElevated, 0.94) : theme.colors.danger,
      }
    : {
        backgroundColor: theme.isDark
          ? `hsla(${payCountdownHue}, 34%, 16%, 0.94)`
          : `hsla(${payCountdownHue}, 80%, 95%, 0.98)`,
        borderColor: theme.isDark
          ? `hsla(${payCountdownHue}, 74%, 62%, 0.42)`
          : `hsla(${payCountdownHue}, 62%, 46%, 0.24)`,
        labelColor: theme.isDark ? 'hsla(0, 0%, 100%, 0.7)' : theme.colors.textSoft,
        valueColor: theme.isDark ? withAlpha(theme.colors.backgroundElevated, 0.98) : theme.colors.text,
      }
  const inlineWarningPalette = theme.isDark
    ? {
        backgroundColor: theme.colors.surfaceMuted,
        borderColor: theme.colors.border,
      }
    : {
        backgroundColor: withAlpha(theme.colors.warning, 0.12),
        borderColor: withAlpha(theme.colors.warning, 0.18),
      }
  const paydayChipValue = `${dashboard.remainingUntilPayday} ${
    dashboard.remainingUntilPayday === 1 ? 'día' : 'días'
  }`
  const mixStatBackgroundColor = theme.isDark
    ? withAlpha(theme.colors.surfaceStrong, 0.72)
    : withAlpha(theme.colors.backgroundElevated, 0.78)
  const mixStatBorderColor = theme.isDark
    ? withAlpha(theme.colors.border, 0.96)
    : withAlpha(theme.colors.text, 0.08)
  const flexibleDeltaColor =
    dashboard.flexibleDelta > 0
      ? theme.colors.warning
      : dashboard.flexibleDelta < 0
        ? theme.colors.success
        : theme.colors.text

  return (
    <BrandedPanel elevated style={styles.overviewCard} variant="hero">
      <View style={styles.overviewHeader}>
        <View style={styles.overviewTop}>
          <View style={styles.overviewHeadingWrap}>
            <Text style={[styles.eyebrow, { color: theme.colors.primaryStrong }]}>
              Panorama del hogar
            </Text>
          </View>
          <View
            style={[
              styles.paydayChip,
              {
                backgroundColor: paydayChipPalette.backgroundColor,
                borderColor: paydayChipPalette.borderColor,
              },
            ]}
          >
            <Text style={[styles.paydayChipLabel, { color: paydayChipPalette.labelColor }]}>
              Próximo cobro
            </Text>
            <Text style={[styles.paydayChipValue, { color: paydayChipPalette.valueColor }]}>
              {paydayChipValue}
            </Text>
          </View>
        </View>

        <View style={styles.balanceCompact}>
          <Text
            numberOfLines={1}
            style={[
              styles.balanceValue,
              {
                color: theme.colors.text,
                fontSize: balanceFontSize,
                lineHeight: balanceLineHeight,
              },
            ]}
          >
            {currencyFormatter.format(dashboard.totalAvailable)}
          </Text>
          <Text style={[styles.balanceHelper, theme.typography.body, { color: theme.colors.textMuted }]}>
            Disponible ahora ·{' '}
            {formatUsdFromArs(dashboard.totalAvailable, dashboard.usdExchangeRate)}
          </Text>
        </View>
      </View>

      <View style={styles.overviewGraphicSection}>
        <View style={styles.overviewGraphicBlock}>
          <FinancialSummaryRadial
            availableValue={dashboard.totalAvailable}
            compact={isCompactWidth}
            config={{
              fixed: {
                label: 'Gastos Fijos',
                subtitle: 'carga del ciclo',
              },
            }}
            fixedValue={dashboard.fixedExpensesMonthlyTotal}
            monthlyIncome={dashboard.monthlyIncome}
            savingsGoal={dashboard.savingsGoal}
            savingsValue={dashboard.savingsRemaining}
            spentValue={dashboard.spentInCurrentCycle}
          />
        </View>
      </View>

      <View style={styles.mixStatsGrid}>
        <View
          style={[
            styles.mixStatCard,
            {
              backgroundColor: mixStatBackgroundColor,
              borderColor: mixStatBorderColor,
            },
          ]}
        >
          <Text style={[styles.mixStatLabel, { color: theme.colors.textMuted }]}>Mix objetivo</Text>
          <Text style={[styles.mixStatValue, { color: theme.colors.text }]}>
            {dashboard.targetEssentialsPercent} / {dashboard.targetFlexiblePercent} /{' '}
            {dashboard.savingsGoalPercent}
          </Text>
          <Text style={[styles.mixStatHelper, { color: theme.colors.textSoft }]}>
            Necesidades / flexible / ahorro
          </Text>
        </View>

        <View
          style={[
            styles.mixStatCard,
            {
              backgroundColor: mixStatBackgroundColor,
              borderColor: mixStatBorderColor,
            },
          ]}
        >
          <Text style={[styles.mixStatLabel, { color: theme.colors.textMuted }]}>
            Flexible objetivo
          </Text>
          <Text style={[styles.mixStatValue, { color: theme.colors.text }]}>
            {currencyFormatter.format(dashboard.flexibleTargetAmount)}
          </Text>
          <Text style={[styles.mixStatHelper, { color: theme.colors.textSoft }]}>
            {dashboard.targetFlexiblePercent}% del ingreso mensual
          </Text>
        </View>

        <View
          style={[
            styles.mixStatCard,
            {
              backgroundColor: mixStatBackgroundColor,
              borderColor: mixStatBorderColor,
            },
          ]}
        >
          <Text style={[styles.mixStatLabel, { color: theme.colors.textMuted }]}>
            Desvío flexible
          </Text>
          <Text style={[styles.mixStatValue, { color: flexibleDeltaColor }]}>
            {formatSignedCurrency(dashboard.flexibleDelta)}
          </Text>
          <Text style={[styles.mixStatHelper, { color: theme.colors.textSoft }]}>
            Gastado flexible {currencyFormatter.format(dashboard.spentInCurrentCycle)}
          </Text>
        </View>
      </View>

      {dashboard.isSalaryPendingConfirmation ? (
        <View
          style={[
            styles.inlineWarning,
            {
              backgroundColor: inlineWarningPalette.backgroundColor,
              borderColor: inlineWarningPalette.borderColor,
            },
          ]}
        >
          <View style={styles.inlineWarningCopy}>
            <Text style={[styles.inlineWarningTitle, { color: theme.colors.warning }]}>
              Confirmá el cobro para abrir el nuevo ciclo
            </Text>
            <Text style={[styles.inlineWarningText, theme.typography.body, { color: theme.colors.textMuted }]}>
              Reinicia el seguimiento mensual y mantiene consistentes los reportes.
            </Text>
          </View>
          <AppButton
            label="Confirmar cobro"
            loading={isSaving}
            onPress={onConfirmSalary}
            variant="secondary"
          />
        </View>
      ) : null}
    </BrandedPanel>
  )
}

const styles = StyleSheet.create({
  overviewCard: {
    gap: 20,
  },
  overviewHeader: {
    gap: 6,
  },
  overviewTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  overviewHeadingWrap: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  balanceCompact: {
    gap: 6,
    width: '100%',
  },
  balanceValue: {
    fontWeight: '900',
    letterSpacing: -1.1,
    flexShrink: 1,
  },
  balanceHelper: {},
  paydayChip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 1,
    minWidth: 106,
    alignItems: 'flex-start',
  },
  paydayChipLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  paydayChipValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  overviewGraphicBlock: {
    alignItems: 'center',
    marginTop: -30,
    paddingTop: 0,
  },
  overviewGraphicSection: {
    gap: 0,
  },
  mixStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  mixStatCard: {
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 112,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  mixStatLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  mixStatValue: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  mixStatHelper: {
    fontSize: 12,
    lineHeight: 16,
  },
  inlineWarning: {
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  inlineWarningCopy: {
    gap: 6,
  },
  inlineWarningTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  inlineWarningText: {},
})
