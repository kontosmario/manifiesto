// @i18n-ignore-file — tooling dev-only gated por __DEV__.
import { StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen } from '@/components/ui/screen'
import { REDESIGN_APPROVAL } from '@/screens/dev/redesign/redesign-approval-status'
import { PreviewListRow } from '@/screens/dev/redesign/redesign-preview-shared'
import { ONB_STEP_ORDER, type OnbStep } from '@/components/redesign/onboarding/onb-flow-state'

/**
 * Sub-índice de aprobación del onboarding (Turno 5): una fila por
 * pantalla con su chip PENDIENTE/APROBADA (decisión owner: aprobación
 * por pantalla; estado en redesign-approval-status.ts, keys `onb-*`).
 * Cada fila entra al flujo interactivo en ese paso.
 */


const SCREEN_META: Record<OnbStep, { label: string; source: string }> = {
  '5a': { label: 'Tu nombre', source: '5a/5ao' },
  '5b': { label: 'Tu avatar', source: '5b/5bo' },
  '5c': { label: 'Tu hogar', source: '5c/5co' },
  '5d': { label: 'Tus ingresos (5 casos)', source: '5d–5d5 (+o)' },
  '5e': { label: 'Tu ahorro', source: '5e/5eo' },
  '5e2': { label: 'Tu meta (opcional)', source: '5e2/5e2o' },
  '5f': { label: '¡Listo! · Resumen', source: '5f/5fo' },
}

export function RedesignOnboardingIndexScreen() {
  const router = useRouter()

  return (
    <Screen
      title="Onboarding fácil (Turno 5)"
      subtitle="Flujo interactivo full-screen con toggle claro/oscuro. Cada fila entra al flujo en esa pantalla; la aprobación es por pantalla contra screens/*.html."
      canGoBack
    >
      <View style={styles.stack}>
        {ONB_STEP_ORDER.map((step) => {
          const meta = SCREEN_META[step]
          return (
            <PreviewListRow
              key={step}
              label={`${step} · ${meta.label}`}
              detail={`screens/${meta.source}`}
              status={REDESIGN_APPROVAL[`onb-${step}`]}
              onPress={() =>
                router.push(`/(app)/settings/dev/redesign-onboarding?step=${step}` as never)
              }
            />
          )
        })}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  stack: {
    gap: 12,
    paddingBottom: 40,
  },
})
