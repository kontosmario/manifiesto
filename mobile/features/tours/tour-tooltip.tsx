import { Pressable, StyleSheet, Text, View } from 'react-native'
import { triggerHaptic } from '@/lib/haptics'
import { surfaceScale } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'
import { useTour } from './tour-context'

const FALLBACK_BACKGROUND = surfaceScale[900]
const FALLBACK_FOREGROUND = surfaceScale[50]
const FALLBACK_FOREGROUND_MUTED = surfaceScale[300]

/**
 * The card that explains what each step is about. Pulls everything
 * — current step text, step number, navigation, defaults — from the
 * tour context. Per-step `tooltip` overrides on the active step's
 * `<TourTarget>` win over provider defaults.
 *
 * The card is intentionally always-dark regardless of system theme:
 * it sits over a strong dark scrim, so a light-mode surface would
 * read as a halo against it.
 */
export function TourTooltip() {
  const { theme } = useAppTheme()
  const {
    activeIndex,
    totalSteps,
    isFirstStep,
    isLastStep,
    currentConfig,
    next,
    prev,
    stop,
    defaults,
  } = useTour()

  if (!currentConfig) return null

  const tooltipStyle = currentConfig.tooltip
  const background = tooltipStyle?.backgroundColor ?? FALLBACK_BACKGROUND
  const foreground = tooltipStyle?.foregroundColor ?? FALLBACK_FOREGROUND
  const muted = tooltipStyle?.mutedForeground ?? FALLBACK_FOREGROUND_MUTED
  const primary = tooltipStyle?.primaryColor ?? theme.colors.primary
  const primaryFg =
    tooltipStyle?.primaryForeground ?? (theme.isDark ? '#0E1B14' : '#FFFFFF')

  const labels = defaults.labels

  const handleNext = () => {
    void triggerHaptic('light')
    if (isLastStep) {
      stop(true)
    } else {
      next()
    }
  }
  const handlePrev = () => {
    void triggerHaptic('light')
    prev()
  }
  const handleSkip = () => {
    void triggerHaptic('selection')
    stop(false)
  }

  return (
    <View style={[styles.card, { backgroundColor: background }]}>
      <View style={styles.header}>
        <Text style={[styles.counter, { color: muted }]}>
          {activeIndex + 1} / {totalSteps}
        </Text>
        <Pressable
          accessibilityLabel={labels.skip}
          accessibilityRole="button"
          hitSlop={8}
          onPress={handleSkip}
        >
          <Text style={[styles.skip, { color: muted }]}>{labels.skip}</Text>
        </Pressable>
      </View>
      <Text style={[styles.body, { color: foreground }]}>
        {currentConfig.text}
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={labels.previous}
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
          <Text style={[styles.secondaryLabel, { color: foreground }]}>
            {labels.previous}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={isLastStep ? labels.finish : labels.next}
          accessibilityRole="button"
          hitSlop={8}
          onPress={handleNext}
          style={({ pressed }) => [
            styles.primary,
            {
              backgroundColor: primary,
              opacity: pressed ? 0.92 : 1,
            },
          ]}
        >
          <Text style={[styles.primaryLabel, { color: primaryFg }]}>
            {isLastStep ? labels.finish : labels.next}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 12,
    // No border — relies on shadow for elevation. Halo-free on
    // any scrim color.
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
    borderColor: 'rgba(255, 255, 255, 0.16)',
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
