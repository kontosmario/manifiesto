import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppSymbol } from '@/components/ui/app-symbol'
import type {
  HouseholdSavingsPreset,
  HouseholdSavingsResearchStat,
} from '@/features/settings/household-setup-wizard.model'
import { withAlpha } from '@/theme/color-utils'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET } from '@/theme/interaction'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter } from '@/utils/money'
import { radii } from '@/theme/palette'

export function HouseholdSetupProgressCard({
  currentStep,
  subtitle,
  title,
  totalSteps,
}: {
  currentStep: number
  subtitle: string
  title: string
  totalSteps: number
}) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()

  return (
    <View
      style={[
        styles.progressCard,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.progressHeader}>
        <Text style={[styles.progressEyebrow, { color: theme.colors.primaryStrong }]}>
          {t('settings:householdSetup.stepOf', { current: currentStep, total: totalSteps })}
        </Text>
        <View style={styles.progressDots}>
          {Array.from({ length: totalSteps }).map((_, index) => {
            const isActive = index + 1 <= currentStep

            return (
              <View
                key={`setup-dot-${index + 1}`}
                style={[
                  styles.progressDot,
                  {
                    backgroundColor: isActive
                      ? theme.colors.primary
                      : withAlpha(theme.colors.text, theme.isDark ? 0.16 : 0.08),
                  },
                ]}
              />
            )
          })}
        </View>
      </View>
      <Text style={[styles.progressTitle, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.progressSubtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
    </View>
  )
}

export function HouseholdSavingsResearchPanel({
  benchmarkFund,
  note,
  stats,
}: {
  benchmarkFund: number
  note: string
  stats: readonly HouseholdSavingsResearchStat[]
}) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()

  return (
    <View
      style={[
        styles.researchCard,
        {
          backgroundColor: theme.colors.primarySurface,
          borderColor: withAlpha(theme.colors.primary, theme.isDark ? 0.24 : 0.16),
        },
      ]}
    >
      <View style={styles.researchHeader}>
        <View
          style={[
            styles.researchIconWrap,
            {
              backgroundColor: theme.colors.backgroundElevated,
              borderColor: withAlpha(theme.colors.primary, 0.18),
            },
          ]}
        >
          <AppSymbol color={theme.colors.primaryStrong} fallback="insights" name="chart.bar.doc.horizontal.fill" size={18} />
        </View>
        <View style={styles.researchCopy}>
          <Text style={[styles.researchTitle, { color: theme.colors.text }]}>
            {t('settings:householdSetup.researchTitle')}
          </Text>
          <Text style={[styles.researchSubtitle, { color: theme.colors.textMuted }]}>
            {t('settings:householdSetup.researchSubtitle')}
          </Text>
        </View>
      </View>

      <View style={styles.researchStats}>
        {stats.map((stat) => (
          <View
            key={stat.label}
            style={[
              styles.researchStat,
              {
                backgroundColor: withAlpha(theme.colors.backgroundElevated, theme.isDark ? 0.06 : 0.76),
                borderColor: withAlpha(theme.colors.primary, theme.isDark ? 0.2 : 0.12),
              },
            ]}
          >
            <Text style={[styles.researchValue, { color: theme.colors.primaryStrong }]}>
              {stat.value}
            </Text>
            <Text style={[styles.researchLabel, { color: theme.colors.text }]}>{stat.label}</Text>
            <Text style={[styles.researchDetail, { color: theme.colors.textMuted }]}>
              {stat.detail}
            </Text>
            <Text style={[styles.researchSource, { color: theme.colors.textSoft }]}>
              {stat.source}
            </Text>
          </View>
        ))}
      </View>

      <Text style={[styles.benchmarkText, { color: theme.colors.text }]}>
        {t('settings:householdSetup.benchmarkText', { amount: currencyFormatter.format(benchmarkFund || 0) })}
      </Text>
      <Text style={[styles.researchNote, { color: theme.colors.textMuted }]}>{note}</Text>
    </View>
  )
}

export function HouseholdSavingsPresetCard({
  isSelected,
  onPress,
  preset,
}: {
  isSelected: boolean
  onPress: () => void
  preset: HouseholdSavingsPreset
}) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()

  return (
    <Pressable
      accessibilityLabel={t('settings:householdSetup.usePresetA11y', { title: preset.title })}
      accessibilityRole="button"
      android_ripple={{
        borderless: false,
        color: withAlpha(theme.colors.primary, theme.isDark ? 0.22 : 0.12),
      }}
      hitSlop={DEFAULT_HIT_SLOP}
      onPress={onPress}
      pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
      style={({ pressed }) => [
        styles.presetCard,
        {
          backgroundColor: isSelected ? theme.colors.primarySurface : theme.colors.surfaceMuted,
          borderColor: isSelected ? theme.colors.primary : theme.colors.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={styles.presetHeader}>
        <View style={styles.presetTitleWrap}>
          <Text style={[styles.presetTitle, { color: theme.colors.text }]}>{preset.title}</Text>
          <Text style={[styles.presetMix, { color: theme.colors.textSoft }]}>
            50 / {preset.flexiblePercent} / {preset.savingsPercent}
          </Text>
        </View>
        <View style={styles.presetValueWrap}>
          <Text style={[styles.presetPercent, { color: theme.colors.primaryStrong }]}>
            {preset.savingsPercent}%
          </Text>
          <Text style={[styles.presetValue, { color: theme.colors.textSoft }]}>
            {currencyFormatter.format(preset.monthlyGoal)}
          </Text>
        </View>
      </View>
      <Text style={[styles.presetSubtitle, { color: theme.colors.textMuted }]}>
        {preset.subtitle}
      </Text>
      <Text style={[styles.presetHelper, { color: theme.colors.textSoft }]}>{preset.helper}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  progressCard: {
    gap: 8,
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  progressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  progressEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  progressDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  progressDot: {
    borderRadius: radii.pill,
    height: 8,
    width: 24,
  },
  progressTitle: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  progressSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  researchCard: {
    gap: 14,
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  researchHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  researchIconWrap: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  researchCopy: {
    flex: 1,
    gap: 2,
  },
  researchTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  researchSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  researchStats: {
    gap: 10,
  },
  researchStat: {
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  researchValue: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  researchLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
  researchDetail: {
    fontSize: 13,
    lineHeight: 18,
  },
  researchSource: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  benchmarkText: {
    fontSize: 15,
    fontWeight: '800',
  },
  researchNote: {
    fontSize: 12,
    lineHeight: 18,
  },
  presetCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: 6,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  presetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  presetTitleWrap: {
    flex: 1,
    gap: 4,
  },
  presetTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  presetMix: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  presetValueWrap: {
    alignItems: 'flex-end',
    gap: 2,
  },
  presetPercent: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  presetValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  presetSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  presetHelper: {
    fontSize: 12,
    lineHeight: 17,
  },
})
