import { Redirect } from 'expo-router'
import { RequireAuth } from '@/components/guards'
import { BlockingScreenView } from '@/components/ui/blocking-screen-view'
import { FamilyAdminScreen } from '@/screens/settings/family-admin-screen'
import { useMyFamilyRole } from '@/features/family/use-my-family-role'

interface GuardedProps {
  userId: string
  familyId: string
  familyCode: string
}

function OwnerGuarded({ userId, familyId, familyCode }: GuardedProps) {
  const roleQuery = useMyFamilyRole(userId, familyId)

  if (roleQuery.isLoading) {
    return <BlockingScreenView message="Verificando permisos..." />
  }

  // Any non-owner viewer gets bounced back to the main settings screen.
  if (roleQuery.data !== 'owner') {
    return <Redirect href="/(app)/settings" />
  }

  return <FamilyAdminScreen userId={userId} familyCode={familyCode} />
}

export default function FamilyAdminRoute() {
  return (
    <RequireAuth>
      {({ userId, familyId, familyCode }) => (
        <OwnerGuarded userId={userId} familyId={familyId} familyCode={familyCode} />
      )}
    </RequireAuth>
  )
}
