export async function logoutSession(input: {
  onError: (error: unknown) => void
  onSuccess: () => void
}) {
  const { clearBiometricCredentials } = await import('@/lib/biometric-auth')
  const { supabase } = await import('@/lib/supabase')
  const { resetAppLock } = await import('@/features/auth/app-lock-state')
  const { clearLastUserProfile } = await import('@/lib/last-user-cache')
  const { resetAllTours } = await import('@/features/tours/persistence')
  const { clearAllTourPending } = await import('@/features/tours/tour-pending-store')
  const { deletePersistentValue } = await import('@/lib/persistent-kv')
  const { clearBiometricSetupShown } = await import(
    '@/features/auth/biometric-setup-flag'
  )
  const { clearPendingNotificationRoute } = await import(
    '@/lib/notification-pending-route'
  )

  // Capture userId BEFORE signOut so we can namespace the per-user
  // flag clear. After signOut the session is null and we'd lose
  // the ability to target the right key.
  const sessionResponse = await supabase.auth.getSession()
  const userId = sessionResponse.data.session?.user.id ?? null

  // Sprint J · J-Mobile1 — Borrar el token Expo Push del backend ANTES
  // de signOut(). El DELETE necesita el JWT del usuario para pasar RLS
  // (`auth.uid() = user_id`); si lo corremos después de signOut, la
  // request va anónima → RLS rechaza → encolamos retry → al próximo
  // login (otro user) el retry tampoco matchea RLS → no-op silencioso.
  // best-effort: si falla, no bloqueamos el logout (queda encolado
  // para retry en el próximo cold start vía flushPendingPushTokenCleanup).
  if (userId) {
    const { tearDownPushNotifications } = await import('@/lib/push-notifications')
    try {
      await tearDownPushNotifications(userId)
    } catch {
      // best-effort
    }
  }

  const { error } = await supabase.auth.signOut()

  if (error) {
    input.onError(error)
    return
  }

  // Atomic cleanup: await every persisted artifact of the previous
  // session BEFORE handing control back via onSuccess. The SIGNED_OUT
  // handler in `use-auth-session` also fires these clears, but its
  // calls are fire-and-forget and race against the next screen's
  // mount — clearing them here with explicit awaits eliminates the
  // window where the login screen could read stale data (e.g. the
  // previous user's avatar/name from the last-user cache).
  const { clearPin } = await import('@/lib/pin-lock')
  await clearBiometricCredentials()
  await clearPin()
  await clearLastUserProfile()
  // Tours device-local cleanup:
  //   • `resetAllTours()` clears only `tours-disabled` (the per-user
  //     "seen" flags moved to backend on 2026-05-27; backend persists
  //     across sessions/devices, so we don't touch them on logout)
  //   • `clearAllTourPending()` wipes every `tour-seen-pending.<key>`.
  //     Critical: without this, a pending flag from user A would be
  //     drained on user B's next launch under user B's auth.uid(),
  //     marking user B as having seen a tour they never saw.
  //   • `tour-seen.migration-v2-done` is cleared so the one-shot
  //     legacy migration re-evaluates against the next user's device
  //     state (e.g. iCloud restore of SecureStore left flags from
  //     another install)
  //   • `tours-backfill-done` was the pre-2026-05-27 device-local
  //     backfill flag; we delete it defensively in case of leftover
  //     residuals from a stale install
  await resetAllTours()
  await clearAllTourPending()
  await deletePersistentValue('tour-seen.migration-v2-done')
  await deletePersistentValue('tours-backfill-done')
  // Pre-onboarding biometric-setup flag (per-user). If the user
  // signed out mid-onboarding without seeing the screen, they should
  // see it again on the next login.
  if (userId) {
    await clearBiometricSetupShown(userId)
  }
  // Sprint L · Audit #5 L-2 (2026-06-10): clear any pending push-tap
  // route BEFORE `resetAppLock()` so the next unlock (post-login on a
  // shared device) cannot drain user A's queued deep link into user B's
  // session. Must run pre-`resetAppLock()` because that call eventually
  // triggers an unlock transition, and the bridge listens for the
  // locked→unlocked edge to flush pendingRoute.
  clearPendingNotificationRoute()
  // Re-arm the app-lock gate so the next session (if a different
  // user signs in on the same device, or the same user signs back
  // in) goes through the biometric re-confirmation again.
  resetAppLock()
  input.onSuccess()
}
