// @i18n-ignore-file — tooling dev-only gated por __DEV__.
import { StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen } from '@/components/ui/screen'
import { REDESIGN_APPROVAL } from '@/screens/dev/redesign/redesign-approval-status'
import { PreviewListRow } from '@/screens/dev/redesign/redesign-preview-shared'

/**
 * Índice dev-only de los previews del rediseño 2026-07.
 *
 * WORKFLOW DE APROBACIÓN (pedido del owner 2026-07-14): cada vista
 * del rediseño se construye acá como réplica pixel-perfect de
 * design/rediseno-2026-07/ y NO se cablea a la app real hasta que el
 * owner la apruebe contra los mockups. Estado por vista en
 * redesign-approval-status.ts (única fuente).
 */


interface PreviewEntry {
  label: string
  detail: string
  route: string
  /** Key en REDESIGN_APPROVAL. */
  statusKey: string
}

const ENTRIES: PreviewEntry[] = [
  {
    label: 'FIJOS (rediseño)',
    detail: 'Pantalla completa + hero (8 estados E1–E8) + Avisos (6 estados A1–A6) + tabs/categorías · claro/oscuro',
    route: '/(app)/settings/dev/redesign-fijos',
    statusKey: 'fijos',
  },
  {
    label: 'Onboarding fácil (Turno 5)',
    detail: 'Flujo interactivo 5a→5f · aprobación por pantalla',
    route: '/(app)/settings/dev/redesign-onboarding-index',
    statusKey: 'onboarding',
  },
  {
    label: 'Autenticación (Turno 4)',
    detail: 'Bienvenida · Crear cuenta · Login · Face ID · 3a/4a/4b/4c',
    route: '/(app)/settings/dev/redesign-auth-index',
    statusKey: 'auth',
  },
  {
    label: 'Notificaciones (Turno 6)',
    detail: 'Lista + swipe "Listo" · empty state con Brot zen · 7a/7b',
    route: '/(app)/settings/dev/redesign-notif',
    statusKey: 'notif',
  },
  {
    label: 'Barra de navegación',
    detail: 'Flotante + píldora activa + FAB radial · 1b/1c',
    route: '/(app)/settings/dev/redesign-nav-bar',
    statusKey: 'nav-bar',
  },
  {
    label: 'Brot — mascota (18 poses)',
    detail: 'Port Skia de brot.js · 2a',
    route: '/(app)/settings/dev/redesign-brot',
    statusKey: 'brot',
  },
  {
    label: 'Partículas',
    detail: 'Port Skia de particles.js · 4 presets del handoff',
    route: '/(app)/settings/dev/redesign-particles',
    statusKey: 'particles',
  },
]

export function RedesignIndexScreen() {
  const router = useRouter()

  return (
    <Screen
      title="Rediseño 2026-07"
      subtitle="Réplicas pixel-perfect del design doc (design/rediseno-2026-07/). Ninguna vista se cablea a la app real hasta aprobarla acá contra los mockups."
      canGoBack
    >
      <View style={styles.stack}>
        {ENTRIES.map((entry) => (
          <PreviewListRow
            key={entry.route}
            label={entry.label}
            detail={entry.detail}
            status={REDESIGN_APPROVAL[entry.statusKey]}
            onPress={() => router.push(entry.route as never)}
          />
        ))}
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
