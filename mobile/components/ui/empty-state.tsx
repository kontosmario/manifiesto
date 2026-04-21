import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { AppButton } from '@/components/ui/button'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface EmptyStateProps {
  action?: {
    label: string
    onPress: () => void
  }
  icon?: keyof typeof MaterialIcons.glyphMap
  subtitle: string
  title: string
}

export function EmptyState({
  action,
  title,
  subtitle,
  icon = 'info-outline',
}: EmptyStateProps) {
  const { theme } = useAppTheme()

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <MaterialIcons color={theme.colors.textSoft} name={icon} size={24} />
      <Text style={[styles.title, theme.typography.titleMedium, { color: theme.colors.text }]}>
        {title}
      </Text>
      <Text style={[styles.subtitle, theme.typography.body, { color: theme.colors.textMuted }]}>
        {subtitle}
      </Text>
      {action ? (
        <AppButton
          fullWidth={false}
          haptic="light"
          label={action.label}
          onPress={action.onPress}
          size="compact"
          variant="secondary"
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.xl, // was 24; nearest token xl=22 (intentional 2pt tightening)
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
    gap: 12,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
})
