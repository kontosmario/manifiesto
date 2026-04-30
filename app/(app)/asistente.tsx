import { RequireAuth } from '@/components/guards'
import { ModalContentEntrance } from '@/components/ui/modal-content-entrance'
import { AsistenteScreen } from '@/screens/home/asistente-screen'

export default function AsistenteRoute() {
  return (
    <ModalContentEntrance style={{ flex: 1 }}>
      <RequireAuth>
        {({ userId, familyId }) => (
          <AsistenteScreen userId={userId} familyId={familyId} />
        )}
      </RequireAuth>
    </ModalContentEntrance>
  )
}
