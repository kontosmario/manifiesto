import { StyleSheet, Text, View } from 'react-native'
import { clamp, type VisualTone } from '@/components/home/control-visual-utils'
import { withAlpha } from '@/theme/color-utils'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter } from '@/utils/money'
import { nunitoFamily } from '@/theme/typography'

interface ControlPressureMeterProps {
  helper: string
  label: string
  tone?: VisualTone
  total: number
  value: number
  valueLabel?: string
}

export function ControlPressureMeter({
  helper,
  label,
  tone = 'primary',
  total,
  value,
  valueLabel,
}: ControlPressureMeterProps) {
  const { theme } = useAppTheme()
  const ratio = clamp(total > 0 ? value / total : 0)
  const segmentCount = 12
  const filledSegments = Math.round(ratio * segmentCount)
  const accentColor =
    tone === 'success' ? theme.colors.success : tone === 'warning' ? theme.colors.warning : theme.colors.primary

  return (
    <View
      style={[
        styles.meterCard,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.meterHeader}>
        <Text style={[styles.meterLabel, { color: theme.colors.textMuted }]}>{label}</Text>
        <Text style={[styles.meterValue, { color: theme.colors.text }]}>
          {valueLabel ?? currencyFormatter.format(value)}
        </Text>
      </View>

      <View style={styles.meterSegments}>
        {Array.from({ length: segmentCount }).map((_, index) => (
          <View
            key={`${label}-${index}`}
            style={[
              styles.meterSegment,
              {
                backgroundColor:
                  index < filledSegments ? accentColor : withAlpha(theme.colors.text, 0.08),
              },
            ]}
          />
        ))}
      </View>

      <Text style={[styles.meterHelper, { color: theme.colors.textSoft }]}>{helper}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  meterCard: {
    gap: 10,
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  meterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  meterLabel: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  meterValue: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  meterSegments: {
    flexDirection: 'row',
    gap: 4,
  },
  meterSegment: {
    flex: 1,
    height: 12,
    borderRadius: radii.pill,
  },
  meterHelper: {
    fontSize: 12,
    lineHeight: 17,
  },
})
