// Contextual advisor chip for the Gastos screen. Lives between the
// smart filter and the movements list so the user sees the advisor
// finding right where they're looking at category-level data.
//
// Two scenarios:
//   1. The user has filtered by a specific category that has a
//      `cap-breach` or `cat-accel` signal → chip surfaces THAT
//      signal with the category name in the title.
//   2. No filter active → the top category-domain signal is shown
//      regardless (cap-breach, cat-accel, cat-dominance, small-leaks
//      or cat-win, in priority order).

import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'

interface GastosAdvisorChipProps {
  signals: ControlAdvisorTask[]
  selectedCategoryId: string | null
  categoryNameById: Map<string, string>
  onPress?: (signal: ControlAdvisorTask) => void
}

const CATEGORY_DOMAIN_PREFIXES = [
  'cap-',
  'cat-accel',
  'cat-dominance-',
  'small-leaks',
  'cat-win',
] as const

function isCategoryDomain(id: string): boolean {
  return CATEGORY_DOMAIN_PREFIXES.some((prefix) =>
    prefix.endsWith('-') ? id.startsWith(prefix) : id === prefix,
  )
}

export function GastosAdvisorChip({
  signals,
  selectedCategoryId,
  categoryNameById,
  onPress,
}: GastosAdvisorChipProps) {
  const { theme } = useAppTheme()

  const target = useMemo<ControlAdvisorTask | null>(() => {
    // Filter to category-domain signals first.
    const domain = signals.filter((s) => isCategoryDomain(s.id))
    if (domain.length === 0) return null

    // If the user filtered by category, prefer signals matching that
    // category's name (cat field).
    if (selectedCategoryId) {
      const targetName = categoryNameById.get(selectedCategoryId) ?? ''
      const match = domain.find((s) => s.cat === targetName)
      if (match) return match
      // Otherwise fall through — no signal for this specific
      // category, but the user may still benefit from seeing the
      // global top one.
    }
    return domain[0]
  }, [signals, selectedCategoryId, categoryNameById])

  if (!target) return null

  const tone =
    target.urgency === 'alta'
      ? theme.colors.danger
      : target.urgency === 'media'
        ? theme.colors.warning
        : theme.colors.textMuted
  const icon: keyof typeof MaterialIcons.glyphMap = target.id.startsWith('cap-')
    ? 'block'
    : target.id === 'cat-accel'
      ? 'trending-up'
      : target.id.startsWith('cat-dominance-')
        ? 'donut-large'
        : target.id === 'small-leaks'
          ? 'water-drop'
          : 'verified'

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(160)}
      layout={LinearTransition.duration(220)}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Asistente: ${target.title}`}
        onPress={() => {
          void triggerHaptic('selection')
          onPress?.(target)
        }}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: theme.colors.creamCard,
            borderColor: theme.colors.line,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <View style={[styles.accent, { backgroundColor: tone }]} />
        <MaterialIcons name={icon} size={16} color={tone} />
        <View style={styles.body}>
          <Text
            style={[styles.title, { color: theme.colors.text }]}
            numberOfLines={1}
          >
            {target.title}
          </Text>
          <Text
            style={[styles.impact, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {target.impact}
          </Text>
        </View>
        <MaterialIcons
          name="chevron-right"
          size={18}
          color={theme.colors.textMuted}
        />
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
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
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  impact: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
})
