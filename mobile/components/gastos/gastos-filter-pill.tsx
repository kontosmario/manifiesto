import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'

interface GastosFilterPillProps {
  active: boolean
  label: string
  count?: number
  emoji?: string
  color?: string
  small?: boolean
  onPress?: () => void
}

/** Rounded pill used in the category filter row + bottom sheet. */
export function GastosFilterPill({
  active,
  label,
  count,
  emoji,
  color,
  small = false,
  onPress,
}: GastosFilterPillProps) {
  const { theme } = useAppTheme()
  const bg = active ? theme.colors.text : theme.colors.creamCard
  const fg = active ? theme.colors.creamCard : theme.colors.text
  const border = active ? theme.colors.text : theme.colors.line
  const countBg = active ? 'rgba(255,255,255,0.18)' : theme.colors.pageBg
  const countFg = active ? theme.colors.heroAccent : color ?? theme.colors.text
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        {
          paddingHorizontal: small ? 10 : 12,
          paddingVertical: small ? 6 : 8,
          backgroundColor: bg,
          borderColor: border,
        },
        active
          ? { boxShadow: '0px 6px 16px -6px rgba(15, 42, 30, 0.4)' }
          : null,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      {emoji ? <Text style={{ fontSize: small ? 12 : 14 }}>{emoji}</Text> : null}
      <Text style={[styles.label, { color: fg, fontSize: small ? 11 : 12 }]}>{label}</Text>
      {count != null ? (
        <View style={[styles.count, { backgroundColor: countBg }]}>
          <Text style={[styles.countText, { color: countFg }]}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: { fontWeight: '700' },
  count: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  countText: { fontSize: 10, fontWeight: '700' },
})
