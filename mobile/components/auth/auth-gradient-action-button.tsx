import { LinearGradient } from 'expo-linear-gradient'
import { Pressable, StyleSheet, Text } from 'react-native'
import { triggerHaptic } from '@/lib/haptics'
import { withAlpha } from '@/theme/color-utils'
import { authPalette } from '@/theme/auth-theme'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET } from '@/theme/interaction'
import { radii } from '@/theme/palette'

export function GradientActionButton({
  dense = false,
  disabled,
  label,
  onPress,
}: {
  dense?: boolean
  disabled?: boolean
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      android_ripple={{
        color: withAlpha(authPalette.cta.text, disabled ? 0.08 : 0.14),
        borderless: false,
      }}
      disabled={disabled}
      hitSlop={DEFAULT_HIT_SLOP}
      onPress={() => {
        if (!disabled) {
          void triggerHaptic('medium')
        }
        onPress()
      }}
      pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
      style={({ pressed }) => [
        styles.primaryButton,
        (pressed || disabled) && styles.primaryButtonPressed,
      ]}
    >
      <LinearGradient
        colors={disabled ? authPalette.cta.disabledGradient : authPalette.cta.gradient}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[styles.primaryButtonGradient, dense && styles.primaryButtonGradientDense]}
      >
        <Text style={[styles.primaryButtonLabel, dense && styles.primaryButtonLabelDense]}>
          {label}
        </Text>
      </LinearGradient>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  primaryButton: {
    borderRadius: radii.md,
    overflow: 'hidden',
    shadowColor: authPalette.cta.glowShadow,
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 6,
    },
  },
  primaryButtonPressed: {
    opacity: 0.92,
  },
  primaryButtonGradient: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonGradientDense: {
    minHeight: 46,
  },
  primaryButtonLabel: {
    color: authPalette.cta.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  primaryButtonLabelDense: {
    fontSize: 14,
  },
})
