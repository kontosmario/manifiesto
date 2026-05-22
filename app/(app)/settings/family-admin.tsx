import { Redirect } from 'expo-router'
import { RequireAuth } from '@/components/guards'
import { BlockingScreenView } from '@/components/ui/blocking-screen-view'
import { FamilyAdminScreen } from '@/screens/settings/family-admin-screen'
import { useIsSolo } from '@/features/family/use-is-solo'
import { useMyFamilyRole } from '@/features/family/use-my-family-role'

interface GuardedProps {
  userId: string
  familyId: string
}

function OwnerGuarded({ userId, familyId }: GuardedProps) {
  const roleQuery = useMyFamilyRole(userId, familyId)
  const isSolo = useIsSolo(userId)

  if (isSolo) {
    return <Redirect href="/(app)/settings" />
  }

  if (roleQuery.isLoading) {
    return <BlockingScreenView message="Verificando permisos..." />
  }

  // Any non-owner viewer gets bounced back to the main settings screen.
  if (roleQuery.data !== 'owner') {
    return <Redirect href="/(app)/settings" />
  }

  return <FamilyAdminScreen userId={userId} />
}

export default function FamilyAdminRoute() {
  return (
    <RequireAuth>
      {({ userId, familyId }) => (
        <OwnerGuarded userId={userId} familyId={familyId} />
      )}
    </RequireAuth>
  )
}
