// Inline advisor strip for the Savings Goal form.
//
// Surfaces the goal-domain signal (`savings-feasibility` when behind,
// `savings-over` when ahead) so the user sees the assistant's read of
// their pace right next to the goal they're editing.
//
// Returns null when neither signal applies — keeps the form clean.

import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/theme/theme-provider'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'

interface SavingsAdvisorStripProps {
  signals: ControlAdvisorTask[]
}

export function SavingsAdvisorStrip({ signals }: SavingsAdvisorStripProps) {
  const { theme } = useAppTheme()

  const target = useMemo<ControlAdvisorTask | null>(() => {
    return (
      signals.find((s) => s.id === 'savings-feasibility') ??
      signals.find((s) => s.id === 'savings-over') ??
      null
    )
  }, [signals])

  if (!target) return null

  const isOver = target.id === 'savings-over'
  const tone = isOver ? theme.colors.success : theme.colors.warning
  const icon: keyof typeof MaterialIcons.glyphMap = isOver
    ? 'rocket-launch'
    : 'flag'

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(160)}
      layout={LinearTransition.duration(220)}
      style={[
        styles.row,
        {
          backgroundColor: theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <View style={[styles.accent, { backgroundColor: tone }]} />
      <MaterialIcons name={icon} size={18} color={tone} />
      <View style={styles.body}>
        <Text
          style={[styles.title, { color: theme.colors.text }]}
          numberOfLines={1}
        >
          {target.title}
        </Text>
        <Text
          style={[styles.bodyText, { color: theme.colors.textMuted }]}
          numberOfLines={2}
        >
          {target.body}
        </Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  bodyText: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '500',
    marginTop: 2,
  },
})
