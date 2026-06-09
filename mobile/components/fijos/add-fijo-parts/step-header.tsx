// Header del wizard add-fijo: back pill + title centrado + spacer
// derecho. Step 1 → back cierra el sheet; step 2 → back vuelve al
// step 1. Y los dots de progreso. Extraído de `add-fijo-v2-screen.tsx`.
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/theme/theme-provider'

type Step = 1 | 2

export interface StepHeaderProps {
  step: Step
  isEditing: boolean
  /** Step 1 → close sheet. Step 2 → back to step 1. */
  onBack: () => void
}

export function StepHeader({ step, isEditing, onBack }: StepHeaderProps) {
  const { theme } = useAppTheme()
  const stepTitle =
    step === 1 ? (isEditing ? 'Editar fijo' : 'Nuevo fijo') : 'Revisa el impacto'
  return (
    <View style={styles.headerRow}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={step === 2 ? 'Volver al paso anterior' : 'Cerrar'}
        style={[
          styles.backPill,
          { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
        ]}
        hitSlop={10}
      >
        <MaterialIcons name="arrow-back-ios-new" size={18} color={theme.colors.text} />
      </Pressable>
      <Text style={[styles.title, { color: theme.colors.text }]}>{stepTitle}</Text>
      <View style={styles.headerRightSpacer} />
    </View>
  )
}

export function StepDots({ step }: { step: Step }) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.dotsRow}>
      {[1, 2].map((s) => (
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
    gap: 12,
    // Matches el breathing room que el standard Screen header da
    // (Screen paddingTop=4 + ScreenHeader paddingTop=10 = 14pt).
    marginTop: 14,
  },
  backPill: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 22, fontWeight: '800', letterSpacing: -0.6 },
  headerRightSpacer: { width: 40 },
  dotsRow: { flexDirection: 'row', gap: 6 },
  stepBar: { flex: 1, height: 3, borderRadius: 2 },
})
