import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/theme/theme-provider'
import { ONBOARDING_TOTAL_STEPS } from '@/features/onboarding/use-onboarding-state'

interface OnboardingStepHeaderProps {
  step: number
  canGoBack: boolean
  onBack: () => void
}

export function OnboardingStepHeader({
  step,
  canGoBack,
  onBack,
}: OnboardingStepHeaderProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.headerRow}>
      {canGoBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Volver al paso anterior"
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
      <Text style={[styles.stepLabel, { color: theme.colors.textMuted }]}>
        PASO {step} / {ONBOARDING_TOTAL_STEPS}
      </Text>
      <View style={styles.backPill} />
    </View>
  )
}

interface OnboardingStepDotsProps {
  step: number
}

export function OnboardingStepDots({ step }: OnboardingStepDotsProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: ONBOARDING_TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
        <View
          key={s}
          style={[
            styles.stepBar,
            {
              backgroundColor: s <= step ? theme.colors.text : theme.colors.line,
            },
          ]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  stepLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  dotsRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  stepBar: { flex: 1, height: 3, borderRadius: 2 },
})
