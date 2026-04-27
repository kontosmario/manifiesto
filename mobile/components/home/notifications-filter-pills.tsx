import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { NotificationGroup } from '@/utils/notifications'
import { useAppTheme } from '@/theme/theme-provider'

export type NotificationFilter = 'all' | NotificationGroup

export const NOTIFICATION_FILTERS: Array<{ key: NotificationFilter; label: string }> = [
  { key: 'all', label: 'Todas' },
  { key: 'gastos', label: 'Gastos' },
  { key: 'fijos', label: 'Fijos' },
  { key: 'racha', label: 'Racha' },
  { key: 'meta', label: 'Meta' },
]

interface NotificationsFilterPillsProps {
  filter: NotificationFilter
  counts: Partial<Record<NotificationFilter, number>>
  onChange: (filter: NotificationFilter) => void
}

/**
 * Horizontal pill rail with the same active-state language as FijosTabs:
 *  · Light active → solid ink background, cream label.
 *  · Dark active  → green gradient `#C7EE9C → #8DD66A`, near-black label.
 *  · Inactive     → creamCard surface + line border, themed text.
 */
export function NotificationsFilterPills({
  filter,
  counts,
  onChange,
}: NotificationsFilterPillsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {NOTIFICATION_FILTERS.map((f) => {
        const isActive = filter === f.key
        const count = counts[f.key] ?? 0
        return (
          <FilterPill
            key={f.key}
            label={f.label}
            active={isActive}
            count={count}
            onPress={() => onChange(f.key)}
          />
        )
      })}
    </ScrollView>
  )
}

function FilterPill({
  label,
  active,
  count,
  onPress,
}: {
  label: string
  active: boolean
  count: number
  onPress: () => void
}) {
  const { theme } = useAppTheme()
  const fg = active
    ? theme.isDark
      ? '#0A1410'
      : theme.colors.creamCard
    : theme.colors.text

  const countBg = active
    ? theme.isDark
      ? 'rgba(10,20,16,0.18)'
      : 'rgba(246,251,239,0.14)'
    : theme.isDark
      ? '#0E1A15'
      : theme.colors.pageBg

  const countFg = active
    ? theme.isDark
      ? 'rgba(10,20,16,0.65)'
      : 'rgba(246,251,239,0.6)'
    : theme.colors.textMuted

  const content = (
    <>
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
      {count > 0 ? (
        <View style={[styles.countChip, { backgroundColor: countBg }]}>
          <Text style={[styles.countText, { color: countFg }]}>{count}</Text>
        </View>
      ) : null}
    </>
  )

  if (active && theme.isDark) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: true }}
        accessibilityLabel={label}
      >
        <LinearGradient
          colors={['#C7EE9C', '#8DD66A'] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.pill, styles.pillActiveDark]}
        >
          {content}
        </LinearGradient>
      </Pressable>
    )
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={[
        styles.pill,
        {
          backgroundColor: active ? theme.colors.text : theme.colors.creamCard,
          borderColor: active ? theme.colors.text : theme.colors.line,
        },
        active ? { boxShadow: '0px 6px 16px -6px rgba(15, 42, 30, 0.4)' } : null,
      ]}
    >
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillActiveDark: {
    borderWidth: 0,
    boxShadow: '0px 8px 20px -8px rgba(141,214,106,0.55)',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
  countChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
  },
})
