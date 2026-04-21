import { StyleSheet, View, type ViewProps } from 'react-native'
import { buildElevationStyle } from '@/theme/elevation'
import { useAppTheme } from '@/theme/theme-provider'

interface AppCardProps extends ViewProps {
  elevated?: boolean
}

export function AppCard({ elevated = false, style, ...viewProps }: AppCardProps) {
  const { theme } = useAppTheme()

  return (
    <View
      style={[
        styles.card,
        buildElevationStyle(theme, elevated ? 'cardElevated' : 'card'),
        {
          backgroundColor: elevated ? theme.colors.backgroundElevated : theme.colors.surface,
          borderColor: elevated ? theme.colors.borderStrong : theme.colors.border,
          borderRadius: theme.radii['2xl'],
        },
        style,
      ]}
      {...viewProps}
    />
  )
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 20,
    overflow: 'hidden',
  },
})
