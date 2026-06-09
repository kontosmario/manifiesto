import { Redirect, useLocalSearchParams } from 'expo-router'
import { RequireAuth } from '@/components/guards'
import { ModalContentEntrance } from '@/components/ui/modal-content-entrance'
import { CoachModeScreen } from '@/screens/home/coach-mode-screen'

export default function CoachModeRoute() {
  const params = useLocalSearchParams<{ signalId?: string; topic?: string }>()
  const signalId = typeof params.signalId === 'string' ? params.signalId : ''
  const topic = typeof params.topic === 'string' ? params.topic : undefined
  // Sin signalId no hay coach que renderizar; mandamos al usuario de
  // vuelta a insights en lugar de mostrar una pantalla rota. Code
  // review screens-B7.
  if (signalId === '') {
    return <Redirect href="/(app)/(tabs)/insights" />
  }
  return (
    <ModalContentEntrance style={{ flex: 1 }}>
      <RequireAuth>
        {({ userId, familyId }) => (
          <CoachModeScreen
            userId={userId}
            familyId={familyId}
            signalId={signalId}
            topic={topic}
          />
        )}
      </RequireAuth>
    </ModalContentEntrance>
  )
}
