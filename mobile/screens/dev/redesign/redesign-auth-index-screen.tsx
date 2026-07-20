// @i18n-ignore-file — tooling dev-only gated por __DEV__.
import { StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen } from '@/components/ui/screen'
import { REDESIGN_APPROVAL } from '@/screens/dev/redesign/redesign-approval-status'
import { PreviewListRow } from '@/screens/dev/redesign/redesign-preview-shared'

/**
 * Sub-índice de aprobación del flujo de auth (Turno 4): una fila por
 * pantalla con su chip PENDIENTE/APROBADA (decisión owner: aprobación
 * por pantalla; estado en redesign-approval-status.ts, keys `auth-*`).
 * Cada fila entra al flujo interactivo en ese paso.
 */

interface Row {
  step: string
  label: string
  source: string
  statusKey: string
}

const ROWS: Row[] = [
  {
    step: 'coldstart',
    label: 'Arranque sin sesión (splash → Bienvenida)',
    source: 'handoff arranque · coldstart.js',
    statusKey: 'auth-coldstart',
  },
  {
    step: 'coldstart-sesion',
    label: 'Arranque con sesión (splash → bridge)',
    source: 'handoff arranque · coldstart + bridge',
    statusKey: 'auth-coldstart',
  },
  { step: 'welcome', label: '3a · Bienvenida', source: 'screens/3a', statusKey: 'auth-3a' },
  { step: 'signup', label: '4a · Crear cuenta', source: 'screens/4a·4ao', statusKey: 'auth-4a' },
  { step: 'login', label: '4b · Login', source: 'screens/4b·4bo', statusKey: 'auth-4b' },
  { step: 'faceid', label: '4c · Activa Face ID', source: 'screens/4c·4co', statusKey: 'auth-4c' },
  // ── Derivadas SIN mockup (Fase 3, patrón 5g/5h) ────────────────────
  {
    step: 'login-returning',
    label: 'Login · recurrente (avatar)',
    source: 'sin mockup · login-screen.tsx',
    statusKey: 'auth-login-vistas',
  },
  {
    step: 'login-faceid',
    label: 'Login · Face ID automático',
    source: 'sin mockup · login-screen.tsx',
    statusKey: 'auth-login-vistas',
  },
  {
    step: 'login-secondary',
    label: 'Login · solo secundarias',
    source: 'sin mockup · login-screen.tsx',
    statusKey: 'auth-login-vistas',
  },
  {
    step: 'forgot',
    label: 'Olvidé mi contraseña',
    source: 'sin mockup · forgot-password-screen.tsx',
    statusKey: 'auth-forgot',
  },
  {
    step: 'pin-setup',
    label: 'PIN · crear (4/6 dígitos)',
    source: 'sin mockup · pin-setup-screen.tsx',
    statusKey: 'auth-pin',
  },
  {
    step: 'pin-lock',
    label: 'PIN · desbloqueo + lockout',
    source: 'sin mockup · pin-lock-panel.tsx',
    statusKey: 'auth-pin',
  },
  {
    step: 'bridge',
    label: 'Bridge · success (barra + fade)',
    source: 'handoff arranque · authbridge2.js',
    statusKey: 'auth-bridge',
  },
  {
    step: 'bridge-error',
    label: 'Bridge · fail (65% + reintentar)',
    source: 'handoff arranque · authbridge2.js',
    statusKey: 'auth-bridge',
  },
  {
    step: 'plan',
    label: '4m · Plan del hogar (paywall)',
    source: 'screens/4m·4mo',
    statusKey: 'auth-plan',
  },
  {
    step: 'offline',
    label: 'Sin conexión (Brot marchito)',
    source: 'sin mockup · offline-takeover',
    statusKey: 'auth-offline',
  },
]

export function RedesignAuthIndexScreen() {
  const router = useRouter()

  return (
    <Screen
      title="Autenticación (Turno 4)"
      subtitle="Flujo interactivo que espeja los recorridos REALES: alta → Face ID → onboarding (sin bridge); login, forgot y arranque con sesión → bridge → Inicio. Cada fila entra al flujo en esa pantalla; aprobación por pantalla."
      canGoBack
    >
      <View style={styles.stack}>
        {ROWS.map((row) => (
          <PreviewListRow
            key={row.step}
            label={row.label}
            detail={row.source}
            status={REDESIGN_APPROVAL[row.statusKey]}
            onPress={() =>
              router.push(`/(app)/settings/dev/redesign-auth?step=${row.step}` as never)
            }
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
