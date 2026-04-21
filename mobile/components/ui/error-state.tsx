import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { AppButton } from '@/components/ui/button'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface ErrorStateProps {
  actionLabel?: string
  description?: string
  title?: string
  onAction?: () => void
}

export function ErrorState({
  actionLabel = 'Intentar de nuevo',
  description = 'No pudimos cargar esta información. Revisá tu conexión e intentá otra vez.',
  title = 'Algo salió mal',
  onAction,
}: ErrorStateProps) {
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
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <MaterialIcons color={theme.colors.danger} name="error-outline" size={24} />
      </View>
      <Text style={[styles.title, theme.typography.titleMedium, { color: theme.colors.text }]}>
        {title}
      </Text>
      <Text style={[styles.description, theme.typography.body, { color: theme.colors.textMuted }]}>
        {description}
      </Text>
      {onAction ? (
        <AppButton
          fullWidth={false}
          haptic="error"
          label={actionLabel}
          onPress={onAction}
          variant="secondary"
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderRadius: radii.xl, // was 24; nearest token xl=22 (intentional 2pt tightening)
    borderWidth: 1,
    gap: 12,
    paddingHorizontal: 22,
    paddingVertical: 22,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  title: {
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
  },
})
