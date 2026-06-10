import { useEffect, useRef } from 'react'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useMyProfile } from '@/features/profile/use-profile'
import { saveLastUserProfile } from '@/lib/last-user-cache'

/**
 * Persists the signed-in user's email + display name + avatar slug to
 * a SecureStore-backed cache so the next login screen can render the
 * personalized hero (Hola, [name] + their AvatarAnimal) without needing
 * a network round-trip — and even before the user re-authenticates.
 *
 * Mounted high in the tree (AppStackShell) so it runs whenever the
 * session is hot. Sign-out is handled inside `useAuthSession`'s
 * `SIGNED_OUT` branch, which clears the cache directly.
 */
export function useLastUserProfileSync() {
  const session = useAuthSession()
  const userId = session.data?.user.id
  const email = session.data?.user.email
  const profileQuery = useMyProfile(userId)
  const profile = profileQuery.data

  // Avoid hammering SecureStore on every re-render — only write when
  // the persisted shape actually changes.
  const lastWrittenRef = useRef<string | null>(null)

  useEffect(() => {
    if (!email) return

    const payload = {
      email,
      displayName: profile?.display_name ?? null,
      avatarSlug: profile?.avatar_animal ?? null,
      // J-Auth2: forward the pending-deletion timestamp so the
      // welcome-screen banner can read it from SecureStore without a
      // network round-trip.
      deletionScheduledAt: profile?.deletion_scheduled_at ?? null,
    }
    const fingerprint = JSON.stringify(payload)
    if (lastWrittenRef.current === fingerprint) return
    lastWrittenRef.current = fingerprint

    void saveLastUserProfile(payload)
  }, [
    email,
    profile?.display_name,
    profile?.avatar_animal,
    profile?.deletion_scheduled_at,
  ])
}
