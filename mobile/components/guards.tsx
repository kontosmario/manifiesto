import type { ReactNode } from 'react'
import { Redirect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { BlockingScreenView } from '@/components/ui/blocking-screen-view'
import { useAppLockState } from '@/features/auth/app-lock-state'
import { authFlowLog } from '@/lib/auth-flow-logger'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useFamily } from '@/features/family/use-family'
import { useMyProfile } from '@/features/profile/use-profile'

interface RequireAuthProps {
  children: (input: {
    userId: string
    familyId: string
  }) => ReactNode
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { t } = useTranslation()
  const sessionQuery = useAuthSession()
  const session = sessionQuery.data ?? null
  const userId = session?.user.id
  const familyQuery = useFamily(userId)
  const family = familyQuery.data ?? null
  const profileQuery = useMyProfile(userId)
  // J-Auth1 defense-in-depth — if `AppEntryGate` is the single source of
  // truth for the lock gate, why bother here? Because a notification tap
  // or deep link can race the relock watcher's `router.replace('/')` and
  // mount a `RequireAuth`-wrapped screen while `isAppUnlocked === false`.
  // Redirect back to `/` so AppEntryGate gets a chance to send the user
  // to the lock screen. The pending notification route is preserved by
  // `notification-pending-route` and flushed after unlock.
  const isUnlocked = useAppLockState()
  const isLoading =
    sessionQuery.isLoading ||
    (Boolean(userId) && familyQuery.isLoading) ||
    (Boolean(userId) && profileQuery.isLoading)

  if (isLoading) {
    authFlowLog('require-auth', 'render BlockingScreenView (loading)')
    return <BlockingScreenView message={t('states:loading.preparingSpace')} />
  }

  if (!session || !userId) {
    authFlowLog('require-auth', 'redirect /(auth)/welcome (no session)')
    return <Redirect href="/(auth)/welcome" />
  }

  if (!isUnlocked) {
    authFlowLog('require-auth', 'redirect / (locked)')
    return <Redirect href="/" />
  }

  // First-login onboarding wizard. Once the user finishes, the mutation
  // flips `onboarding_completed_at` and we fall through to the normal
  // family/home flow.
  if (profileQuery.data && !profileQuery.data.onboarding_completed_at) {
    return <Redirect href="/(app)/onboarding" />
  }

  if (!family) {
    return <Redirect href="/(auth)/join" />
  }

  return children({
    userId,
    familyId: family.familyId,
  })
}

export function RequireGuest({
  // Accepted for backward compatibility — no longer affects routing.
  // El BootScreen (destino del redirect de abajo, vía máquina auth-flow)
  // es el single source of truth del ruteo con sesión (lock /
  // onboarding / join / home), así que este flag es no-op aquí.
  allowFamilylessSession: _allowFamilylessSession = false,
  children,
}: {
  allowFamilylessSession?: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  const sessionQuery = useAuthSession()
  const session = sessionQuery.data ?? null
  const isUnlocked = useAppLockState()

  if (sessionQuery.isLoading) {
    authFlowLog('require-guest', 'render BlockingScreenView (loading)')
    return <BlockingScreenView message={t('states:loading.preparingSession')} />
  }

  // Route signed-in + UNLOCKED users through AppEntryGate (the `/` index)
  // so the onboarding check, family check, and home routing are all
  // decided in ONE place. Previously this redirected straight to
  // home/join, which let a user bypass the lock screen by navigating
  // through any guest route.
  //
  // CRÍTICO (fix loop infinito 2026-06-11): NO redirigir si el user
  // está locked. Razón: si UnlockScreen cancela FaceID y bouncea a
  // /(auth)/login, y RequireGuest redirige a `/`, AppEntryGate detecta
  // locked + biometric → vuelve a /(auth)/unlock → auto-fires FaceID
  // → user cancela → loop infinito.
  //
  // Locked users con session pueden acceder a guest routes para entrar
  // con password (que es válido como método de auth). Los protected
  // routes siguen bloqueados por RequireAuth que valida AMBOS session
  // Y isAppUnlocked. La seguridad se preserva en RequireAuth, no aquí.
  if (session && isUnlocked) {
    authFlowLog('require-guest', 'redirect / (session + unlocked)')
    return <Redirect href="/" />
  }

  authFlowLog('require-guest', 'render children', { hasSession: Boolean(session), isUnlocked })
  return children
}
