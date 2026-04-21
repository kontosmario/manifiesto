import { Pressable, StyleSheet, Text, View } from 'react-native'
import { triggerHaptic } from '@/lib/haptics'
import { buildElevationStyle } from '@/theme/elevation'
import { withAlpha } from '@/theme/color-utils'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET, MIN_TOUCH_TARGET } from '@/theme/interaction'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface SegmentOption<T extends string> {
  label: string
  value: T
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
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
      {options.map((option) => {
        const isActive = option.value === value

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            android_ripple={{
              borderless: false,
              color: isActive
                ? withAlpha(theme.colors.text, theme.isDark ? 0.16 : 0.08)
                : withAlpha(theme.colors.primary, theme.isDark ? 0.2 : 0.12),
            }}
            key={option.value}
            onPress={() => {
              if (!isActive) {
                void triggerHaptic('selection')
              }
              onChange(option.value)
            }}
            hitSlop={DEFAULT_HIT_SLOP}
            pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
            style={({ pressed }) => [
              styles.item,
              isActive ? buildElevationStyle(theme, 'segmentedActive') : null,
              {
                backgroundColor: isActive ? theme.colors.surface : 'transparent',
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                {
                  color: isActive ? theme.colors.text : theme.colors.textMuted,
                },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: radii.md, // 14 — exact match
    borderWidth: 1,
    padding: 3,
    gap: 4,
    overflow: 'hidden',
  },
  item: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.sm, // was 11; nearest token sm=10 (intentional 1pt tightening)
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  label: {
    ...typography.buttonCompact, // fontSize:13, fontWeight:'700'
    textAlign: 'center',
  },
})
