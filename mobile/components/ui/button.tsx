import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic, type AppHapticTone } from '@/lib/haptics'
import { withAlpha } from '@/theme/color-utils'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET } from '@/theme/interaction'
import { useAppTheme } from '@/theme/theme-provider'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
type ButtonSize = 'default' | 'compact'

interface AppButtonProps extends Omit<PressableProps, 'style'> {
  label: string
  loading?: boolean
  variant?: ButtonVariant
  fullWidth?: boolean
  haptic?: AppHapticTone
  size?: ButtonSize
}

export function AppButton({
  label,
  loading = false,
  variant = 'primary',
  disabled,
  fullWidth = true,
  haptic,
  size = 'default',
  onPress,
  onPressIn,
  onPressOut,
  ...pressableProps
}: AppButtonProps) {
  const { theme } = useAppTheme()
  const isDisabled = disabled || loading
  const pressScale = usePressScale({
    pressedScale: variant === 'ghost' ? 0.985 : 0.97,
  })

  const colorsByVariant = {
    primary: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
      textColor: '#FFFFFF',
    },
    secondary: {
      backgroundColor: theme.colors.primarySurface,
      borderColor: theme.colors.primarySurface,
      textColor: theme.colors.primaryStrong,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderColor: theme.colors.border,
      textColor: theme.colors.text,
    },
    danger: {
      backgroundColor: theme.colors.danger,
      borderColor: theme.colors.danger,
      textColor: '#FFFFFF',
    },
    accent: {
      backgroundColor: theme.brand.bright,
      borderColor: theme.brand.bright,
      textColor: theme.brand.deep,
    },
  } as const

  const activeColors = colorsByVariant[variant]
  const resolvedHaptic =
    haptic ??
    (variant === 'primary' || variant === 'accent'
      ? 'light'
      : variant === 'secondary'
        ? 'selection'
        : variant === 'danger'
          ? 'warning'
          : 'none')
  const sizeTokens =
    size === 'compact'
      ? {
          borderRadius: theme.radii.md,
          gap: 8,
          minHeight: 44,
          paddingHorizontal: 14,
          typography: theme.typography.buttonCompact,
        }
      : {
          borderRadius: theme.radii.lg,
          gap: 10,
          minHeight: 52,
          paddingHorizontal: 18,
          typography: theme.typography.buttonDefault,
        }

  return (
    <Pressable
      accessibilityLabel={pressableProps.accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isDisabled }}
      android_ripple={{
        color:
          variant === 'accent'
            ? withAlpha(theme.brand.deep, 0.18)
            : variant === 'primary' || variant === 'danger'
              ? withAlpha('#FFFFFF', 0.18)
              : variant === 'secondary'
                ? withAlpha(theme.colors.primaryStrong, 0.12)
                : withAlpha(theme.colors.text, 0.08),
      }}
      disabled={isDisabled}
      hitSlop={DEFAULT_HIT_SLOP}
      pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
      style={({ pressed }) => [
        styles.baseButton,
        {
          backgroundColor: activeColors.backgroundColor,
          borderColor: activeColors.borderColor,
          opacity: isDisabled ? 0.6 : pressed ? 0.86 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          borderRadius: sizeTokens.borderRadius,
          minHeight: sizeTokens.minHeight,
          paddingHorizontal: sizeTokens.paddingHorizontal,
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
        if (resolvedHaptic !== 'none' && !isDisabled) {
          void triggerHaptic(resolvedHaptic)
        }
        onPress?.(event)
      }}
      {...pressableProps}
    >
      <Animated.View style={pressScale.animatedStyle}>
        <View style={[styles.content, { gap: sizeTokens.gap }]}>
          {loading ? <ActivityIndicator color={activeColors.textColor} size="small" /> : null}
          <Text
            style={[
              styles.label,
              {
                color: activeColors.textColor,
                fontSize: sizeTokens.typography.fontSize,
                fontWeight: sizeTokens.typography.fontWeight,
              },
            ]}
          >
            {label}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  baseButton: {
    borderWidth: 1,
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
  },
})
