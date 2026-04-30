import { RequireAuth } from '@/components/guards'
import { AsistentePreferencesScreen } from '@/screens/settings/asistente-preferences-screen'

export default function AsistentePreferencesRoute() {
  return (
    <RequireAuth>
      {({ userId }) => <AsistentePreferencesScreen userId={userId} />}
    </RequireAuth>
  )
}
