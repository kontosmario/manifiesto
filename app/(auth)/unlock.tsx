import { UnlockScreen } from '@/screens/auth/unlock-screen'

// Dedicated unlock route. AppEntryGate redirects here whenever the user
// has a valid session + biometric configured + app is locked. Replaces
// the old `/(auth)/login?lock=1&autoBiometric=1` hack that reused the
// sign-in screen for unlock duties.
//
// Ver `mobile/screens/auth/unlock-screen.tsx` para el rationale completo.
export default function UnlockRoute() {
  return <UnlockScreen />
}
