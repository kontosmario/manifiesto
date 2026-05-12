import { RequireAuth } from '@/components/guards'
import { EditionsScreen } from '@/screens/settings/editions-screen'

export default function EditionsRoute() {
  return (
    <RequireAuth>
      {() => <EditionsScreen />}
    </RequireAuth>
  )
}
