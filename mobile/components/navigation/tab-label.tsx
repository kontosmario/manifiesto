import { StyleSheet, Text } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'
import { brand } from '@/theme/palette'

export function TabLabel({
  children,
  focused,
}: {
  children: string
  focused: boolean
}) {
  const { theme } = useAppTheme()

  // Active label anchors on the Manifiesto brand green — the same family as the
  // active pill and the home hero accent. Inactive uses the standard muted tone.
  const focusedColor = theme.isDark ? brand.bright : brand.deep
  const color = focused ? focusedColor : theme.colors.textMuted

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
