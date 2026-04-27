import { type ReactNode } from 'react'
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'

type IconName = keyof typeof MaterialIcons.glyphMap

// ─── Group ──────────────────────────────────────────────────────────
interface SettingsGroupProps {
  title: string
  footer?: string
  children: ReactNode
  style?: StyleProp<ViewStyle>
}

export function SettingsGroup({ title, footer, children, style }: SettingsGroupProps) {
  const { theme } = useAppTheme()
  return (
    <View style={[styles.groupStack, style]}>
      <View
        style={[
          styles.eyebrowWrap,
          { borderBottomColor: theme.colors.line },
        ]}
      >
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
          {title.toUpperCase()}
        </Text>
      </View>
      <View
        style={[
          styles.groupCard,
          {
            backgroundColor: theme.colors.creamCard,
            borderColor: theme.colors.line,
          },
        ]}
      >
        {children}
      </View>
      {footer ? (
        <Text style={[styles.footer, { color: theme.colors.textMuted }]}>{footer}</Text>
      ) : null}
    </View>
  )
}

// ─── Shared row chrome ──────────────────────────────────────────────
function useRowScale() {
  const reduced = useReducedMotion()
  const scale = useSharedValue(1)
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  const onPressIn = () => {
    if (reduced) return
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value write
    scale.value = withTiming(0.97, { duration: 90 })
  }
  const onPressOut = () => {
    if (reduced) return
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value write
    scale.value = withTiming(1, { duration: 140 })
  }
  return { style, onPressIn, onPressOut }
}

// ─── Navigation row ─────────────────────────────────────────────────
interface SettingsRowProps {
  icon: IconName
  label: string
  value?: string
  helper?: string
  onPress?: () => void
  destructive?: boolean
  disabled?: boolean
  disabledHint?: string
  isLoading?: boolean
  trailing?: ReactNode
  isLast?: boolean
}

export function SettingsRow({
  icon,
  label,
  value,
  helper,
  onPress,
  destructive = false,
  disabled = false,
  disabledHint,
  isLoading = false,
  trailing,
  isLast = false,
}: SettingsRowProps) {
  const { theme } = useAppTheme()
  const pressScale = useRowScale()

  const iconColor = destructive
    ? theme.colors.danger
    : disabled
      ? theme.colors.textSoft
      : theme.colors.text
  const labelColor = destructive
    ? theme.colors.danger
    : disabled
      ? theme.colors.textSoft
      : theme.colors.text
  const trailingText = disabled && disabledHint ? disabledHint : value

  const content = (
    <Animated.View
      style={[
        styles.row,
        !isLast && { borderBottomColor: theme.colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
        pressScale.style,
        disabled ? { opacity: 0.5 } : null,
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: theme.colors.creamSoft,
            borderColor: theme.colors.line,
          },
        ]}
      >
        <MaterialIcons color={iconColor} name={icon} size={22} />
      </View>
      <View style={styles.copyWrap}>
        <Text numberOfLines={1} style={[styles.label, { color: labelColor }]}>
          {label}
        </Text>
        {helper ? (
          <Text numberOfLines={2} style={[styles.helper, { color: theme.colors.textMuted }]}>
            {helper}
          </Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        {isLoading ? (
          <Text style={[styles.value, { color: theme.colors.textMuted }]}>…</Text>
        ) : trailing ? (
          trailing
        ) : trailingText ? (
          <Text
            numberOfLines={1}
            style={[
              styles.value,
              {
                color: disabled ? theme.colors.textSoft : theme.colors.textMuted,
                maxWidth: 160,
              },
            ]}
          >
            {trailingText}
          </Text>
        ) : null}
        {onPress && !trailing ? (
          <MaterialIcons
            color={theme.colors.textSoft}
            name="chevron-right"
            size={22}
          />
        ) : null}
      </View>
    </Animated.View>
  )

  if (!onPress) {
    return <View accessibilityRole="summary">{content}</View>
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        void triggerHaptic('selection')
        onPress()
      }}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      style={({ pressed }) => [{ opacity: pressed && !disabled ? 0.94 : 1 }]}
    >
      {content}
    </Pressable>
  )
}

// ─── Switch row ─────────────────────────────────────────────────────
interface SettingsSwitchRowProps {
  icon: IconName
  label: string
  helper?: string
  value: boolean
  onValueChange: (next: boolean) => void
  disabled?: boolean
  isLast?: boolean
}

export function SettingsSwitchRow({
  icon,
  label,
  helper,
  value,
  onValueChange,
  disabled = false,
  isLast = false,
}: SettingsSwitchRowProps) {
  const { theme } = useAppTheme()
  const iconColor = disabled ? theme.colors.textSoft : theme.colors.text

  return (
    <View
      style={[
        styles.row,
        !isLast && { borderBottomColor: theme.colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
        disabled ? { opacity: 0.5 } : null,
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: theme.colors.creamSoft,
            borderColor: theme.colors.line,
          },
        ]}
      >
        <MaterialIcons color={iconColor} name={icon} size={22} />
      </View>
      <View style={styles.copyWrap}>
        <Text numberOfLines={1} style={[styles.label, { color: theme.colors.text }]}>
          {label}
        </Text>
        {helper ? (
          <Text numberOfLines={2} style={[styles.helper, { color: theme.colors.textMuted }]}>
            {helper}
          </Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        <Switch
          disabled={disabled}
          ios_backgroundColor={theme.isDark ? theme.colors.surfaceStrong : theme.colors.borderStrong}
          onValueChange={(next) => {
            void triggerHaptic('selection')
            onValueChange(next)
          }}
          thumbColor="#FFFFFF"
          trackColor={{
            false: theme.isDark ? theme.colors.surfaceStrong : theme.colors.borderStrong,
            true: theme.colors.primary,
          }}
          value={value}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  groupStack: {
    gap: 8,
  },
  eyebrowWrap: {
    paddingHorizontal: 4,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  groupCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  footer: {
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyWrap: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
  },
  helper: {
    fontSize: 12,
    lineHeight: 16,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
  },
})
