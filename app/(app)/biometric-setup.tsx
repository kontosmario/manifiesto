import { useSignalDestinationReady } from '@/features/auth-flow/use-signal-destination-ready'
import { NeoBiometricSetupScreen } from '@/screens/auth/neo/neo-biometric-setup-screen'

export default function BiometricSetupRoute() {
  // Destino posible del bridge auth-flow (cuenta nueva pre-onboarding):
  // listo al montar — libera el soar-away del overlay.
  useSignalDestinationReady()
  // Rediseño (2026-07-17): réplica 4c live. Conserva el session check
  // manual (NO RequireAuth) y todos los guards adentro de la screen.
  return <NeoBiometricSetupScreen />
}
