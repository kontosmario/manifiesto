import { type ComponentProps } from 'react'
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { AppSymbol } from '@/components/ui/app-symbol'
import { triggerHaptic } from '@/lib/haptics'
import { withAlpha } from '@/theme/color-utils'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET } from '@/theme/interaction'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'

export function HeroStat({
  compact = false,
  label,
  value,
}: {
  compact?: boolean
  label: string
  value: string
}) {
  const { theme } = useAppTheme()

  return (
    <View
      style={[
        styles.heroStat,
        compact ? styles.heroStatCompact : null,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Text style={[styles.heroStatLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.heroStatValue, { color: theme.colors.text }]}>
        {value}
      </Text>
    </View>
  )
}

export function SettingsRow({
  iconFallback,
  iconName,
  isLoading = false,
  onPress,
  subtitle,
  title,
  value,
}: {
  iconFallback: ComponentProps<typeof AppSymbol>['fallback']
  iconName: string
  isLoading?: boolean
  onPress: () => void
  subtitle: string
  title: string
  value: string
}) {
  const { theme } = useAppTheme()

  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={{
        borderless: false,
        color: withAlpha(theme.colors.text, theme.isDark ? 0.16 : 0.08),
      }}
      hitSlop={DEFAULT_HIT_SLOP}
      onPress={() => {
        void triggerHaptic('selection')
        onPress()
      }}
      pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.86 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.rowIconWrap,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <AppSymbol color={theme.colors.text} fallback={iconFallback} name={iconName} size={18} />
      </View>

      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[styles.rowSubtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
      </View>

      <View style={styles.rowTrailing}>
        <Text style={[styles.rowValue, { color: theme.colors.text }]}>
          {isLoading ? '...' : value}
        </Text>
        <AppSymbol
          color={theme.colors.textSoft}
          fallback="chevron-right"
          name="chevron.right"
          size={14}
        />
      </View>
    </Pressable>
  )
}

export function SettingsSwitchRow({
  description,
  label,
  onValueChange,
  value,
}: {
  description: string
  label: string
  onValueChange: (value: boolean) => void
  value: boolean
}) {
  const { theme } = useAppTheme()
  const toggleValue = (nextValue: boolean) => {
    void triggerHaptic('selection')
    onValueChange(nextValue)
  }

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      android_ripple={{
        borderless: false,
        color: withAlpha(theme.colors.primary, theme.isDark ? 0.18 : 0.1),
      }}
      hitSlop={DEFAULT_HIT_SLOP}
      onPress={() => {
        toggleValue(!value)
      }}
      pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
      style={[
        styles.switchRow,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.switchRowCopy}>
        <Text style={[styles.switchRowTitle, { color: theme.colors.text }]}>{label}</Text>
        <Text style={[styles.switchRowDescription, { color: theme.colors.textMuted }]}>
          {description}
        </Text>
      </View>
      <Switch
        ios_backgroundColor={theme.isDark ? theme.colors.surfaceStrong : theme.colors.borderStrong}
        onValueChange={toggleValue}
        thumbColor="#FFFFFF"
        trackColor={{
          false: theme.isDark ? theme.colors.surfaceStrong : theme.colors.borderStrong,
          true: theme.colors.primary,
        }}
        value={value}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  heroStat: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radii.xl,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  heroStatCompact: {
    minWidth: '48%',
    flexBasis: '48%',
    flexGrow: 0,
  },
  heroStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroStatValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radii.xl,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  rowSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  rowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  switchRowCopy: {
    flex: 1,
    gap: 3,
  },
  switchRowTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  switchRowDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
})
