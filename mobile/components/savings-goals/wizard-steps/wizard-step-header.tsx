import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

export interface WizardStepHeaderProps {
  step: number
  stepCount: number
  eyebrow: string
  title: string
  busy: boolean
  onGoBack: () => void
}

/**
 * Header del wizard: chevron-back + bloque (eyebrow + título) en una
 * sola fila. En step 1 el chevron se reemplaza por un icono "flag"
 * decorativo del mismo tamaño para preservar el rhythm visual.
 */
export function WizardStepHeader({
  step,
  stepCount,
  eyebrow,
  title,
  busy,
  onGoBack,
}: WizardStepHeaderProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.row}>
      {step > 1 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Volver al paso ${step - 1} de ${stepCount}`}
          onPress={onGoBack}
          disabled={busy}
          hitSlop={10}
          style={({ pressed }) => [
            styles.back,
            {
              backgroundColor: theme.colors.surfaceMuted,
              opacity: busy ? 0.4 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <MaterialIcons
            name="chevron-left"
            size={22}
            color={theme.colors.text}
          />
        </Pressable>
      ) : (
        // Step 1: el slot del chevron lo ocupa un icono decorativo
        // (bandera de meta) — mismas dimensiones, border + tinte
        // primary para destacarlo como contextual no-actionable.
        <View
          style={[
            styles.icon,
            {
              backgroundColor: theme.colors.primarySurface,
              borderColor: theme.colors.primary,
            },
          ]}
          accessibilityRole="image"
          accessibilityLabel="Crear meta de ahorro"
        >
          <MaterialIcons
            name="flag"
            size={20}
            color={theme.colors.primary}
          />
        </View>
      )}

      <View style={styles.textCol}>
        <Text style={[typography.eyebrow, { color: theme.colors.textMuted }]}>
          {eyebrow}
        </Text>
        <Text style={[typography.titleMedium, { color: theme.colors.text }]}>
          {title}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 14,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  textCol: {
    flex: 1,
    gap: 4,
  },
})
