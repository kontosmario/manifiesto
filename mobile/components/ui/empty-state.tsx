import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { AppButton } from '@/components/ui/button'
import { type EmptyStateKey } from '@/lib/copy/states'
import { motionDurations, motionSprings, motionStagger } from '@/lib/motion'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface EmptyStateProps {
  action?: {
    label: string
    onPress: () => void
  }
  icon?: keyof typeof MaterialIcons.glyphMap
  subtitle?: string
  title?: string
  stateKey?: EmptyStateKey
}

export function EmptyState({
  action,
  title,
  subtitle,
  icon = 'info-outline',
  stateKey,
}: EmptyStateProps) {
  const { t } = useTranslation()
  const resolvedTitle =
    title ?? (stateKey ? t(`states:empty.${stateKey}.title`) : '')
  const resolvedSubtitle =
    subtitle ?? (stateKey ? t(`states:empty.${stateKey}.description`) : '')
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()

  const iconScale = useSharedValue(reduceMotion ? 1 : 0.85)
  const iconOpacity = useSharedValue(reduceMotion ? 1 : 0)
  const textOpacity = useSharedValue(reduceMotion ? 1 : 0)
  const textTranslate = useSharedValue(reduceMotion ? 0 : 6)

  useEffect(() => {
    if (reduceMotion) return
    iconScale.value = withSpring(1, motionSprings.celebrate)
    iconOpacity.value = withTiming(1, { duration: motionDurations.quick })
    textOpacity.value = withDelay(
      motionStagger.section,
      withTiming(1, { duration: motionDurations.standard }),
    )
    textTranslate.value = withDelay(
      motionStagger.section,
      withSpring(0, motionSprings.enter),
    )
  }, [reduceMotion, iconScale, iconOpacity, textOpacity, textTranslate])

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ scale: iconScale.value }],
  }))

  const textAnimatedStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textTranslate.value }],
  }))

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
      <Animated.View style={iconAnimatedStyle}>
        <MaterialIcons color={theme.colors.textSoft} name={icon} size={24} />
      </Animated.View>
      <Animated.View style={[styles.textBlock, textAnimatedStyle]}>
        <Text style={[styles.title, theme.typography.titleMedium, { color: theme.colors.text }]}>
          {resolvedTitle}
        </Text>
        <Text style={[styles.subtitle, theme.typography.body, { color: theme.colors.textMuted }]}>
          {resolvedSubtitle}
        </Text>
      </Animated.View>
      {action ? (
        <AppButton
          fullWidth={false}
          haptic="light"
          label={action.label}
          onPress={action.onPress}
          size="compact"
          variant="secondary"
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
    gap: 12,
  },
  textBlock: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
})
