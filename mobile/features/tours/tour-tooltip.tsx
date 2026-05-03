import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useCopilot, type TooltipProps } from 'react-native-copilot'
import { triggerHaptic } from '@/lib/haptics'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Custom tooltip that matches the Manifiesto motion + palette
 * vocabulary instead of the library's generic look. Shows step
 * counter, body text, and Skip / Anterior / Siguiente / Finalizar
 * controls. The library's default Spanish labels are passed through
 * the `labels` prop on the provider so the buttons stay localized.
 *
 * The card uses `theme.colors.surface` + `border` so it lifts off
 * the dark scrim cleanly in both light and dark modes — verified
 * AA contrast on body text against either surface.
 */
export function TourTooltip({ labels }: TooltipProps) {
  const { theme } = useAppTheme()
  const {
    currentStep,
    currentStepNumber,
    goToNext,
    goToPrev,
    isFirstStep,
    isLastStep,
    stop,
    totalStepsNumber,
  } = useCopilot()

  if (!currentStep) return null

  const handleNext = () => {
    void triggerHaptic('light')
    if (isLastStep) {
      void stop()
    } else {
      void goToNext()
    }
  }

  const handlePrev = () => {
    void triggerHaptic('light')
    void goToPrev()
  }

  const handleSkip = () => {
    void triggerHaptic('selection')
    void stop()
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          shadowColor: theme.isDark ? '#000000' : '#0F2A1E',
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.counter, { color: theme.colors.primaryStrong }]}>
          {currentStepNumber} / {totalStepsNumber}
        </Text>
        <Pressable
          accessibilityLabel={labels.skip ?? 'Saltar'}
          accessibilityRole="button"
          hitSlop={8}
          onPress={handleSkip}
        >
          <Text style={[styles.skip, { color: theme.colors.textMuted }]}>
            {labels.skip ?? 'Saltar'}
          </Text>
        </Pressable>
      </View>
      <Text style={[styles.body, { color: theme.colors.text }]}>
        {currentStep.text}
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={labels.previous ?? 'Anterior'}
          accessibilityRole="button"
          disabled={isFirstStep}
          hitSlop={8}
          onPress={handlePrev}
          style={({ pressed }) => [
            styles.secondary,
            {
              borderColor: theme.colors.border,
              opacity: isFirstStep ? 0.36 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[styles.secondaryLabel, { color: theme.colors.text }]}>
            {labels.previous ?? 'Anterior'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={
            isLastStep ? labels.finish ?? 'Finalizar' : labels.next ?? 'Siguiente'
          }
          accessibilityRole="button"
          hitSlop={8}
          onPress={handleNext}
          style={({ pressed }) => [
            styles.primary,
            {
              backgroundColor: theme.colors.primary,
              opacity: pressed ? 0.92 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.primaryLabel,
              { color: theme.isDark ? '#0E1B14' : '#FFFFFF' },
            ]}
          >
            {isLastStep
              ? labels.finish ?? 'Finalizar'
              : labels.next ?? 'Siguiente'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 12,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counter: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  skip: {
    fontSize: 13,
    fontWeight: '600',
  },
  body: {
    ...typography.body,
    fontSize: 15,
    lineHeight: 21,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
  },
  secondary: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  secondaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  primary: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    minWidth: 110,
    alignItems: 'center',
  },
  primaryLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
})
