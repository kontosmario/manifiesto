import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'

interface SectionHeaderProps {
  title: string
  subtitle?: string
  rightSlot?: ReactNode
}

export function SectionHeader({ title, subtitle, rightSlot }: SectionHeaderProps) {
  const { theme } = useAppTheme()

  return (
    <View style={styles.container}>
      <View style={styles.copy}>
        <Text style={[styles.title, theme.typography.sectionTitle, { color: theme.colors.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, theme.typography.body, { color: theme.colors.textMuted }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightSlot ? <View>{rightSlot}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {},
  subtitle: {},
})
