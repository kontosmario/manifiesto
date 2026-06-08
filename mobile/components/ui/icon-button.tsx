import { Pressable, StyleSheet, View, type PressableProps } from 'react-native'
import Animated from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { AppSymbol } from '@/components/ui/app-symbol'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic, type AppHapticTone } from '@/lib/haptics'
import { withAlpha } from '@/theme/color-utils'
import {
  DEFAULT_PRESS_RETENTION_OFFSET,
} from '@/theme/interaction'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

const ICON_HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 } as const

type IconButtonVariant = 'surface' | 'ghost' | 'primary'

interface IconButtonProps extends Omit<PressableProps, 'style'> {
  icon: keyof typeof MaterialIcons.glyphMap
  symbolName?: string
  size?: number
  buttonSize?: number
  variant?: IconButtonVariant
  haptic?: AppHapticTone
  iconColor?: string
  backgroundColor?: string
  borderColor?: string
  showBadge?: boolean
  badgeColor?: string
}

export function IconButton({
  icon,
  symbolName,
  size = 20,
  buttonSize = 42,
  variant = 'surface',
  disabled,
  haptic,
  iconColor,
  backgroundColor,
  borderColor,
  showBadge = false,
  badgeColor,
  hitSlop,
  onPress,
  onPressIn,
  onPressOut,
  ...pressableProps
}: IconButtonProps) {
  const { theme } = useAppTheme()
  const pressScale = usePressScale({
    pressedScale: variant === 'ghost' ? 0.985 : 0.95,
  })

  const colorsByVariant = {
    surface: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      iconColor: theme.colors.text,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderColor: theme.colors.border,
      iconColor: theme.colors.text,
    },
    primary: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
      iconColor: '#FFFFFF',
    },
  } as const

  const activeColors = colorsByVariant[variant]
  const resolvedBackgroundColor = backgroundColor ?? activeColors.backgroundColor
  const resolvedBorderColor = borderColor ?? activeColors.borderColor
  const resolvedIconColor = iconColor ?? activeColors.iconColor
  const resolvedHaptic =
    haptic ?? (variant === 'primary' ? 'medium' : variant === 'surface' ? 'selection' : 'none')
  const badgeSize = buttonSize <= 36 ? 9 : 11
  const badgeInset = buttonSize <= 36 ? 6 : 8

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      android_ripple={{
        borderless: false,
        color:
          variant === 'primary'
            ? withAlpha('#FFFFFF', 0.18)
            : withAlpha(resolvedIconColor, theme.isDark ? 0.18 : 0.12),
        radius: buttonSize / 2,
      }}
      disabled={disabled}
      hitSlop={hitSlop ?? ICON_HIT_SLOP}
      pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
      style={({ pressed }) => [
        styles.baseButton,
        {
          backgroundColor: resolvedBackgroundColor,
          borderColor: resolvedBorderColor,
          width: buttonSize,
          height: buttonSize,
          borderRadius: buttonSize / 2,
          opacity: disabled ? 0.6 : pressed ? 0.82 : 1,
        },
      ]}
      onPressIn={(event) => {
        pressScale.onPressIn()
        onPressIn?.(event)
      }}
      onPressOut={(event) => {
        pressScale.onPressOut()
        onPressOut?.(event)
      }}
      onPress={(event) => {
        if (resolvedHaptic !== 'none' && !disabled) {
          void triggerHaptic(resolvedHaptic)
        }
        onPress?.(event)
      }}
      {...pressableProps}
    >
      <Animated.View style={pressScale.animatedStyle}>
        <View style={styles.content}>
          {symbolName ? (
            <AppSymbol
              color={resolvedIconColor}
              fallback={icon}
              name={symbolName}
              size={size}
            />
          ) : (
            <MaterialIcons color={resolvedIconColor} name={icon} size={size} />
          )}
        </View>
      </Animated.View>
      {showBadge ? (
        <View
          pointerEvents="none"
          style={[
            styles.badge,
            {
              backgroundColor: badgeColor ?? theme.colors.danger,
              borderColor: resolvedBackgroundColor,
              height: badgeSize,
              right: badgeInset,
              top: badgeInset,
              width: badgeSize,
            },
          ]}
        />
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  baseButton: {
    borderWidth: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    borderRadius: radii.pill,
    borderWidth: 2,
  },
})
