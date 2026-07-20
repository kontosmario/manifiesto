import { View } from 'react-native'
import { Redirect } from 'expo-router'
import { BlockingScreenView } from '@/components/ui/blocking-screen-view'
import { ModalContentEntrance } from '@/components/ui/modal-content-entrance'
import { ONB_SPEC } from '@/components/redesign/onboarding/onb-spec'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useMyProfile } from '@/features/profile/use-profile'
import { useIsAuthOverlayVisible } from '@/features/auth-flow/use-auth-flow'
import { useSignalDestinationReady } from '@/features/auth-flow/use-signal-destination-ready'
import { useThemeMode } from '@/theme/theme-provider'
import { NeoOnboardingScreen } from '@/screens/home/neo/neo-onboarding-screen'

export default function OnboardingRoute() {
  const sessionQuery = useAuthSession()
  const session = sessionQuery.data ?? null
  const userId = session?.user.id
  const profileQuery = useMyProfile(userId)
  const isLoading = sessionQuery.isLoading || (Boolean(userId) && profileQuery.isLoading)
  const overlayVisible = useIsAuthOverlayVisible()
  const mode = useThemeMode().resolvedMode

  // Máquina auth-flow: el onboarding como destino del bridge (signup,
  // o unlock con onboarding pendiente) está listo cuando su data
  // resolvió — eso libera el soar-away del overlay.
  useSignalDestinationReady(!isLoading)

  if (isLoading) {
    if (overlayVisible) {
      // Bajo el overlay z50 del rediseño: lienzo del ONB_SPEC (mismo bg
      // que el onboarding neo) en vez del launch splash VIEJO — si el
      // timing del soar llegara a exponerlo, matchea la superficie que
      // revela, sin flash del diseño anterior (review r2).
      return <View style={{ flex: 1, backgroundColor: ONB_SPEC[mode].bg }} />
    }
    return <BlockingScreenView message="Preparando tu espacio..." />
  }

  if (!session || !userId) {
    return <Redirect href="/(auth)/welcome" />
  }

  // If onboarding is already complete, route to the welcome screen.
  // During the wizard's own handleFinish, this fires the moment the
  // mutation's setQueryData flips the cache; redirecting to the
  // welcome screen (instead of home) ensures no flash of Home between
  // "wizard finishes" and "welcome screen visible". A returning user
  // who manually navigates here also lands on the welcome screen,
  // which is a benign brief moment before they tap "Empezar" to home.
  if (profileQuery.data?.onboarding_completed_at) {
    return <Redirect href="/(app)/onboarding-success" />
  }

  return (
    <ModalContentEntrance style={{ flex: 1 }}>
      <NeoOnboardingScreen userId={userId} />
    </ModalContentEntrance>
  )
}
