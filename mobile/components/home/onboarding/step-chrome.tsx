import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { motionDurations } from '@/lib/motion/tokens'
import { useAppTheme } from '@/theme/theme-provider'
import { ONBOARDING_TOTAL_STEPS } from '@/features/onboarding/use-onboarding-state'

interface OnboardingStepHeaderProps {
  /** Título del paso, centrado. Reemplaza el label "PASO X/N" (redundante
   *  con los dots) — da jerarquía y contexto, hermano de add-fijo StepHeader. */
  title: string
  canGoBack: boolean
  onBack: () => void
}

export function OnboardingStepHeader({
  title,
  canGoBack,
  onBack,
}: OnboardingStepHeaderProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  return (
    <View style={styles.headerRow}>
      {canGoBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding:chrome.back')}
          hitSlop={10}
          style={[
            styles.backPill,
            { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
          ]}
        >
          <MaterialIcons name="arrow-back-ios-new" size={18} color={theme.colors.text} />
        </Pressable>
      ) : (
        <View style={styles.backPill} />
      )}
      <Text
        style={[styles.title, { color: theme.colors.text }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <View style={styles.backPill} />
    </View>
  )
}

interface OnboardingStepDotsProps {
  step: number
}

export function OnboardingStepDots({ step }: OnboardingStepDotsProps) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: ONBOARDING_TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
        <StepBar key={s} filled={s <= step} />
      ))}
    </View>
  )
}

// El fill line→text se anima (no salta) al avanzar/retroceder de paso.
function StepBar({ filled }: { filled: boolean }) {
  const { theme } = useAppTheme()
  const p = useSharedValue(filled ? 1 : 0)
  useEffect(() => {
    p.value = withTiming(filled ? 1 : 0, { duration: motionDurations.quick })
  }, [filled, p])
  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      p.value,
      [0, 1],
      [theme.colors.line, theme.colors.text],
    ),
  }))
  return <Animated.View style={[styles.stepBar, style]} />
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backPill: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'transparent',
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  dotsRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  stepBar: { flex: 1, height: 3, borderRadius: 2 },
})
