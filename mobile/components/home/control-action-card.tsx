import { StyleSheet, Text, View } from 'react-native'
import { buildTonePalette, type ControlAction } from '@/features/insights/control-model'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

export function ControlActionCard({
  detail,
  index,
  title,
  tone,
}: {
  detail: string
  index: number
  title: string
  tone: ControlAction['tone']
}) {
  const { theme } = useAppTheme()
  const palette = buildTonePalette(
    theme.isDark,
    tone,
    theme.colors.primary,
    theme.colors.success,
    theme.colors.warning,
  )

  return (
    <View
      style={[
        styles.actionCard,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
        },
      ]}
    >
      <View style={[styles.actionIndex, { backgroundColor: palette.accentColor }]}>
        <Text style={[styles.actionIndexLabel, { color: theme.colors.backgroundElevated }]}>{index}</Text>
      </View>

      <View style={styles.actionCopy}>
        <Text style={[styles.actionTitle, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[styles.actionDetail, theme.typography.bodySmall, { color: theme.colors.textMuted }]}>{detail}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  actionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  actionIndex: {
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  actionIndexLabel: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  actionCopy: {
    flex: 1,
    gap: 3,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  actionDetail: {},
})
