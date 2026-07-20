import { Pressable, StyleSheet, Text } from 'react-native'
import Animated from 'react-native-reanimated'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { withAlpha } from '@/theme/color-utils'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET, MIN_TOUCH_TARGET } from '@/theme/interaction'
import { radii } from '@/theme/palette'
import { nunitoFamily, typography } from '@/theme/typography'
import { useAppTheme, useCategoryHue } from '@/theme/theme-provider'

interface ChipProps {
  label: string
  isActive?: boolean
  onPress?: () => void
  color?: string
  compact?: boolean
  /** When set, resolves a category hue and uses it for surface/ink instead of the default palette. */
  categoryId?: string
}

export function Chip({
  label,
  isActive = false,
  onPress,
  color,
  compact = false,
  categoryId,
}: ChipProps) {
  const { theme } = useAppTheme()
  const hue = useCategoryHue(categoryId ?? '')
  const isDisabled = !onPress
  const pressScale = usePressScale({ pressedScale: 0.97 })

  const hasHue = Boolean(categoryId)

  const inactiveSurface = hasHue ? hue.surface : theme.colors.surfaceMuted
  const inactiveBorder = hasHue ? hue.surface : theme.colors.border
  const inactiveText = hasHue ? hue.ink : theme.colors.text

  const activeSurface = hasHue ? hue.ink : color ?? theme.colors.primary
  const activeBorder = activeSurface
  const activeText = hasHue ? hue.surface : theme.colors.textOnPrimary

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, selected: isActive }}
      android_ripple={{
        borderless: false,
        color: isActive
          ? withAlpha('#FFFFFF', 0.16)
          : withAlpha(hasHue ? hue.ink : color ?? theme.colors.primary, theme.isDark ? 0.2 : 0.12),
      }}
      disabled={isDisabled}
      hitSlop={DEFAULT_HIT_SLOP}
      pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      onPress={() => {
        if (onPress) {
          void triggerHaptic(isActive ? 'selection' : 'light')
        }
        onPress?.()
      }}
      style={({ pressed }) => [
        styles.baseChip,
        compact ? styles.compactChip : styles.defaultChip,
        {
          backgroundColor: isActive ? activeSurface : inactiveSurface,
          borderColor: isActive ? activeBorder : inactiveBorder,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <Animated.View style={[styles.inner, pressScale.animatedStyle]}>
        <Text
          style={[
            styles.baseLabel,
            compact ? styles.compactLabel : styles.defaultLabel,
            {
              color: isActive ? activeText : inactiveText,
            },
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  baseChip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultChip: {
    minHeight: 42,
    paddingHorizontal: 16,
  },
  compactChip: {
    minHeight: Math.max(40, MIN_TOUCH_TARGET - 4),
    paddingHorizontal: 14,
  },
  baseLabel: {
    fontWeight: '700',
    // La cara ahora viaja en fontFamily (Nunito) — sin esto el variant
    // compact quedaba en fuente de sistema junto a chips default en Nunito.
    fontFamily: nunitoFamily('700'),
  },
  defaultLabel: {
    ...typography.buttonCompact, // fontSize:13, fontWeight:'700'
  },
  compactLabel: {
    fontSize: 12, // no exact preset — closest is buttonCompact(13) or caption(11/500); flagged
    fontWeight: '700',
  },
})
