import { StyleSheet, Text, View } from 'react-native'
import { HeroStat } from '@/components/settings/settings-primitives'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter } from '@/utils/money'
import { typography } from '@/theme/typography'

interface SettingsHeroSummaryProps {
  displayName: string
  familyCode: string
  income: number
  isCompactWidth: boolean
  savingsGoal: number
  salaryPaymentDay: number
  sessionEmail: string
}

export function SettingsHeroSummary({
  displayName,
  familyCode,
  income,
  isCompactWidth,
  salaryPaymentDay,
  savingsGoal,
  sessionEmail,
}: SettingsHeroSummaryProps) {
  const { theme } = useAppTheme()

  return (
    <BrandedPanel elevated style={styles.heroCard} variant="hero">
      <Text style={[styles.heroLabel, { color: theme.colors.primaryStrong }]}>Tu hogar</Text>
      <Text style={[styles.heroTitle, { color: theme.colors.text }]}>
        {displayName.trim() || 'Perfil sin nombre'}
      </Text>
      <Text style={[styles.heroSubtitle, { color: theme.colors.textMuted }]}>
        {sessionEmail} · Código {familyCode}
      </Text>

      <View style={[styles.heroStats, isCompactWidth ? styles.heroStatsCompact : null]}>
        <HeroStat
          compact={isCompactWidth}
          label="Ingreso"
          value={income > 0 ? currencyFormatter.format(income) : 'Definir'}
        />
        <HeroStat
          compact={isCompactWidth}
          label="Ahorro"
          value={savingsGoal > 0 ? currencyFormatter.format(savingsGoal) : 'Definir'}
        />
        <HeroStat compact={isCompactWidth} label="Cobro" value={`Día ${salaryPaymentDay}`} />
      </View>
    </BrandedPanel>
  )
}

const styles = StyleSheet.create({
  heroCard: {
    gap: 14,
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroTitle: {
    ...typography.screenTitle,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  heroStats: {
    flexDirection: 'row',
    gap: 12,
  },
  heroStatsCompact: {
    flexWrap: 'wrap',
  },
})
