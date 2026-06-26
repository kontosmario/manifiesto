import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { AppButton } from '@/components/ui/button'
import { useLoopAnimation } from '@/hooks/use-loop-animation'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface ErrorStateProps {
  actionLabel?: string
  description?: string
  title?: string
  onAction?: () => void
}

export function ErrorState({
  actionLabel,
  description,
  title,
  onAction,
}: ErrorStateProps) {
  const { t } = useTranslation()
  const resolvedActionLabel = actionLabel ?? t('states:errorState.action')
  const resolvedDescription = description ?? t('states:errorState.description')
  const resolvedTitle = title ?? t('states:errorState.title')
  const { theme } = useAppTheme()
  const pulse = useSharedValue(1)

  useLoopAnimation(
    () => {
      pulse.value = withRepeat(
        withSequence(
          // @motion-allow: 800ms error-state pulse half-cycle; deliberately calmer than pulse (1200) for empathy on error
          withTiming(1.04, { duration: 800 }),
          // @motion-allow: 800ms error-state pulse half-cycle; deliberately calmer than pulse (1200) for empathy on error
          withTiming(1, { duration: 800 }),
        ),
        -1,
        false,
      )
    },
    [pulse],
  )

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
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
      <Animated.View
        style={[
          styles.iconWrap,
          iconAnimatedStyle,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <MaterialIcons color={theme.colors.danger} name="error-outline" size={24} />
      </Animated.View>
      <Text style={[styles.title, theme.typography.titleMedium, { color: theme.colors.text }]}>
        {resolvedTitle}
      </Text>
      <Text style={[styles.description, theme.typography.body, { color: theme.colors.textMuted }]}>
        {resolvedDescription}
      </Text>
      {onAction ? (
        <AppButton
          fullWidth={false}
          haptic="error"
          label={resolvedActionLabel}
          onPress={onAction}
          variant="secondary"
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: 12,
    paddingHorizontal: 22,
    paddingVertical: 22,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  title: {
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
  },
})
