import { RequireAuth } from '@/components/guards'
import { AsistenteScreen } from '@/screens/home/asistente-screen'

export default function AsistenteRoute() {
  return (
    <RequireAuth>
      {({ userId, familyId }) => (
        <AsistenteScreen userId={userId} familyId={familyId} />
      )}
    </RequireAuth>
  )
}
