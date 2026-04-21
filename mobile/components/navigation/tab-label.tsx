import { StyleSheet, Text } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'

export function TabLabel({
  children,
  focused,
}: {
  children: string
  focused: boolean
}) {
  const { theme } = useAppTheme()

  return (
    <Text
      style={[
        styles.label,
        {
          color: focused ? (theme.isDark ? '#F2F8F4' : '#1B211D') : theme.colors.textSoft,
          opacity: focused ? 1 : theme.isDark ? 0.92 : 0.82,
        },
      ]}
    >
      {children}
    </Text>
  )
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.15,
    marginBottom: 1,
  },
})
