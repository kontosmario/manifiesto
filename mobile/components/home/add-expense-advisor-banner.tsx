// Inline advisor banner for the Add Expense flow.
//
// This is the highest-leverage advisor surface in the app: the
// banner appears at the *moment of decision* — right after the user
// picks a category and before they hit "Agregar". A relevant warning
// here can change behavior, not just inform after the fact.
//
// Two scenarios surface:
//   1. The selected category has a `cap-breach` or `cat-accel`
//      advisor signal → banner with the alert (highest urgency).
//   2. There's a `recovery-hard` / `recovery-soft` signal active —
//      shown regardless of category since today's pace is over cupo.
//
// We only ever render at most one banner (the most urgent), and the
// component returns null when nothing relevant applies.

import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/theme/theme-provider'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'

interface AddExpenseAdvisorBannerProps {
  signals: ControlAdvisorTask[]
  selectedCategoryId: string | null | undefined
  /** Categories the user can pick — needed to map name from id when
   *  matching `cat-dominance-<categoryId>` signals to the selection. */
  categoryNameById: Map<string, string>
}

interface BannerData {
  tone: 'warn' | 'danger'
  icon: keyof typeof MaterialIcons.glyphMap
  title: string
  body: string
}

export function AddExpenseAdvisorBanner({
  signals,
  selectedCategoryId,
  categoryNameById,
}: AddExpenseAdvisorBannerProps) {
  const { theme } = useAppTheme()

  const banner = useMemo<BannerData | null>(() => {
    // 1. Recovery path — today is already over cupo. Always relevant.
    const recovery = signals.find(
      (s) => s.id === 'recovery-hard' || s.id === 'recovery-soft',
    )
    if (recovery) {
      return {
        tone: recovery.id === 'recovery-hard' ? 'danger' : 'warn',
        icon: 'speed',
        title: recovery.title,
        body: recovery.body,
      }
    }

    // 2. Selected category has a cap or accel alert.
    if (selectedCategoryId) {
      const targetName = categoryNameById.get(selectedCategoryId) ?? ''
      // cap-breach signals carry the limit id, but `cat` is the
      // category name; match on cat name.
      const cap = signals.find(
        (s) =>
          s.id.startsWith('cap-') && s.cat === targetName,
      )
      if (cap) {
        return {
          tone: 'danger',
          icon: 'block',
          title: cap.title,
          body: cap.body,
        }
      }
      const accel = signals.find(
        (s) => s.id === 'cat-accel' && s.cat === targetName,
      )
      if (accel) {
        return {
          tone: 'warn',
          icon: 'trending-up',
          title: accel.title,
          body: accel.body,
        }
      }
    }

    return null
  }, [signals, selectedCategoryId, categoryNameById])

  if (!banner) return null

  const accent =
    banner.tone === 'danger' ? theme.colors.danger : theme.colors.warning
  const surface = theme.colors.creamCard
  const border = theme.colors.line

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(160)}
      layout={LinearTransition.duration(220)}
      style={[
        styles.row,
        { backgroundColor: surface, borderColor: border },
      ]}
    >
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <MaterialIcons name={banner.icon} size={18} color={accent} />
      <View style={styles.body}>
        <Text
          style={[styles.title, { color: theme.colors.text }]}
          numberOfLines={1}
        >
          {banner.title}
        </Text>
        <Text
          style={[styles.bodyText, { color: theme.colors.textMuted }]}
          numberOfLines={2}
        >
          {banner.body}
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
