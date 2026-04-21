import { StyleSheet, Text, View } from 'react-native'
import { ControlMoodOrb } from '@/components/home/control-primitives'
import { ControlSignalTile } from '@/components/home/control-visuals'
import { AppButton } from '@/components/ui/button'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { LoadingBlock } from '@/components/ui/loading-block'
import type { ControlHeroState, ControlMood, MetricDescriptor } from '@/features/insights/control-model'
import { useAppTheme } from '@/theme/theme-provider'

interface ControlHeroCardProps {
  controlMood: ControlMood
  heroMetrics: MetricDescriptor[]
  heroState: ControlHeroState
  isCompactWidth: boolean
  isLoading: boolean
  isSalaryPendingConfirmation: boolean
  isSubmittingSalaryConfirmation: boolean
  onConfirmSalary: () => void
}

export function ControlHeroCard({
  controlMood,
  heroMetrics,
  heroState,
  isCompactWidth,
  isLoading,
  isSalaryPendingConfirmation,
  isSubmittingSalaryConfirmation,
  onConfirmSalary,
}: ControlHeroCardProps) {
  const { theme } = useAppTheme()

  if (isLoading) {
    return (
      <BrandedPanel elevated style={styles.heroCard} variant="hero">
        <LoadingBlock label="Preparando el control..." />
      </BrandedPanel>
    )
  }

  if (!heroMetrics.length) {
    return (
      <BrandedPanel elevated style={styles.heroCard} variant="accent">
        <Text style={[styles.heroEyebrow, { color: theme.colors.warning }]}>{heroState.eyebrow}</Text>
        <Text style={[styles.heroTitle, { color: theme.colors.text }]}>{heroState.title}</Text>
        <Text style={[styles.heroDetail, theme.typography.body, { color: theme.colors.textMuted }]}>{heroState.detail}</Text>
      </BrandedPanel>
    )
  }

  return (
    <BrandedPanel elevated style={styles.heroCard} variant={heroState.variant}>
      <View style={[styles.heroTop, isCompactWidth ? styles.heroTopCompact : null]}>
        <View style={styles.heroCopy}>
          <Text
            style={[
              styles.heroEyebrow,
              {
                color:
                  heroState.variant === 'accent' ? theme.colors.warning : theme.colors.primaryStrong,
              },
            ]}
          >
            {heroState.eyebrow}
          </Text>
          <Text style={[styles.heroTitle, { color: theme.colors.text }]}>{heroState.title}</Text>
          <Text style={[styles.heroDetail, theme.typography.body, { color: theme.colors.textMuted }]}>{heroState.detail}</Text>
        </View>

        <View style={styles.heroAside}>
          <ControlMoodOrb mood={controlMood} />
          {isSalaryPendingConfirmation ? (
            <AppButton
              fullWidth={false}
              label="Confirmar cobro"
              loading={isSubmittingSalaryConfirmation}
              onPress={onConfirmSalary}
              size="compact"
              variant="secondary"
            />
          ) : null}
        </View>
      </View>

      <View style={[styles.heroMetrics, isCompactWidth ? styles.heroMetricsCompact : null]}>
        {heroMetrics.map((metric) => (
          <ControlSignalTile
            key={metric.label}
            helper={metric.helper}
            icon={metric.icon}
            label={metric.label}
            tone={metric.tone}
            value={metric.value}
            variant="glass"
          />
        ))}
      </View>
    </BrandedPanel>
  )
}

const styles = StyleSheet.create({
  heroCard: {
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  heroTopCompact: {
    flexDirection: 'column',
  },
  heroAside: {
    alignItems: 'flex-end',
    gap: 10,
  },
  heroCopy: {
    flex: 1,
    gap: 6,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  heroDetail: {},
  heroMetrics: {
    flexDirection: 'row',
    gap: 10,
  },
  heroMetricsCompact: {
    flexDirection: 'column',
  },
})
