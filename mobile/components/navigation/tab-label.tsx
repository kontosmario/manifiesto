import { StyleSheet, Text } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Tab label — bold + V1 primary when focused, muted otherwise.
 * Pairs with `tab-bar-icon.tsx`'s focus dot for the full active state
 * visual (color-only + bold + dot above icon).
 */
export function TabLabel({
  children,
  focused,
}: {
  children: string
  focused: boolean
}) {
  const { theme } = useAppTheme()
  // V1 primary directly — same hex the icon uses when active so the
  // tab reads as a coherent "primary group". textMuted for idle keeps
  // the label legible without competing with the active tab.
  const color = focused ? theme.colors.primary : theme.colors.textMuted

  return (
    <Text
      style={[
        styles.label,
        focused ? styles.labelFocused : styles.labelIdle,
        { color },
      ]}
    >
      {children}
    </Text>
  )
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    letterSpacing: 0.2,
    marginBottom: 1,
  },
  labelIdle: {
    fontWeight: '600',
  },
  labelFocused: {
    fontWeight: '800',
  },
})
