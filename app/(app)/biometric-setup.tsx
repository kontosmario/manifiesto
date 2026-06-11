import { useSignalDestinationReady } from '@/features/auth-flow/use-signal-destination-ready'
import { BiometricSetupScreen } from '@/screens/auth/biometric-setup-screen'

export default function BiometricSetupRoute() {
  // Destino posible del bridge auth-flow (cuenta nueva pre-onboarding):
  // listo al montar — libera el soar-away del overlay.
  useSignalDestinationReady()
  return <BiometricSetupScreen />
}
