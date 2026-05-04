import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useCopilot, type TooltipProps } from 'react-native-copilot'
import { triggerHaptic } from '@/lib/haptics'
import { surfaceScale } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

// The tooltip always sits over a strong dark scrim regardless of
// the system theme, so a "floating mini-sheet" rendered in dark
// reads better than swapping with light/dark mode. Concretely: a
// light-mode tooltip with a 1px border showed a halo against the
// scrim that the user described as a "marco blanco antiestético".
// Pinning the surface to V1 surface-900 (`#244235`) and dropping
// the border kills the halo and unifies both modes.
const TOOLTIP_BACKGROUND = surfaceScale[900]
const TOOLTIP_FOREGROUND = surfaceScale[50]
const TOOLTIP_FOREGROUND_MUTED = surfaceScale[300]

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
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.counter}>
          {currentStepNumber} / {totalStepsNumber}
        </Text>
        <Pressable
          accessibilityLabel={labels.skip ?? 'Saltar'}
          accessibilityRole="button"
          hitSlop={8}
          onPress={handleSkip}
        >
          <Text style={styles.skip}>{labels.skip ?? 'Saltar'}</Text>
        </Pressable>
      </View>
      <Text style={styles.body}>{currentStep.text}</Text>
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
              opacity: isFirstStep ? 0.32 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={styles.secondaryLabel}>{labels.previous ?? 'Anterior'}</Text>
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
    backgroundColor: TOOLTIP_BACKGROUND,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 12,
    // Shadow only — no border. The previous theme.colors.border
    // halo'd as a "marco blanco" against the dark scrim.
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.42,
    shadowRadius: 18,
    elevation: 14,
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
    color: TOOLTIP_FOREGROUND_MUTED,
  },
  skip: {
    fontSize: 13,
    fontWeight: '600',
    color: TOOLTIP_FOREGROUND_MUTED,
  },
  body: {
    ...typography.body,
    fontSize: 15,
    lineHeight: 21,
    color: TOOLTIP_FOREGROUND,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
  },
  secondary: {
    // Subtle pill outline using the foreground muted at low alpha,
    // so the button reads against the dark card without re-creating
    // the harsh 1px contour we just removed from the card itself.
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  secondaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: TOOLTIP_FOREGROUND,
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
