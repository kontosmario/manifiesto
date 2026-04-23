import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'

interface HomeCircleButtonProps {
  accessibilityLabel: string
  onPress?: () => void
  showBadge?: boolean
  badgeColor?: string
  children: React.ReactNode
  style?: ViewStyle
}

/**
 * 38×38 circular button used in the Home header (bell + settings).
 * Matches the V1 Cuaderno mock: cream fill + subtle shadow + optional
 * peach notification dot.
 */
export function HomeCircleButton({
  accessibilityLabel,
  onPress,
  showBadge = false,
  badgeColor,
  children,
  style,
}: HomeCircleButtonProps) {
  const { theme } = useAppTheme()
  const dotColor = badgeColor ?? theme.colors.peach
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.colors.creamCard,
          opacity: pressed ? 0.9 : 1,
        },
        style,
      ]}
    >
      <View style={styles.iconWrap}>{children}</View>
      {showBadge ? (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: dotColor,
              borderColor: theme.colors.creamCard,
            },
          ]}
        />
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    boxShadow: '0px 2px 6px rgba(15, 42, 30, 0.08)',
  },
  iconWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 2,
  },
})
