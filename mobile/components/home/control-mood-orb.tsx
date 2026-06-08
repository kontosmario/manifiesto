import { StyleSheet, Text, View } from 'react-native'
import type { ControlMood } from '@/features/insights/control-model'
import { withAlpha } from '@/theme/color-utils'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

export function ControlMoodOrb({ mood }: { mood: ControlMood }) {
  const { theme } = useAppTheme()
  const toneColor =
    mood.tone === 'success'
      ? theme.colors.success
      : mood.tone === 'warning'
        ? theme.colors.warning
        : theme.colors.primaryStrong

  return (
    <View
      style={[
        styles.moodOrb,
        {
          backgroundColor: theme.isDark
            ? withAlpha(theme.colors.text, 0.08)
            : withAlpha(theme.colors.backgroundElevated, 0.72),
          borderColor: theme.isDark ? theme.colors.border : withAlpha(theme.colors.text, 0.08),
        },
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.moodOrbGlow,
          {
            backgroundColor: toneColor,
          },
        ]}
      />
      <Text style={[styles.moodOrbScore, { color: toneColor }]}>{mood.score}</Text>
      <Text style={[styles.moodOrbLabel, { color: theme.colors.text }]}>{mood.label}</Text>
      <Text style={[styles.moodOrbDetail, { color: theme.colors.textSoft }]}>{mood.detail}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  moodOrb: {
    width: 126,
    minHeight: 126,
    borderRadius: radii['2xl'],
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  moodOrbGlow: {
    position: 'absolute',
    top: -38,
    width: 92,
    height: 92,
    borderRadius: radii.pill,
    opacity: 0.22,
  },
  moodOrbScore: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  moodOrbLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
  moodOrbDetail: {
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },
})
