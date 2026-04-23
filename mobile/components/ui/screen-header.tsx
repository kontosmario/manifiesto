import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { withAlpha } from '@/theme/color-utils'
import { buildMinimumTouchTargetHitSlop, DEFAULT_PRESS_RETENTION_OFFSET } from '@/theme/interaction'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface ScreenHeaderProps {
  canGoBack: boolean
  onBackPress: () => void
  rightSlot?: ReactNode
  subtitle?: string
  title?: string
  titleColor?: string
}

export function ScreenHeader({
  canGoBack,
  onBackPress,
  rightSlot,
  subtitle,
  title,
  titleColor,
}: ScreenHeaderProps) {
  const { theme } = useAppTheme()

  return (
    <View style={styles.header}>
      <View style={styles.headerMain}>
        <View style={styles.headerTitleRow}>
          {canGoBack ? (
            <Pressable
              accessibilityLabel="Volver"
              accessibilityRole="button"
              android_ripple={{
                borderless: false,
                color: withAlpha(theme.colors.text, theme.isDark ? 0.18 : 0.08),
                radius: 20,
              }}
              hitSlop={buildMinimumTouchTargetHitSlop(40)}
              onPress={onBackPress}
              pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
              style={({ pressed }) => [
                styles.backButton,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
            >
              <MaterialIcons color={theme.colors.text} name="arrow-back-ios-new" size={18} />
            </Pressable>
          ) : null}
          {title ? (
            <Text
              style={[
                styles.title,
                theme.typography.screenTitle,
                { color: titleColor ?? theme.colors.text },
              ]}
            >
              {title}
            </Text>
          ) : null}
        </View>
        {subtitle ? (
          <Text style={[styles.subtitle, theme.typography.body, { color: theme.colors.textMuted }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightSlot ? <View>{rightSlot}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 10,
  },
  headerMain: {
    flex: 1,
    gap: 8,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flexShrink: 1,
  },
  subtitle: {},
})
