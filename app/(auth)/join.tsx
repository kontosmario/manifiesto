import { useSignalDestinationReady } from '@/features/auth-flow/use-signal-destination-ready'
import { JoinScreen } from '@/screens/auth/join-screen'

export default function JoinRoute() {
  // Destino posible del bridge auth-flow (sesión sin familia): listo
  // al montar — libera el soar-away del overlay.
  useSignalDestinationReady()
  return <JoinScreen />
}
