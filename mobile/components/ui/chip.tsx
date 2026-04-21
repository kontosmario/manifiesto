import { Pressable, StyleSheet, Text } from 'react-native'
import { triggerHaptic } from '@/lib/haptics'
import { withAlpha } from '@/theme/color-utils'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET, MIN_TOUCH_TARGET } from '@/theme/interaction'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface ChipProps {
  label: string
  isActive?: boolean
  onPress?: () => void
  color?: string
  compact?: boolean
}

export function Chip({ label, isActive = false, onPress, color, compact = false }: ChipProps) {
  const { theme } = useAppTheme()
  const isDisabled = !onPress

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, selected: isActive }}
      android_ripple={{
        borderless: false,
        color: isActive
          ? withAlpha('#FFFFFF', 0.16)
          : withAlpha(color ?? theme.colors.primary, theme.isDark ? 0.2 : 0.12),
      }}
      disabled={isDisabled}
      hitSlop={DEFAULT_HIT_SLOP}
      pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
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
          backgroundColor: isActive ? color ?? theme.colors.primary : theme.colors.surfaceMuted,
          borderColor: isActive ? color ?? theme.colors.primary : theme.colors.border,
          opacity: pressed ? 0.86 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.baseLabel,
          compact ? styles.compactLabel : styles.defaultLabel,
          {
            color: isActive ? '#FFFFFF' : theme.colors.text,
          },
        ]}
      >
        {label}
      </Text>
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
  },
  defaultLabel: {
    ...typography.buttonCompact, // fontSize:13, fontWeight:'700'
  },
  compactLabel: {
    fontSize: 12, // no exact preset — closest is buttonCompact(13) or caption(11/500); flagged
    fontWeight: '700',
  },
})
