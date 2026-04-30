import { useLocalSearchParams } from 'expo-router'
import { RequireAuth } from '@/components/guards'
import { CoachModeScreen } from '@/screens/home/coach-mode-screen'

export default function CoachModeRoute() {
  const params = useLocalSearchParams<{ signalId?: string; topic?: string }>()
  const signalId = typeof params.signalId === 'string' ? params.signalId : ''
  const topic = typeof params.topic === 'string' ? params.topic : undefined
  return (
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
  )
}
